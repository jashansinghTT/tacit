// Walks docs/DEMO.md as each persona and screenshots every beat, flagging console errors.
// Light on the box: one ~10 s sample capture (named "QA …" so it stays out of demo lists), no
// training, licensing or robot runs (their e2e suites cover those).
//   node tools/demo-walk.mjs <outdir> [base] [width]
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const [out, base = 'http://127.0.0.1:5710', width = '1440'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const api = async (p) => (await fetch(base + p)).json()
const skills = await api('/api/skills?status=ready')
const seeded = skills.filter((s) => s.source_kind === 'sample').sort((a, b) => a.created_at.localeCompare(b.created_at))
const vase = seeded[0]?.id ?? skills[0]?.id
const listings = await api('/api/exchange/listings')
const listing = listings.find((l) => l.skill_id === vase)?.id ?? listings[0]?.id

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
})
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 900 }, permissions: ['camera', 'microphone'] })
const page = await ctx.newPage()
const issues = []
let beat = 'start'
page.on('console', (m) => m.type() === 'error' && issues.push(`${beat}: ${m.text().slice(0, 140)}`))
page.on('pageerror', (e) => issues.push(`${beat}: pageerror ${String(e).slice(0, 140)}`))
let n = 0
const shot = async (name, full = false) => {
  n++
  await page.screenshot({ path: `${out}/${String(n).padStart(2, '0')}-${name}.png`, fullPage: full })
}
const persona = async (id) => {
  await page.evaluate((p) => localStorage.setItem('tacit.persona', p), id)
}
const go = async (path, wait = 2500) => {
  await page.goto(base + path, { waitUntil: 'networkidle' }).catch(() => undefined)
  await page.waitForTimeout(wait)
}
const check = async (what, fn) => {
  try {
    await fn()
  } catch (e) {
    issues.push(`${beat}: ${what}: ${String(e).split('\n')[0].slice(0, 140)}`)
  }
}

// Before you start: Maria, the pill reads 9/9 models · 4 chips
beat = '0 setup'
await go('/', 500)
await persona('u_maria')
await go('/', 4500)
await check('box pill 9/9', async () => {
  const t = await page.getByTestId('box-pill').innerText()
  if (!/9\/9 models/.test(t)) throw new Error(`pill says "${t}"`)
})
await shot('landing')

// 1. The idea: click a hotspot
beat = '1 idea'
await check('hotspot', async () => {
  await page.getByTestId('hotspot-watch').click({ timeout: 15000 })
  await page.waitForTimeout(1200)
})
await shot('landing-hotspot-watch')
await page.keyboard.press('Escape')

// 2. Watch: Studio, sample "Arranging dried stems in a vase", a short capture, Stop
beat = '2 watch'
await go('/studio?source=sample&title=' + encodeURIComponent('QA demo walk (tacit-web)'), 2500)
await shot('studio-sample-picker')
await check('start sample capture', async () => {
  await page.getByTestId('capture-start').click()
  await page.getByTestId('capture-stop').waitFor({ timeout: 20000 })
})
await page.waitForTimeout(11000)
await shot('studio-live-overlays')
await check('stop -> processing', async () => {
  await page.getByTestId('capture-stop').click()
  await page.getByTestId('processing-panel').waitFor({ timeout: 60000 })
})
await page.waitForTimeout(4000)
await shot('studio-processing')

// 3. Check: Skill → Verify (real vs AI-made)
beat = '3 check'
await go(`/skills/${vase}?tab=verify`, 7000)
await check('verify compare', async () => {
  await page.getByTestId('verify-compare').waitFor({ timeout: 15000 })
})
await shot('skill-verify', true)

// 4. Teach: Sam → Learn → the lesson; 3D twin; Español
beat = '4 teach'
await persona('u_sam')
await go('/learn', 3000)
await shot('learn')
await go(`/learn/${vase}`, 6000)
await shot('lesson-watch')
await check('lesson 3D view', async () => {
  const b = page.getByRole('button', { name: /3D/ }).first()
  if (await b.count()) {
    await b.click()
    await page.waitForTimeout(4000)
  }
})
await shot('lesson-3d')
await check('lesson practise tab', async () => {
  await page.getByRole('button', { name: /^Practise$/ }).first().click({ timeout: 5000 })
  await page.waitForTimeout(3000)
})
await shot('lesson-practise')
await check('lesson guide my hand tab', async () => {
  await page.getByRole('button', { name: /Guide my hand/ }).first().click({ timeout: 5000 })
  await page.waitForTimeout(3000)
})
await shot('lesson-reflex')

// 5. Do: Robot Lab (view modes only)
beat = '5 do'
await persona('u_priya')
await go(`/robot/${vase}`, 7000)
await shot('robot-lab', true)

// 6. Earn: Maria lists (both seeded skills are listed already), Atlas buys, Maria's earnings
beat = '6 earn'
await persona('u_maria')
await go(`/skills/${vase}`, 3000)
await shot('skill-overview-maria')
await persona('u_atlas')
await go('/exchange', 4000)
await shot('exchange-atlas')
await go(`/exchange/${listing}`, 6000)
await shot('listing-atlas', true)
await persona('u_maria')
await go('/earnings', 4000)
await shot('earnings-maria', true)

// 7. The box
beat = '7 box'
await persona('u_priya')
await go('/box', 4000)
await shot('box', true)

// The guided tour, as a visitor
beat = 'tour'
await go('/', 3000)
await check('tour', async () => {
  await page.getByTestId('tour-start').click()
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(3500)
    await shot(`tour-${i + 1}`)
    const next = page.getByTestId('tour-next')
    if (await next.count()) await next.click()
  }
})

console.log(issues.length ? `ISSUES (${issues.length}):\n${issues.join('\n')}` : 'demo walk clean')
await browser.close()
