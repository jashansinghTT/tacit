// Runs a quality audit through the UI: uploads a video as a worker's run and waits for the report.
//   node tools/audit-run.mjs <outdir> <base> <skill_id> <video>
import { chromium } from '@playwright/test'
const [S, base, skill, video] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(`${base}/skills/${skill}?tab=audit`, { waitUntil: 'networkidle' })
await page.getByTestId('audit-worker').fill('QA worker (tacit-web test)')
await page.getByTestId('audit-file').setInputFiles(video)
await page.getByTestId('audit-start').click()
await page.getByTestId('processing-panel').waitFor({ timeout: 30000 })
await page.waitForTimeout(4000)
await page.screenshot({ path: `${S}/audit-running.png` })
const t0 = Date.now()
await page.getByTestId('audit-report').waitFor({ timeout: 600000 })
console.log('report after', ((Date.now() - t0) / 1000).toFixed(0), 's')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${S}/audit-report.png`, fullPage: true })
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
await browser.close()
