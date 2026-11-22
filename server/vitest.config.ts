import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // One mongodb-memory-server for the whole run; each test file gets its own database.
    globalSetup: ['./src/test/globalSetup.ts'],
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    // Tests read OTP codes from the API response (explicit opt-in; rejected in production).
    env: { DEV_OTP_ECHO: '1' },
  },
});
