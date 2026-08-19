/**
 * The WebSocket port the operator actually bound.
 *
 * Tests used to guess one: `const WS_PORT = 52000 + Math.floor(Math.random()
 * * 400)`, with a hand-assigned band per file so that files running in
 * parallel would not land on each other. A guess can be wrong in two ways.
 * Another process may already hold the port (EADDRINUSE), or the OS may
 * refuse it outright — Windows reserves blocks of ports for Hyper-V, WSL and
 * Docker, and binding one fails with EACCES while the module is still being
 * required, so the file dies before a single test runs. On one machine those
 * reservations covered 81% of one file's band and 66% of another's, and both
 * files failed on almost every run.
 *
 * Setting `WS_PORT=0` asks the OS for a free port instead. It cannot collide,
 * it cannot be reserved, and it needs no coordination between files. server.js
 * binds it while the test requires the module; this reads back what it got.
 */

const { once } = require('node:events');

function server() {
  // server.js is already in the require cache — the test loaded it after
  // setting WS_PORT — so this hands back that same instance rather than
  // starting a second one.
  const { getWss } = require('../../server.js');
  const wss = getWss();
  if (!wss) {
    throw new Error('No WebSocket server to read a port from: this test sets DISABLE_WS');
  }
  return wss;
}

/**
 * The bound port. Valid once the server is listening, which it is by the time
 * a test body runs — `before` hooks await startServer() first.
 */
function wsPort() {
  const address = server().address();
  if (!address) {
    throw new Error('The WebSocket server is not listening yet — await whenWsReady() before reading its port');
  }
  return address.port;
}

/** `ws://127.0.0.1:<bound port>`, the address a client connects to. */
function wsUrl() {
  return `ws://127.0.0.1:${wsPort()}`;
}

/** Await this in a `before` hook if the port is needed during setup. */
async function whenWsReady() {
  const wss = server();
  if (!wss.address()) await once(wss, 'listening');
  return wss.address().port;
}

module.exports = { wsPort, wsUrl, whenWsReady };
