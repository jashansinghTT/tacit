/**
 * Playwright config for the browser E2E flows (web/e2e/flows.spec.ts) on the real stack.
 *
 * Run from a web checkout that has the pages (see scripts/e2e/ui.sh, which builds the merged web branches,
 * serves them with `vite preview` proxied to the backend on 8710, and runs this config):
 *   npx playwright test -c ../scripts/e2e/playwright.config.ts
 *
 * Chromium's fake capture devices feed the camera and microphone from ~/tacit/data/e2e (scripts/e2e/make_media.sh).
 */
import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'

const repo = path.resolve(__dirname, '../..')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
const runId = process.env.QA_RUN_ID ?? `${stamp}-ui`
export const runDir = path.join(repo, '.orchestration/evidence/qa/runs', runId)
process.env.QA_UI_RUN_DIR = runDir
process.env.QA_E2E_MEDIA ??= path.join(os.homedir(), 'tacit/data/e2e')

export default defineConfig({
  testDir: path.join(repo, 'web/e2e'),
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
})
