// Quick full-page screenshot for design iteration:
//   node tools/shot.mjs /path out.png [width] [waitMs] [--viewport]
import { chromium } from '@playwright/test'

const [path = '/', out = 'shot.png', width = '1440', wait = '2500', mode] = process.argv.slice(2)
const base = process.env.SHOT_BASE ?? 'http://127.0.0.1:5719'
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1 })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(base + path, { waitUntil: 'networkidle' })
await page.waitForTimeout(Number(wait))
if (mode !== '--viewport') {
  // scroll through so lazy/in-view content renders
  const h = await page.evaluate(() => document.body.scrollHeight)
  for (let y = 0; y < h; y += 700) {
    await page.evaluate((y) => window.scrollTo(0, y), y)
    await page.waitForTimeout(120)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(600)
}
await page.screenshot({ path: out, fullPage: mode !== '--viewport' })
console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors')
await browser.close()
