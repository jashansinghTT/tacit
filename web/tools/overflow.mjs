// Reports horizontal page overflow per route and width (the design bar: no horizontal scroll).
import { chromium } from '@playwright/test'
const base = process.argv[2] ?? 'http://127.0.0.1:5719'
const routes = process.argv.slice(3).length ? process.argv.slice(3) : ['/', '/studio', '/skills', '/skills/sk_sort', '/skills/sk_sort?tab=twin', '/skills/sk_sort?tab=verify', '/skills/sk_sort?tab=audit', '/skills/sk_sort?tab=sop', '/skills/sk_sort?tab=answer', '/box', '/nope']
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
let bad = 0
for (const width of [1024, 1280, 1920]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    const o = await page.evaluate(() => {
      const w = document.documentElement.clientWidth
      const offenders = [...document.querySelectorAll('body *')].filter((el) => {
        const b = el.getBoundingClientRect()
        return b.right > w + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('[class*="overflow-x-auto"], [class*="overflow-hidden"]')
      }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`)
      return { sw: document.documentElement.scrollWidth, w, offenders }
    })
    if (o.sw > o.w) { bad++; console.log(`OVERFLOW ${width} ${r}: ${o.sw} > ${o.w}`, o.offenders) }
  }
  await page.close()
}
console.log(bad ? `${bad} overflowing views` : 'no horizontal overflow')
await browser.close()
