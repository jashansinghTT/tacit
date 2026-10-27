// Probe: list a page's buttons, tabs and test ids, and save a screenshot.
import { launch, capturePage } from '../lib/browser.mjs'
const [url, out, persona] = process.argv.slice(2)
const browser = await launch()
const { page } = await capturePage(browser, { dpr: 1, persona })
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
const items = await page.evaluate(() => [...document.querySelectorAll('button, [role=tab], [data-testid], [data-tour]')].map((e) => {
  const r = e.getBoundingClientRect()
  return `${e.tagName.toLowerCase()} ${e.dataset.testid ? 'tid=' + e.dataset.testid : ''} ${e.dataset.tour ? 'tour=' + e.dataset.tour : ''} "${(e.innerText || '').trim().slice(0, 40).replace(/\n/g, ' ')}" @${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`
}).filter((s) => !s.includes('@0,0 0x0')))
console.log(items.join('\n'))
await page.screenshot({ path: out, fullPage: true })
await browser.close()
