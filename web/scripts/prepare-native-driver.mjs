#!/usr/bin/env node
/**
 * Stage the built web bundle as the DRIVER native shell's webDir.
 *
 * Capacitor copies `dist-native-driver` verbatim into the Android/iOS app,
 * so the staged tree differs from the PWA `dist` in two ways: the download
 * page goes (an installed app offering its own APK is a loop, and store
 * review reads it as off-store distribution), and driver.html becomes the
 * index the WebView opens on launch.
 *
 * This is Node rather than `rm -rf && cp -r` in package.json because npm
 * runs scripts through cmd.exe on Windows, where those are not commands.
 *
 * Usage: node scripts/prepare-native-driver.mjs   (via npm run native:driver:prepare)
 */

import { cpSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(webRoot, 'dist');
const staged = join(webRoot, 'dist-native-driver');

if (!existsSync(dist)) {
    console.error(`✖ ${dist} does not exist -- run the web build first (npm run build).`);
    process.exit(1);
}

rmSync(staged, { recursive: true, force: true });
cpSync(dist, staged, { recursive: true });

rmSync(join(staged, 'downloads'), { recursive: true, force: true });
rmSync(join(staged, 'download.html'), { force: true });

const driverHtml = join(staged, 'driver.html');
if (!existsSync(driverHtml)) {
    console.error('✖ driver.html missing from the build output -- the native shell would open a blank WebView.');
    process.exit(1);
}
cpSync(driverHtml, join(staged, 'index.html'));

console.log('✔ staged dist-native-driver (driver.html is the entry point, download page removed)');
