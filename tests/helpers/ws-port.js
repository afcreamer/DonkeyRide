/**
 * The address of the operator's WebSocket server, as a test client sees it.
 *
 * Tests used to guess the port: `const WS_PORT = 52000 +
 * Math.floor(Math.random() * 400)`, with a hand-assigned band per file so that
 * files running in parallel would not land on each other. A guess can be wrong
 * in two ways. Another process may already hold the port (EADDRINUSE), or the
 * OS may refuse it outright — Windows reserves blocks of ports for Hyper-V,
 * WSL and Docker, and binding one fails with EACCES while the module is still
 * being required, so the file dies before a single test runs. On one machine
 * those reservations covered 81% of one file's band and 66% of another's, and
 * both files failed on almost every run.
 *
 * Tests set `WS_PORT=0` instead, which asks the OS for a free port: it cannot
 * collide, it cannot be reserved, and it needs no coordination between files.
 * server.js binds it while the test requires the module, and this reads back
 * what it got.
 */

function wsUrl() {
  // server.js is already in the require cache — the test loaded it after
  // setting WS_PORT — so this hands back that same instance rather than
  // starting a second one.
  const { getWss } = require('../../server.js');
  const wss = getWss();
  if (!wss) {
    throw new Error('No WebSocket server to address: this test sets DISABLE_WS');
  }

  const address = wss.address();
  if (!address) {
    throw new Error('The WebSocket server is not listening yet, so it has no port to address');
  }
  return `ws://127.0.0.1:${address.port}`;
}

module.exports = { wsUrl };
