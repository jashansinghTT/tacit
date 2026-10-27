// Tabs through a page and reports each focus stop: element, label, and whether a focus indicator
// is visible (outline or box-shadow change versus unfocused).
import { chromium } from '@playwright/test'
const [base = 'http://127.0.0.1:5719', path = '/', stops = '40'] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(base + path, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
let noRing = 0
for (let i = 0; i < Number(stops); i++) {
  await page.keyboard.press('Tab')
  await page.waitForTimeout(220) // let box-shadow focus transitions finish
  const r = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return null
    const cs = getComputedStyle(el)
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0
    // a ring on the element or on a card around it (has-[:focus-visible])
    let ringed = outline || cs.boxShadow.includes('60, 215, 255') || cs.boxShadow.includes('rgb(60')
    let p = el.parentElement
    for (let k = 0; k < 4 && p && !ringed; k++, p = p.parentElement) ringed = getComputedStyle(p).boxShadow.includes('60, 215, 255')
    const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 50)
    return { tag: el.tagName.toLowerCase(), label, ringed, inner: Boolean(el.querySelector('[class*="group-focus-visible"]')) }
  })
  if (!r) continue
  if (!r.ringed && !r.inner) noRing++
  console.log(`${String(i + 1).padStart(2)} ${r.ringed || r.inner ? 'ok  ' : 'NONE'} ${r.tag} ${r.label}`)
}
console.log(noRing ? `${noRing} stops without a visible ring` : 'every stop shows focus')
await browser.close()
