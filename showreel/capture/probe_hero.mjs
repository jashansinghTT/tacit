// Probe: is the landing hero deterministic and smooth on the fake clock, and how fast is a 2x frame?
import { launch, capturePage, recordFrames, APP, DATA } from '../lib/browser.mjs'
const browser = await launch()
const { page } = await capturePage(browser)
await page.clock.install()
await page.goto(APP + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)
const box = await page.locator('canvas').first().boundingBox()
console.log('canvas', box)
await page.clock.pauseAt(Date.now() + 2000)
const t = Date.now()
await recordFrames(page, { dir: `${DATA}/probe/hero`, frames: Number(process.argv[2] || 30), clip: box })
console.log('ms/frame', (Date.now() - t) / Number(process.argv[2] || 30))
await browser.close()
