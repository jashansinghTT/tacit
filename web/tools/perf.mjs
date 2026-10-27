// First-load metrics for a page: FCP, LCP, CLS, JS transferred, and when the hero canvas appears.
//   node tools/perf.mjs <base> [path]
import { chromium } from '@playwright/test'
const [base = 'http://127.0.0.1:5718', path = '/'] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
let js = 0
const chunks = []
page.on('response', async (r) => {
  if (r.url().endsWith('.js')) {
    const len = Number(r.headers()['content-length'] ?? 0) || (await r.body().catch(() => Buffer.alloc(0))).length
    js += len
    chunks.push(`${r.url().split('/').pop()} ${(len / 1024).toFixed(0)}k`)
  }
})
await page.addInitScript(() => {
  window.__cls = 0
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value })).observe({ type: 'layout-shift', buffered: true })
  new PerformanceObserver((l) => { const e = l.getEntries(); window.__lcp = e[e.length - 1].startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
})
const t0 = Date.now()
await page.goto(base + path, { waitUntil: 'load' })
const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime)
await page.locator('canvas').first().waitFor({ timeout: 30000 }).catch(() => undefined)
const canvasAt = Date.now() - t0
await page.waitForTimeout(3000)
const m = await page.evaluate(() => ({ cls: window.__cls, lcp: window.__lcp }))
console.log(JSON.stringify({ path, fcp_ms: Math.round(fcp ?? -1), lcp_ms: Math.round(m.lcp ?? -1), cls: Number((m.cls ?? 0).toFixed(4)), canvas_ms: canvasAt, js_kb: Math.round(js / 1024) }))
console.log(chunks.join(', '))
await browser.close()
