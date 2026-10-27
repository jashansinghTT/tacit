// Lists layout shifts on a page load with the elements that moved.
import { chromium } from '@playwright/test'
const [base = 'http://127.0.0.1:5718', path = '/'] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.addInitScript(() => {
  window.__shifts = []
  new PerformanceObserver((l) => l.getEntries().forEach((e) => {
    if (e.hadRecentInput) return
    window.__shifts.push({ t: Math.round(e.startTime), v: Number(e.value.toFixed(4)), src: (e.sources || []).map((s) => {
      const n = s.node
      const d = n && n.nodeType === 1 ? `${n.tagName.toLowerCase()}.${String(n.className).slice(0, 70)}` : n ? n.nodeName : '?'
      return `${d} ${JSON.stringify([s.previousRect.y, s.previousRect.height])}->${JSON.stringify([s.currentRect.y, s.currentRect.height])}`
    }) })
  })).observe({ type: 'layout-shift', buffered: true })
})
await page.goto(base + path, { waitUntil: 'load' })
await page.waitForTimeout(4000)
console.log(JSON.stringify(await page.evaluate(() => window.__shifts), null, 1))
await browser.close()
