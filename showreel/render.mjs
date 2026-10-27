// Render the reel (or a time range of it) to 2× JPEG frames.
//
//   node render.mjs --from 0 --to 12 --out ~/tacit/data/showreel/frames/title [--fps 30] [--dpr 2]
//                   [--workers 3] [--shutter 0.5] [--still 12.4]
//
// The reel page renders the film as a pure function of time. For each output frame the page is
// seeked and screenshotted; where a section asks for motion blur, N sub-frames spread over the
// shutter (a fraction of the frame interval, centred) are written as f_00012_s0..sN-1.jpg and
// averaged later by tools/encode.py.
import { readFileSync, existsSync, mkdirSync, statSync, readdirSync, unlinkSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, DATA } from './lib/browser.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const WEB = process.env.TACIT_WEB || '/home/jashan/tacit/web'
const ROOTS = {
  reel: join(HERE, 'reel'),
  data: DATA,
  fonts: join(WEB, 'node_modules/@fontsource'),
  vfonts: join(WEB, 'node_modules/@fontsource-variable'),
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.bin': 'application/octet-stream', '.svg': 'image/svg+xml' }

function args() {
  const a = { from: 0, to: null, fps: 30, dpr: 2, workers: 1, shutter: 0.5, out: null, still: null, quality: 95 }
  const v = process.argv.slice(2)
  for (let i = 0; i < v.length; i += 2) a[v[i].replace(/^--/, '')] = v[i + 1]
  for (const k of ['from', 'to', 'fps', 'dpr', 'workers', 'shutter', 'quality']) if (a[k] !== null) a[k] = Number(a[k])
  if (a.still !== null) a.still = String(a.still).split(',').map(Number)
  a.out = resolve(a.out.replace(/^~/, process.env.HOME))
  return a
}

export async function openReel(browser, dpr) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr, colorScheme: 'dark' })
  await ctx.route('http://reel.local/**', (route) => {
    const url = new URL(route.request().url())
    const [, root, ...rest] = decodeURIComponent(url.pathname).split('/')
    const base = ROOTS[root]
    const file = base && join(base, ...rest)
    if (!file || !file.startsWith(base) || !existsSync(file) || statSync(file).isDirectory()) {
      return route.fulfill({ status: 404, body: 'not found' })
    }
    return route.fulfill({ status: 200, body: readFileSync(file), contentType: TYPES[extname(file)] || 'application/octet-stream',
      headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[page]', m.text().slice(0, 300)) })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.goto('http://reel.local/reel/index.html')
  await page.waitForFunction(() => window.reel && window.reel.loaded, null, { timeout: 180000 })
  return { ctx, page }
}

async function shoot(page, t, path, quality) {
  await page.evaluate((t) => window.reel.seek(t), t)
  await page.screenshot({ path, type: 'jpeg', quality, animations: 'disabled', caret: 'hide', scale: 'device' })
}

async function worker(a, frames, id) {
  const stale = new Map()
  for (const f of readdirSync(a.out)) {
    const m = f.match(/^(f_\d{5})(?:_s\d+)?\.jpg$/)
    if (m) stale.set(m[1], [...(stale.get(m[1]) ?? []), f])
  }
  const browser = await launch()
  const { page } = await openReel(browser, a.dpr)
  const t0 = Date.now()
  let n = 0
  for (const i of frames) {
    const t = a.still ? a.still[i] : a.from + i / a.fps
    const name = a.still ? `still_${String(t.toFixed(2)).replace('.', '_')}` : `f_${String(i).padStart(5, '0')}`
    const samples = a.still ? 1 : await page.evaluate((t) => window.reel.blurSamples(t), t)
    // A re-render must not leave stale sub-frames (or a stale plain frame) next to this one.
    for (const f of stale.get(name) ?? []) unlinkSync(join(a.out, f))
    if (samples <= 1) {
      await shoot(page, t, join(a.out, `${name}.jpg`), a.quality)
    } else {
      for (let s = 0; s < samples; s++) {
        const ts = t + ((s + 0.5) / samples - 0.5) * (a.shutter / a.fps)
        await shoot(page, ts, join(a.out, `${name}_s${s}.jpg`), a.quality)
      }
    }
    if (++n % 15 === 0) console.log(`w${id} ${n}/${frames.length} ${((Date.now() - t0) / n).toFixed(0)} ms/frame`)
  }
  await browser.close()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args()
  mkdirSync(a.out, { recursive: true })
  let total
  if (a.still) total = a.still.length
  else {
    if (a.to === null) {
      const browser = await launch()
      const { page } = await openReel(browser, 1)
      a.to = await page.evaluate(() => window.reel.duration)
      await browser.close()
    }
    total = Math.round((a.to - a.from) * a.fps)
  }
  const all = [...Array(total).keys()]
  const parts = [...Array(a.workers)].map((_, w) => all.filter((i) => i % a.workers === w))
  console.log(`rendering ${total} frames ${a.still ? '(stills)' : `${a.from}..${a.to}s`} with ${a.workers} workers → ${a.out}`)
  const t0 = Date.now()
  await Promise.all(parts.map((p, w) => worker(a, p, w)))
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`)
}
