#!/usr/bin/env node

/**
 * The one source of truth for WHICH files the default suite runs.
 *
 * `npm test` and the CI loop must select the same files — CI once hardcoded
 * tests/integration/*.test.js, so a test in any other directory was silently
 * never run. Both used to spell the selection out as `find tests -name
 * '*.test.js' -not -path 'tests/live/*' | sort`, which kept them in step only
 * for as long as nobody edited one copy. Now both call this, so drift is not
 * something anyone has to remember to avoid.
 *
 * `find` also meant `npm test` could not run on Windows at all. This walks
 * the tree with node:fs instead, and emits forward-slash paths on every
 * platform so the output is stable to compare, sort and paste into a command.
 *
 * Usage:  node tests/helpers/list-test-files.js     (one path per line)
 *         const { listTestFiles } = require('./list-test-files');
 */

const { readdirSync } = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');

// Live tests talk to a real relay and a real LNURL service. They stay out of
// the default suite deliberately; test:live runs them.
const EXCLUDED_DIRS = new Set(['live']);

function walk(absoluteDir, found) {
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const absolute = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(path.relative(path.join(repoRoot, 'tests'), absolute))) {
        walk(absolute, found);
      }
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      found.push(path.relative(repoRoot, absolute).split(path.sep).join('/'));
    }
  }
  return found;
}

function listTestFiles() {
  return walk(path.join(repoRoot, 'tests'), []).sort();
}

if (require.main === module) {
  const files = listTestFiles();
  if (files.length === 0) {
    console.error('No test files found');
    process.exit(1);
  }
  console.log(files.join('\n'));
}

module.exports = { listTestFiles };
