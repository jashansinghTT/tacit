// Full-page screenshots of every page as the persona who uses it, at several widths, plus an
// audit line per page: console errors, horizontal overflow, and slow loads.
//   node tools/polish-shots.mjs <phase> [base] [widths]
//   node tools/polish-shots.mjs before http://127.0.0.1:5710 1440,1920
// Writes .orchestration/evidence/polish/<phase>/<width>/<name>.png and <phase>/audit.txt
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [phase = 'before', base = 'http://127.0.0.1:5710', widthsArg = '1440,1920', only] = process.argv.slice(2)
const widths = widthsArg.split(',').map(Number)
const out = fileURLToPath(new URL(`../../.orchestration/evidence/polish/${phase}/`, import.meta.url))

const api = async (p) => (await fetch(base + p)).json()
const skills = await api('/api/skills?status=ready')
const listings = await api('/api/exchange/listings')
const seeded = skills.filter((s) => s.source_kind === 'sample').sort((a, b) => a.created_at.localeCompare(b.created_at))
const skill = (seeded[0] ?? skills[0])?.id
const other = (seeded[1] ?? skills[1] ?? seeded[0])?.id
const listing = listings.find((l) => l.skill_id === skill)?.id ?? listings[0]?.id

// [name, path, persona, wait ms, action]
const PAGES = [
  ['landing', '/', 'u_maria', 5000],
  ['studio', '/studio', 'u_maria', 2500],
  ['studio-sample', '/studio?source=sample', 'u_maria', 2500],
  ['skills', '/skills', 'u_maria', 2500],
  ['skill-overview', `/skills/${skill}`, 'u_maria', 4000],
  ['skill-twin', `/skills/${skill}?tab=twin`, 'u_maria', 7000],
  ['skill-sop', `/skills/${skill}?tab=sop`, 'u_maria', 2500],
  ['skill-verify', `/skills/${skill}?tab=verify`, 'u_maria', 7000],
  ['skill-answer', `/skills/${skill}?tab=answer`, 'u_maria', 2500],
  ['skill-audit', `/skills/${other}?tab=audit`, 'u_priya', 4000],
  ['learn', '/learn', 'u_sam', 3000],
  ['lesson', `/learn/${skill}`, 'u_sam', 7000],
  ['team', '/team', 'u_priya', 3500],
  ['robot-index', '/robot', 'u_priya', 3000],
  ['robot-lab', `/robot/${skill}`, 'u_priya', 7000],
  ['exchange', '/exchange', 'u_atlas', 4000],
  ['listing', `/exchange/${listing}`, 'u_atlas', 6000],
  ['sell', `/exchange/sell/${other}`, 'u_maria', 3500],
  ['library', '/library', 'u_atlas', 3000],
  ['earnings', '/earnings', 'u_maria', 3500],
  ['box', '/box', 'u_priya', 4000],
  ['notfound', '/no-such-page', 'u_maria', 1500],
].filter((p) => !only || only.split(',').includes(p[0]))

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const audit = []
for (const width of widths) {
  mkdirSync(`${out}${width}`, { recursive: true })
  for (const [name, path, persona, wait] of PAGES) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } })
    await ctx.addInitScript((p) => localStorage.setItem('tacit.persona', p), persona)
    const page = await ctx.newPage()
    const errors = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)))
    page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`))
    const t0 = Date.now()
    try {
      await page.goto(base + path, { waitUntil: 'networkidle', timeout: 45000 })
    } catch {
      errors.push('navigation timeout')
    }
    const loadMs = Date.now() - t0
    await page.waitForTimeout(wait)
    const h = await page.evaluate(() => document.body.scrollHeight)
    for (let y = 0; y < h; y += 800) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y)
      await page.waitForTimeout(80)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(700)
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: document.documentElement.clientWidth, h1: document.querySelector('h1')?.textContent?.trim().slice(0, 60) ?? '' }))
    await page.screenshot({ path: `${out}${width}/${name}.png`, fullPage: true })
    const line = `${width} ${name.padEnd(15)} ${String(loadMs).padStart(5)}ms  h1="${o.h1}"${o.sw > o.w ? `  OVERFLOW ${o.sw}>${o.w}` : ''}${errors.length ? `  ERRORS(${errors.length}): ${errors[0]}` : ''}`
    console.log(line)
    audit.push(line)
    await ctx.close()
  }
}
writeFileSync(`${out}audit.txt`, `${new Date().toISOString()} ${base} skill=${skill} other=${other} listing=${listing}\n${audit.join('\n')}\n`)
await browser.close()
