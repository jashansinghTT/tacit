// App captures for the reel: Playwright at 2x on a virtual clock (rAF, timers and performance.now
// follow page.clock), cursorless. Shots that need a clean plate pin one element full-screen with
// injected CSS and hide the UI chrome around it; the product's own rendering is untouched.
//
//   node capture/app.mjs <shot> [--base http://127.0.0.1:5790] [--frames N] [--probe]
import { mkdirSync } from 'node:fs'
import { launch, capturePage, recordFrames, DATA } from '../lib/browser.mjs'

const argv = process.argv.slice(2)
const shot = argv[0]
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d }
const BASE = opt('base', 'http://127.0.0.1:5790')
const PROBE = argv.includes('--probe')
const OUT = `${DATA}/captures/${opt('name', shot)}`

/** Pin `sel` to the whole viewport and hide everything else on the page. */
async function isolate(page, sel, { hideInside = [] } = {}) {
  await page.addStyleTag({ content: `
    ${sel} { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
      margin: 0 !important; border-radius: 0 !important; z-index: 2147483000 !important; transform: none !important; box-shadow: none !important; }
    ${hideInside.map((s) => `${sel} ${s}`).join(', ') || '.__none'} { visibility: hidden !important; }
    header, nav[aria-label], [data-testid=tour], [role=dialog] { visibility: hidden !important; }
  ` })
  await page.evaluate((sel) => window.dispatchEvent(new Event('resize')), sel)
}

/** Pause the virtual clock just ahead of the page's own time (it can run ahead of Node's). */
async function pause(page, ms = 200) {
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + ms)
}

async function settle(page, ms) {
  await page.waitForTimeout(ms)
  await page.evaluate(() => document.fonts.ready)
}

const SHOTS = {
  // Landing hero: the Franka mirroring the ghost hands, full frame, no hotspots or labels.
  async hero(page) {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' })
    await settle(page, 2500)
    await isolate(page, '[data-tour=hero-frame]', { hideInside: ['[data-testid^=hotspot-]', '> .pointer-events-none', '[data-testid=hero-detail]'] })
    await settle(page, 2500)
    return { frames: Number(opt('frames', 240)) }
  },
  // Robot Lab: a fresh "replay the human" run (MuJoCo on the backend's CPU, no chip), then its
  // recorded buffer played back from `--at` seconds in the sim viewer, full frame.
  async robot(page) {
    await page.goto(BASE + '/robot/sk_c28f1461', { waitUntil: 'networkidle' })
    await settle(page, 3000)
    // --mode replay (her wrist path) or policy (the skill-trained policy on a seeded scene).
    const mode = opt('mode', 'replay')
    await page.evaluate((m) => document.querySelector(`[data-testid=mode-${m}]`).click(), mode)
    await page.waitForTimeout(500)
    await page.evaluate((m) => document.querySelector(`[data-testid=run-${m}]`).click(), mode)
    await page.locator('[data-testid=run-status][data-status=done]').waitFor({ timeout: 180000 })
    await settle(page, 1000)
    const scrub = (t) => page.evaluate((t) => {
      const el = document.querySelector('input[aria-label="Scrub the run"]')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(t))
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, t)
    console.log('run length', await page.evaluate(() => document.querySelector('input[aria-label="Scrub the run"]').max))
    if (opt('probe-times', null)) {
      // Stills at given run times, to pick the window worth recording.
      await pause(page)
      for (const pt of opt('probe-times').split(',').map(Number)) {
        await scrub(pt)
        await page.clock.runFor(100)
        await page.screenshot({ path: `${OUT}/at_${pt}.jpg`, quality: 80, type: 'jpeg', timeout: 180000 })
      }
      process.exit(0)
    }
    const at = Number(opt('at', 5.5))
    await page.evaluate((t) => {
      const el = document.querySelector('input[aria-label="Scrub the run"]')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(t))
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, at)
    await page.evaluate(() => document.querySelector('[aria-label="Play the recorded run"]').click())
    if (opt('view', null)) {
      // e.g. --view exterior: the over-the-shoulder camera GR00T sees (rendered in the browser).
      await page.evaluate((v) => document.querySelector(`[data-testid=seg-${v}]`).click(), opt('view'))
      await page.waitForTimeout(600)
    }
    await pause(page)
    console.log('sim clock', await page.locator('[data-testid=sim-clock]').innerText())
    await isolate(page, '[data-testid=sim-viewer]', { hideInside: ['[data-testid=run-status]', '[data-testid^=seg-]', 'button'] })
    await page.waitForTimeout(800)
    // Frame closer (OrbitControls dolly), let the damping settle, then orbit slowly while recording.
    await page.mouse.move(960, 560)
    for (let i = 0; i < Number(opt('zoom', 4)); i++) await page.mouse.wheel(0, -120)
    await page.clock.runFor(600)
    const orbit = Number(opt('orbit', 1.4))
    const step = async (i, t, n) => {
      if (i === 0) { await page.mouse.move(960, 560); await page.mouse.down() }
      await page.mouse.move(960 + i * orbit, 560 - i * orbit * 0.15)
      if (i === n - 1) await page.mouse.up()
    }
    return { frames: Number(opt('frames', 150)), paused: true, step }
  },
}

// Stills: 2x screenshots of DOM pages (cheap), viewport and full page. No virtual clock needed.
const STILLS = [
  { name: 'lesson_en', url: '/learn/sk_c28f1461', persona: 'u_sam', wait: 5000 },
  { name: 'lesson_es', url: '/learn/sk_c28f1461', persona: 'u_sam', wait: 4000,
    act: async (page) => { await page.selectOption('[data-testid=lesson-lang]', 'es'); await page.waitForTimeout(9000) } },
  { name: 'lesson_3d', url: '/learn/sk_c28f1461', persona: 'u_sam', wait: 4000,
    act: async (page) => { await page.locator('[data-testid=seg-3d]').click(); await page.waitForTimeout(6000) } },
  { name: 'lesson_3d_close', url: '/learn/sk_c28f1461', persona: 'u_sam', wait: 4000, viewport: true,
    act: async (page) => {
      // The lesson's own 3D viewer, dollied in (wheel) so the twin fills the frame.
      await page.locator('[data-testid=seg-3d]').click()
      await page.waitForTimeout(4000)
      const box = await page.evaluate(() => { const r = document.querySelector('[data-testid=watch-stage]').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
      await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.55)
      for (let i = 0; i < Number(opt('zoom', 5)); i++) { await page.mouse.wheel(0, -160); await page.waitForTimeout(250) }
      await page.waitForTimeout(3000)
    } },
  { name: 'earnings', url: '/earnings', persona: 'u_maria', wait: 4000 },
  { name: 'exchange', url: '/exchange', persona: 'u_atlas', wait: 4000 },
  { name: 'box', url: '/box', persona: 'u_maria', wait: 5000 },
  { name: 'verify', url: '/skills/sk_c28f1461?tab=verify', persona: 'u_maria', wait: 6000 },
  { name: 'robot_lab', url: '/robot/sk_c28f1461', persona: 'u_maria', wait: 5000 },
  { name: 'robot_eval', url: '/robot/sk_c28f1461', persona: 'u_maria', wait: 4000,
    act: async (page) => { await page.locator('[data-testid=mode-evaluate]').click(); await page.waitForTimeout(3000) } },
  { name: 'gr00tcam', url: '/robot/sk_c28f1461', persona: 'u_maria', wait: 5000, viewport: true,
    act: async (page) => {
      await page.evaluate(() => document.querySelector('[data-testid=seg-exterior]').click())
      await page.waitForTimeout(2000)
      await isolate(page, '[data-testid=sim-viewer]', { hideInside: ['[data-testid=run-status]', '[data-testid^=seg-]', 'button', 'div:has(> [data-testid^=seg-])'] })
      await page.waitForTimeout(4000)
    } },
  { name: 'robot_gr00t', url: '/robot/sk_c28f1461', persona: 'u_maria', wait: 4000,
    act: async (page) => { await page.locator('[data-testid=mode-gr00t]').click(); await page.waitForTimeout(3000) } },
]

if (shot === 'stills') {
  const only = opt('only', null)
  const browser = await launch()
  for (const st of STILLS.filter((x) => !only || only.split(',').includes(x.name))) {
    const { ctx, page } = await capturePage(browser, { persona: st.persona, dpr: 2 })
    try {
      await page.goto(BASE + st.url, { waitUntil: 'networkidle', timeout: 60000 })
      await page.waitForTimeout(st.wait)
      if (st.act) await st.act(page)
      await page.evaluate(() => document.fonts.ready)
      mkdirSync(OUT, { recursive: true })
      await page.screenshot({ path: `${OUT}/${st.name}.png`, timeout: 180000 })
      if (!st.viewport) await page.screenshot({ path: `${OUT}/${st.name}_full.png`, fullPage: true, timeout: 180000 })
      console.log('still', st.name)
    } catch (e) {
      console.log('still failed', st.name, e.message.split('\n')[0])
    }
    await ctx.close()
  }
  await browser.close()
  process.exit(0)
}

const browser = await launch()
const { page } = await capturePage(browser, { persona: opt('persona', 'u_maria'), dpr: PROBE ? 1 : 2 })
mkdirSync(OUT, { recursive: true })
await page.clock.install()
const { frames, paused, step } = await SHOTS[shot](page)
if (!paused) await pause(page, 500)
if (PROBE) {
  await page.screenshot({ path: `${OUT}/probe.png` })
  for (let i = 0; i < 3; i++) {
    await page.clock.runFor(1000)
    await page.screenshot({ path: `${OUT}/probe_${i}.png` })
  }
  console.log('probe screenshots in', OUT)
} else {
  await recordFrames(page, { dir: `${OUT}/frames`, frames, step: step && ((i, t) => step(i, t, frames)) })
}
await browser.close()
