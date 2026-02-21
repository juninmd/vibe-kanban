import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 45_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'PORT=4174 node dist/server.js',
    url: 'http://127.0.0.1:4174/api/state',
    reuseExistingServer: true,
    timeout: 60_000
  }
});
