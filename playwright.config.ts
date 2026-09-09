import { defineConfig, devices } from '@playwright/test';

/**
 * The dev server port.
 *
 * Set OFFICEWRITE_TEST_PORT when another app occupies the default port.
 * Reusing a manually started Officewrite harness requires the explicit
 * OFFICEWRITE_REUSE_TEST_SERVER=1 opt-in, so other apps cannot be adopted.
 */
const PORT = Number(process.env.OFFICEWRITE_TEST_PORT ?? 5173);
const BASE_URL = `http://localhost:${PORT}/test.html`;

/**
 * Some CI images pre-provision a browser whose revision does not match the
 * pinned Playwright version. Point at it explicitly rather than downloading a
 * second copy. Unset by default, so normal runs are unaffected.
 */
const executablePath = process.env.OFFICEWRITE_CHROMIUM_PATH || undefined;

export default defineConfig({
  testIgnore: ['**/electron/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    contextOptions: { reducedMotion: 'reduce' },
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    },
  },
  snapshotPathTemplate: '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{projectName}{ext}',
  webServer: {
    command: `npm run dev:test -- --port ${PORT}`,
    cwd: './apps/desktop',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI && process.env.OFFICEWRITE_REUSE_TEST_SERVER === '1',
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium-desktop',
      testMatch: ['e2e/**/*.spec.ts', 'visual/screens.spec.ts', 'visual/extended.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 860 },
      },
    },
    {
      name: 'chromium-narrow',
      testMatch: ['visual/narrow.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 900, height: 700 },
      },
    },
  ],
  outputDir: 'test-results',
});
