import { defineConfig, devices } from '@playwright/test';

const port = 4180;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/direct-*.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL,
    locale: 'en-GB',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{
    name: 'direct-mobile-chromium',
    use: {
      ...devices['Pixel 7'],
      viewport: { width: 390, height: 844 },
    },
  }],
  webServer: {
    // See playwright.config.ts: the build/serve environment moves into the
    // script so the command does not depend on a POSIX shell.
    command: `node scripts/e2e-webserver.mjs direct ${port}`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
