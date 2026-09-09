import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.OFFICEWRITE_WEB_TEST_PORT ?? 5193);

export default defineConfig({
  testDir: './tests/web',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [['list']],
  outputDir: 'test-results/web',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${port}/app/`,
    viewport: { width: 1280, height: 860 },
    ...(process.env.OFFICEWRITE_CHROMIUM_PATH ? {
      launchOptions: { executablePath: process.env.OFFICEWRITE_CHROMIUM_PATH },
    } : {}),
  },
  webServer: {
    command: `npx vite docs --host localhost --port ${port} --strictPort`,
    url: `http://localhost:${port}/app/`,
    reuseExistingServer: false,
  },
});
