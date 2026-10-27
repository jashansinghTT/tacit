// Standalone config for the exchange E2E (SPEC section 9, test 6) against the real stack.
// TACIT_E2E_BASE points at whatever serves the app and proxies /api: the backend on :8710 once
// the web build is merged, or a dev server (`TACIT_BACKEND=… npx vite --port 5715`).
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: /exchange\.spec\.ts$/,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: '../test-results/exchange',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.TACIT_E2E_BASE ?? 'http://127.0.0.1:8710',
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--ignore-gpu-blocklist'] },
  },
})
