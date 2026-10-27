// Playwright config for the training use case (Learn, Lesson, Team) against the real stack.
//   npx playwright test -c e2e/learn.config.ts
// LEARN_BASE: the web app (default: the web-learn dev server on 5711, started if not running).
// LEARN_SKILL: the lesson to test (default: the first verified lesson with narration).
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
import { MEDIA_DIR } from './learn.fixtures'

const base = process.env.LEARN_BASE ?? 'http://127.0.0.1:5711'
const web = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  testDir: '.',
  testMatch: 'learn.spec.ts',
  globalSetup: './learn.setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 150_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  outputDir: '../test-results/learn',
  use: {
    baseURL: base,
    viewport: { width: 1440, height: 900 },
    permissions: ['camera', 'microphone'],
    trace: 'retain-on-failure',
    browserName: 'chromium',
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-video-capture=${MEDIA_DIR}/practice.mjpeg`,
        `--use-file-for-fake-audio-capture=${MEDIA_DIR}/question.wav`,
        '--autoplay-policy=no-user-gesture-required',
        '--enable-unsafe-swiftshader',
      ],
    },
  },
  webServer: process.env.LEARN_BASE
    ? undefined
    : { command: 'npm run dev -- --port 5711', cwd: web, url: base, reuseExistingServer: true, timeout: 60_000 },
})
