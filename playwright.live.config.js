import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/live-browser',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
  use: {
    baseURL: 'http://127.0.0.1:4180',
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  projects: [{ name: 'live-iphone-webkit', use: { ...devices['iPhone 13'] } }],
  webServer: {
    command: 'node scripts/serve.mjs',
    env: { PORT: '4180' },
    url: 'http://127.0.0.1:4180',
    reuseExistingServer: false,
    timeout: 15_000
  }
});
