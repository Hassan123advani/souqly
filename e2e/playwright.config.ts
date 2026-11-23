import { defineConfig, devices } from '@playwright/test';

// Dedicated ports so the suite never collides with a normal `npm run dev` (4000/5173)
// or other local apps. The API boots an in-memory MongoDB and auto-seeds demo data.
export const API_PORT = 4610;
export const WEB_PORT = 5610;
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './tests',
  // One worker: every spec shares the same in-memory DB, and the machine is memory-constrained.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    locale: 'en-US',
    timezoneId: 'Asia/Karachi',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npx tsx src/index.ts',
      cwd: '../server',
      url: `${API_URL}/api/v1/health`,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        PORT: String(API_PORT),
        NODE_ENV: 'development',
        DEV_OTP_ECHO: '1',
        CLIENT_URL: WEB_URL,
        // Force the in-memory DB even if server/.env points somewhere else.
        MONGODB_URI: '',
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: '../client',
      url: WEB_URL,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
      env: { VITE_API_PROXY: API_URL },
    },
  ],
});
