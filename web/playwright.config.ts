import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

/**
 * Smoke and screenshot suites. By default they run against the in-app mock backend
 * (VITE_TACIT_MOCK=1 dev server on 5719). Set TACIT_E2E_BASE (for example http://127.0.0.1:8710
 * for the built app on the real stack, or http://127.0.0.1:5710 for the dev server) to run the
 * same tests against the real backend.
 */
const real = process.env.TACIT_E2E_BASE
const base = real ?? 'http://127.0.0.1:5719'
const media = fileURLToPath(new URL('./e2e/.media/', import.meta.url))

export default defineConfig({
  testDir: './e2e',
  timeout: real ? 120_000 : 60_000,
  expect: { timeout: real ? 20_000 : 10_000 },
  fullyParallel: false,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: base,
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      args: [
        '--enable-unsafe-swiftshader',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-video-capture=${media}capture.mjpeg`,
        `--use-file-for-fake-audio-capture=${media}answer.wav`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
    permissions: ['camera', 'microphone'],
  },
  projects: [
    { name: 'smoke', testIgnore: /screenshots\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'screenshots', testMatch: /screenshots\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: real
    ? undefined
    : {
        command: 'npx vite --port 5719 --strictPort',
        env: { VITE_TACIT_MOCK: '1' },
        url: 'http://127.0.0.1:5719',
        reuseExistingServer: true,
        timeout: 60_000,
      },
})
