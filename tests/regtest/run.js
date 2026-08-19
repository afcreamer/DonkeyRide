#!/usr/bin/env node
/**
 * ==========================================
 * Regtest Lightning proof for the LND stake provider.
 *
 * Spins up bitcoind + two LND nodes, opens a channel from payer → operator,
 * then runs driver.js which exercises the REAL money paths:
 *   lock (hodl invoice) → pay → confirm held → release (cancel = refund)
 *   lock → pay → confirm held → forfeit (settle = operator claims penalty)
 *
 * Usage:  npm run test:regtest        (or: node tests/regtest/run.js)
 * Requires: docker compose with a LINUX container runtime (the
 *           polarlightning images are Linux-only), node (repo deps installed)
 * ==========================================
 *
 * This was run.sh. It is Node now for the same reason the rest of the suite
 * is: `npm run test:regtest` went through cmd.exe on Windows, which has no
 * bash, no `mktemp`, no `seq` and no `trap`. Nothing here is emulating a
 * shell — docker is invoked directly with an argv array, so there is no
 * quoting layer to get wrong, and the JSON that run.sh piped through
 * `node -pe` is now just JSON.parse.
 */

const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const regtestDir = __dirname;
const COMPOSE = ['compose', '-f', 'docker-compose.yml'];

let credDir = null;
let tornDown = false;

/** Run docker, returning the result. Throws on failure unless `allowFailure`. */
function docker(args, { allowFailure = false, quiet = true } = {}) {
  const result = spawnSync('docker', args, {
    cwd: regtestDir,
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  });

  if (result.error) {
    throw new Error(`Unable to run docker: ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFailure) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`docker ${args.join(' ')} failed (exit ${result.status})${detail ? `\n${detail}` : ''}`);
  }
  return result;
}

const compose = (args, options) => docker([...COMPOSE, ...args], options);

/** `docker compose exec -T <service> <command...>` — one node's CLI. */
function cli(service, args, options) {
  return compose(['exec', '-T', service, ...args], options);
}

const bitcoinCli = (args, options) => cli(
  'bitcoind',
  ['bitcoin-cli', '-regtest', '-rpcuser=donkey', '-rpcpassword=donkey', ...args],
  options
);
const lncli = (service, args, options) => cli(
  service,
  ['lncli', '--network=regtest', '--lnddir=/home/lnd/.lnd', ...args],
  options
);

const text = (result) => result.stdout.trim();
const json = (result) => JSON.parse(result.stdout);

/** Block the script without burning a core — there is nothing else to do. */
function sleep(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

function waitForLnd(name, service) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (lncli(service, ['getinfo'], { allowFailure: true }).status === 0) {
      console.log(`${name} ready`);
      return;
    }
    sleep(2);
  }
  throw new Error(`${name} did not become ready`);
}

function cleanup() {
  if (tornDown) return;
  tornDown = true;
  console.log('--- tearing down ---');
  try {
    compose(['down', '-v'], { allowFailure: true });
  } catch {
    // Teardown is best effort: the daemon may already be gone.
  }
  if (credDir && existsSync(credDir)) {
    rmSync(credDir, { recursive: true, force: true });
  }
}

function main() {
  console.log('--- starting bitcoind + 2x lnd ---');
  compose(['up', '-d'], { quiet: false });

  console.log('--- waiting for nodes ---');
  sleep(5);
  bitcoinCli(['createwallet', 'miner'], { allowFailure: true });
  const minerAddress = text(bitcoinCli(['getnewaddress']));
  bitcoinCli(['generatetoaddress', '101', minerAddress]);
  waitForLnd('operator', 'lnd-operator');
  waitForLnd('payer', 'lnd-payer');

  console.log('--- funding payer ---');
  const payerAddress = json(lncli('lnd-payer', ['newaddress', 'p2wkh'])).address;
  bitcoinCli(['sendtoaddress', payerAddress, '1']);
  bitcoinCli(['generatetoaddress', '6', minerAddress]);

  // Wait for payer to see funds
  let confirmed = '0';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    confirmed = String(json(lncli('lnd-payer', ['walletbalance'])).confirmed_balance);
    if (confirmed !== '0') break;
    sleep(2);
  }
  console.log(`payer balance: ${confirmed} sats`);

  console.log('--- opening channel payer → operator ---');
  const operatorPubkey = json(lncli('lnd-operator', ['getinfo'])).identity_pubkey;
  lncli('lnd-payer', ['connect', `${operatorPubkey}@lnd-operator:9735`], { allowFailure: true });
  lncli('lnd-payer', ['openchannel', `--node_key=${operatorPubkey}`, '--local_amt=1000000']);
  bitcoinCli(['generatetoaddress', '6', minerAddress]);

  // Wait for channel active
  let active = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    active = json(lncli('lnd-payer', ['listchannels'])).channels.filter((c) => c.active).length;
    if (active === 1) break;
    sleep(2);
  }
  console.log(`channel active: ${active}`);

  console.log('--- extracting credentials ---');
  credDir = mkdtempSync(path.join(os.tmpdir(), 'donkeyride-regtest-'));
  const containerId = (service) => text(compose(['ps', '-q', service]));
  const macaroon = '/home/lnd/.lnd/data/chain/bitcoin/regtest/admin.macaroon';
  for (const [service, prefix] of [['lnd-operator', 'operator'], ['lnd-payer', 'payer']]) {
    const container = containerId(service);
    docker(['cp', `${container}:/home/lnd/.lnd/tls.cert`, path.join(credDir, `${prefix}-tls.cert`)]);
    docker(['cp', `${container}:${macaroon}`, path.join(credDir, `${prefix}-admin.macaroon`)]);
  }

  console.log('--- running stake semantics proof (driver.js) ---');
  const proof = spawnSync(process.execPath, ['driver.js'], {
    cwd: regtestDir,
    stdio: 'inherit',
    env: { ...process.env, CRED_DIR: credDir }
  });

  if (proof.error) {
    throw new Error(`Unable to run driver.js: ${proof.error.message}`);
  }
  return proof.status ?? 1;
}

process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => process.exit(1));
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
}
