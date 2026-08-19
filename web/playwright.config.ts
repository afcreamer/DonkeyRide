import { defineConfig, devices } from '@playwright/test';

const HTTP_PORT = 4178;
const WS_PORT = 4179;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${HTTP_PORT}`;
const useLocalServer = !process.env.PLAYWRIGHT_SKIP_WEBSERVER;

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/direct-*.spec.ts', '**/live-production.spec.ts'],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    geolocation: { latitude: 53.4808, longitude: -2.2426 },
    permissions: ['geolocation', 'notifications'],
    locale: 'en-GB',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'small-mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 360, height: 640 },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: useLocalServer ? {
    // Build and operator environment live in the script: a `VAR=value cmd`
    // chain here would be run by cmd.exe on Windows, which has no such form.
    command: `node scripts/e2e-webserver.mjs managed ${HTTP_PORT} ${WS_PORT}`,
    url: `${baseURL}/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  } : undefined,
});
