#!/usr/bin/env node
/**
 * Build the PWA for a browser run, then start the server the specs drive.
 *
 * Playwright's `webServer.command` goes through a shell, and both configs
 * used `VITE_x=y npm run build && … node server.js`. cmd.exe has no
 * `VAR=value cmd` form, so on Windows the run died before the first spec
 * with "'VITE_COORDINATION_MODE' is not recognized". Environment variables
 * are set here instead, where they mean the same thing on every platform.
 *
 * Two modes, matching the two configs:
 *   managed — the real Express operator, built in managed coordination mode
 *   direct  — a static PWA server, built in direct mode with no operator
 *
 * Usage: node scripts/e2e-webserver.mjs managed <httpPort> <wsPort>
 *        node scripts/e2e-webserver.mjs direct  <httpPort>
 */

import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(webRoot);

const [mode, httpPort, wsPort] = process.argv.slice(2);

if (mode !== 'managed' && mode !== 'direct') {
  console.error('Usage: e2e-webserver.mjs managed <httpPort> <wsPort> | direct <httpPort>');
  process.exit(2);
}
if (!httpPort || (mode === 'managed' && !wsPort)) {
  console.error(`Missing port argument for ${mode} mode`);
  process.exit(2);
}

const buildEnv = mode === 'managed'
  ? {
    VITE_COORDINATION_MODE: 'managed',
    VITE_WS_URL: `ws://127.0.0.1:${wsPort}`
  }
  : {
    VITE_COORDINATION_MODE: 'direct',
    VITE_NOSTR_RELAYS: 'wss://relay.test',
    VITE_PUBLIC_ROUTING_URL: '/routing'
  };

// npm is npm.cmd on Windows, which Node refuses to spawn without a shell.
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const build = spawnSync(npm, ['run', 'build'], {
  cwd: webRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, ...buildEnv }
});

if (build.error) {
  console.error(`Unable to run the web build: ${build.error.message}`);
  process.exit(1);
}
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const server = mode === 'managed'
  ? {
    script: join(repoRoot, 'server.js'),
    cwd: repoRoot,
    env: {
      PORT: httpPort,
      WS_PORT: wsPort,
      NODE_ENV: 'test',
      PAYMENT_PROVIDER: 'cash',
      DISABLE_REDIS: 'true',
      ENABLE_NIP98_AUTH: 'true',
      ENABLE_RATE_LIMITING: 'false',
      OPERATOR_DATA_MODE: 'blind',
      PUBLIC_ROUTING_URL: '/routing',
      // Empty, not absent: a developer's own relays in .env would otherwise
      // pull their live jobs into the run.
      NOSTR_RELAY: '',
      PUBLIC_RELAY_URLS: '',
      REPUTATION_RELAYS: ''
    }
  }
  : {
    script: join(webRoot, 'e2e', 'static-server.mjs'),
    cwd: webRoot,
    env: { STATIC_PWA_PORT: httpPort }
  };

const child = spawn(process.execPath, [server.script], {
  cwd: server.cwd,
  stdio: 'inherit',
  env: { ...process.env, ...server.env }
});

child.once('error', (error) => {
  console.error(`Unable to start the ${mode} server: ${error.message}`);
  process.exit(1);
});
child.once('exit', (code, signal) => {
  process.exit(signal ? 1 : code ?? 1);
});

// Playwright tears the web server down by killing this process; pass that on
// so the server does not outlive the run and hold the port.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
