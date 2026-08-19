#!/usr/bin/env node

/**
 * The default suite: every test file except the live ones, under the
 * deterministic road-router double.
 *
 * This exists because the selection has to be computed before the command
 * can be built, and `$(find ...)` in package.json only works in a POSIX
 * shell — npm runs scripts through cmd.exe on Windows. The file list comes
 * from list-test-files.js, which CI reads too.
 *
 * CI runs each file as its own process instead (see .github/workflows/ci.yml
 * for why); the runner used here is faster for developers.
 *
 * Usage: node tests/helpers/run-tests.js   (via npm test)
 */

const path = require('node:path');
const { spawn } = require('node:child_process');
const { listTestFiles } = require('./list-test-files');

const repoRoot = path.join(__dirname, '..', '..');
const files = listTestFiles();

if (files.length === 0) {
  console.error('No test files found');
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [
    path.join(__dirname, 'run-with-road-router.js'),
    '--',
    process.execPath,
    '--test',
    '--test-force-exit',
    ...files
  ],
  { stdio: 'inherit', cwd: repoRoot }
);

child.once('error', (error) => {
  console.error(`Unable to start the test runner: ${error.message}`);
  process.exit(1);
});
child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
