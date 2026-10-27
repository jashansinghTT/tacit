// Streams a sample clip through the live capture pipeline and screenshots it (real or mock).
import { chromium } from '@playwright/test'
const [S, base = 'http://127.0.0.1:5712', ms = '20000'] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(base + '/studio?source=sample' + (base.includes('5712') ? '' : '&title=' + encodeURIComponent('QA studio sample stream (tacit-web)')), { waitUntil: 'networkidle' })
await page.locator('[data-testid^="sample-"]').first().waitFor()
await page.screenshot({ path: `${S}/studio-sample-pick.png` })
await page.getByTestId('capture-start').click()
await page.waitForTimeout(Number(ms))
await page.screenshot({ path: `${S}/studio-sample-live.png` })
const href = await page.getByTestId('capture-stop').click().then(async () => {
  await page.getByTestId('open-skill').waitFor({ timeout: 60000 })
  return page.getByTestId('open-skill').getAttribute('href')
})
console.log('skill', href)
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
await browser.close()
