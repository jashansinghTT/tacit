/**
 * Playwright config for the browser E2E flows (web/e2e/flows.spec.ts) on the real stack.
 *
 * scripts/e2e/ui.sh copies this file and web/e2e/flows.spec.ts into web/e2e/ of a throwaway merge of the web
 * branches, builds and serves that app with `vite preview` (proxied to the backend on 8710), and runs it there.
 * QA_REPO points at the QA worktree, where the evidence goes.
 *
 * Chromium's fake capture devices feed the camera and microphone from ~/tacit/data/e2e (scripts/e2e/make_media.sh).
 */
import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

const repo = process.env.QA_REPO ?? path.resolve(here, '../..')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
const runId = process.env.QA_RUN_ID ?? `${stamp}-ui`
export const runDir = path.join(repo, '.orchestration/evidence/qa/runs', runId)
process.env.QA_UI_RUN_DIR = runDir
process.env.QA_E2E_MEDIA ??= path.join(os.homedir(), 'tacit/data/e2e')
const media = process.env.QA_E2E_MEDIA

/** Chromium fake camera and microphone; F4 launches its own browser with the practice files. */
const fakeCapture = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  `--use-file-for-fake-video-capture=${path.join(media, 'capture.y4m')}`,
  `--use-file-for-fake-audio-capture=${path.join(media, 'answer.wav')}`,
  '--autoplay-policy=no-user-gesture-required',
]

export default defineConfig({
  testDir: here,
  testMatch: 'flows.spec.ts',
  outputDir: path.join(runDir, 'artifacts'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 20 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: path.join(runDir, 'results.json') }]],
  use: {
    baseURL: process.env.QA_WEB_URL ?? 'http://127.0.0.1:5790',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: process.env.QA_TRACE ? 'retain-on-failure' : 'off',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    permissions: ['camera', 'microphone'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { args: fakeCapture } } }],
})
