import { defineConfig, devices } from '@playwright/test';

const PORT = 8099;

/**
 * Web end-to-end tests. They drive the real Expo web build in a real browser (installed Google Chrome, so no browser
 * download is needed). Every test gets a fresh browser context, i.e. empty SQLite/OPFS storage, so tests are independent.
 * Native-only paths (ML Kit OCR, push notifications) are covered by the Maestro flows in .maestro/ instead.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 430, height: 932 } },
    },
  ],
  webServer: {
    command: `npx expo start --web --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'ignore',
    env: { CI: '1', EXPO_NO_TELEMETRY: '1' },
  },
});
