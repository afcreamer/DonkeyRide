#!/usr/bin/env node

/**
 * The live suite: the tests that are allowed to contact the outside world.
 *
 * LIVE_RELAY_URL gets a default here rather than in the test file, because
 * the test file's empty default is what keeps these inert during `npm test`
 * and in CI. Asking for test:live IS the explicit choice to reach a relay.
 *
 * LIVE_LN_ADDRESS deliberately gets NO default — resolving a Lightning
 * Address contacts a third-party wallet service, which must be named by the
 * person running it. settlement-live.test.js stays skipped without it.
 *
 * A `VAR=value cmd` prefix in package.json would have been a POSIX-shell
 * ism, unavailable in the cmd.exe that npm uses on Windows.
 *
 * Usage: node tests/helpers/run-live-tests.js   (via npm run test:live)
 */

const path = require('node:path');
const { readdirSync } = require('node:fs');
const { spawn } = require('node:child_process');

const repoRoot = path.join(__dirname, '..', '..');
const liveDir = path.join(repoRoot, 'tests', 'live');

const files = readdirSync(liveDir)
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => `tests/live/${name}`);

if (files.length === 0) {
  console.error('No live test files found');
  process.exit(1);
}

const child = spawn(
  process.execPath,
  ['--test', '--test-force-exit', ...files],
  {
    stdio: 'inherit',
    cwd: repoRoot,
    env: {
      ...process.env,
      LIVE_RELAY_URL: process.env.LIVE_RELAY_URL || 'wss://relay.trotters.cc'
    }
  }
);

child.once('error', (error) => {
  console.error(`Unable to start the live test runner: ${error.message}`);
  process.exit(1);
});
child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
