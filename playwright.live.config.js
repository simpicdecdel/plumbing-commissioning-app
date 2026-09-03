import { defineConfig, devices } from '@playwright/test';
import { getLiveTestConfig } from './tests/live/live-test-fixture.mjs';

const liveTestConfig = getLiveTestConfig();

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
    env: {
      PORT: '4180',
      PLUMBING_LIVE_TESTS: '1',
      PLUMBING_TEST_SUPABASE_URL: liveTestConfig.supabaseUrl,
      PLUMBING_TEST_SUPABASE_PUBLISHABLE_KEY: liveTestConfig.publishableKey
    },
    url: 'http://127.0.0.1:4180',
    reuseExistingServer: false,
    timeout: 15_000
  }
});
