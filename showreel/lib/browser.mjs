// Headless Chromium for capture and rendering. Playwright comes from the web app's node_modules
// (the showreel adds no npm dependencies of its own).
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(import.meta.url)
const PW = process.env.TACIT_PLAYWRIGHT || '/home/jashan/tacit/web/node_modules/playwright'
export const { chromium } = require(PW)

export const APP = process.env.TACIT_APP || 'http://127.0.0.1:8710'
export const DATA = process.env.SHOWREEL_DATA || '/home/jashan/tacit/data/showreel'

// No GPU access on this box for the user (not in the render group): WebGL runs on SwiftShader,
// which is slow but deterministic.
const ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--hide-scrollbars',
  '--force-color-profile=srgb',
  '--font-render-hinting=none',
  '--autoplay-policy=no-user-gesture-required',
]

export async function launch(extraArgs = []) {
  return chromium.launch({ args: [...ARGS, ...extraArgs] })
}

/** A 1920×1080 page at 2× device scale (3840×2160 pixels), dark scheme, motion allowed. */
export async function capturePage(browser, { width = 1920, height = 1080, dpr = 2, persona } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  })
  if (persona) {
    await ctx.addInitScript((p) => {
      try { localStorage.setItem('tacit.persona', p) } catch { /* storage may be unavailable */ }
    }, persona)
  }
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error('pageerror', e.message.slice(0, 200)))
  return { ctx, page }
}

/**
 * Record `frames` frames at `fps` on Playwright's fake clock: each frame advances virtual time by
 * exactly 1/fps (rAF, timers and performance.now all follow it), runs `step(i, t)` if given, then
 * screenshots `clip` (CSS pixels). Files: <dir>/f_00000.jpg …
 */
export async function recordFrames(page, { dir, frames, fps = 30, clip, step, quality = 94, settle = 0 }) {
  mkdirSync(dir, { recursive: true })
  const dt = 1000 / fps
  const t0 = Date.now()
  for (let i = 0; i < frames; i++) {
    await page.clock.runFor(dt)
    if (step) await step(i, i / fps)
    if (settle) await page.waitForTimeout(settle)
    await page.screenshot({
      path: `${dir}/f_${String(i).padStart(5, '0')}.jpg`,
      type: 'jpeg',
      quality,
      clip,
      animations: 'allow',
      caret: 'hide',
      scale: 'device',
      timeout: 180000,
    })
    if (i % 30 === 0) console.log(`  ${dir.split('/').pop()} frame ${i}/${frames} ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  }
}
