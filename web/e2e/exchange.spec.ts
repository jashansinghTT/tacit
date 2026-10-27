// E2E 6 (SPEC section 9): list → license as buyer → download the pack zip → the earnings ledger
// shows the royalty. Runs against the real backend (no mocks): Maria lists a ready, verified skill
// through the wizard, Atlas Robotics licenses it, downloads the pack, and Maria sees the royalty.
//
//   npx playwright test -c e2e/exchange.config.ts            (TACIT_E2E_BASE, default :8710)
//   EVIDENCE_DIR=../.orchestration/evidence/web-exchange ...  also saves screenshots there
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { inflateRawSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const EXPERT = 'u_maria'
const BUYER = 'u_atlas'
const EVIDENCE = process.env.EVIDENCE_DIR

interface SkillRow {
  id: string
  title: string
  status: string
  verification_status: string
  listed: boolean
  expert: { id: string }
  source_kind?: string
}
interface ListingRow {
  id: string
  skill_id: string
  title: string
  price: Record<string, number>
  royalty_split: { expert: number; plant: number }
  licenses_sold: number
  expert: { id: string }
}

/** Shared between the serial tests. */
const state: { skillId?: string; listing?: ListingRow; listedHere?: boolean; earnedBefore?: number; royalty?: number; licenseId?: string } = {}

const money = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function asPersona(page: Page, persona: string) {
  await page.addInitScript((p) => localStorage.setItem('tacit.persona', p), persona)
}

function watchConsole(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  return errors
}

async function shot(page: Page, name: string) {
  if (EVIDENCE) await page.screenshot({ path: join(EVIDENCE, `${name}.png`), fullPage: true })
}

async function api<T>(request: APIRequestContext, path: string, user = EXPERT): Promise<T> {
  const r = await request.get(path, { headers: { 'X-Tacit-User': user } })
  expect(r.ok(), `${path} -> ${r.status()}`).toBeTruthy()
  return (await r.json()) as T
}

/** File names in a zip, from its central directory (enough to check what the pack contains). */
function zipEntries(buf: Buffer): string[] {
  const names: string[] = []
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) return names
  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i++) {
    const n = buf.readUInt16LE(off + 28)
    const x = buf.readUInt16LE(off + 30)
    const c = buf.readUInt16LE(off + 32)
    names.push(buf.toString('utf8', off + 46, off + 46 + n))
    off += 46 + n + x + c
  }
  return names
}

/** One deflated or stored file from a zip, by name suffix. */
function zipRead(buf: Buffer, suffix: string): string | null {
  let off = 0
  while ((off = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), off)) >= 0) {
    const method = buf.readUInt16LE(off + 8)
    const size = buf.readUInt32LE(off + 18)
    const n = buf.readUInt16LE(off + 26)
    const x = buf.readUInt16LE(off + 28)
    const name = buf.toString('utf8', off + 30, off + 30 + n)
    const start = off + 30 + n + x
    if (name.endsWith(suffix)) {
      const data = buf.subarray(start, start + size)
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8')
    }
    off = start + size
  }
  return null
}

test.describe.serial('Skill Exchange: list, license, download, earn', () => {
  test.beforeAll(async ({ request }) => {
    // A dev or preview server that just started can fail its first proxied request: retry briefly.
    let real = false
    for (let i = 0; i < 10 && !real; i++) {
      const health = await request.get('/api/health').catch(() => null)
      real = Boolean(health?.ok() && (health.headers()['content-type'] ?? '').includes('json'))
      if (!real) await new Promise((r) => setTimeout(r, 1000))
    }
    test.skip(!real, 'needs the real Tacit backend behind the base URL')
  })

  test('Maria lists a verified skill through the wizard', async ({ page, request }) => {
    const skills = await api<SkillRow[]>(request, `/api/skills?expert_id=${EXPERT}`)
    const listable = skills.filter((s) => s.status === 'ready' && s.verification_status === 'verified' && !s.listed && !/^QA\b/.test(s.title))
    // E2E_SKILL picks one; otherwise prefer a skill recorded from a sample clip over a live test capture.
    const candidate = process.env.E2E_SKILL
      ? listable.find((s) => s.id === process.env.E2E_SKILL)
      : (listable.find((s) => s.source_kind === 'sample') ?? listable[0])
    const listings = await api<ListingRow[]>(request, '/api/exchange/listings')
    state.earnedBefore = (await api<{ total: number }>(request, '/api/earnings')).total

    if (!candidate) {
      // Every verified skill is already listed (an earlier run): license one of Maria's listings.
      const existing = listings.find((l) => l.expert.id === EXPERT)
      test.skip(!existing, 'no ready, verified skill for Maria and no listing of hers: process a sample first')
      state.listing = existing
      state.skillId = existing!.skill_id
      test.info().annotations.push({ type: 'note', description: `no unlisted verified skill; licensing existing listing ${existing!.id}` })
      return
    }

    state.skillId = candidate.id
    const errors = watchConsole(page)
    await asPersona(page, EXPERT)
    await page.goto('/exchange')
    await expect(page.getByTestId('page-exchange')).toBeVisible()
    await page.getByTestId('list-skill').click()
    await expect(page.getByTestId('sell-picker')).toBeVisible()
    await page.getByTestId(`sell-pick-${candidate.id}`).click()

    // 1 check
    await expect(page.getByTestId('sell-step-check')).toBeVisible()
    await shot(page, 'e2e-01-sell-check')
    await page.getByTestId('sell-next').click()
    // 2 consent: nothing moves until the expert signs
    await expect(page.getByTestId('sell-step-consent')).toBeVisible()
    await expect(page.getByTestId('sell-next')).toBeDisabled()
    await page.getByTestId('consent-confirm').click()
    await shot(page, 'e2e-02-sell-consent')
    await page.getByTestId('sell-next').click()
    // 3 prices
    await expect(page.getByTestId('sell-step-prices')).toBeVisible()
    await page.getByTestId('price-robot_deploy').fill('499')
    await page.getByTestId('sell-next').click()
    // 4 split: the default 70/30 and the worked example
    await expect(page.getByTestId('sell-step-split')).toBeVisible()
    await expect(page.getByTestId('split-expert')).toHaveText('70%')
    await expect(page.getByTestId('split-example')).toContainText('$349.30')
    await shot(page, 'e2e-03-sell-split')
    await page.getByTestId('sell-next').click()
    // 5 market
    await expect(page.getByTestId('sell-step-market')).toBeVisible()
    await page.getByTestId('industry-Manufacturing').click()
    await page.getByTestId('sell-next').click()
    // 6 review and publish
    await expect(page.getByTestId('sell-step-review')).toBeVisible()
    await page.getByTestId('sell-publish').click()
    await expect(page.getByTestId('sell-published')).toBeVisible({ timeout: 30_000 })
    await shot(page, 'e2e-04-sell-published')

    const after = await api<ListingRow[]>(request, '/api/exchange/listings')
    const mine = after.find((l) => l.skill_id === candidate.id)
    expect(mine, 'the new listing is on the Exchange').toBeTruthy()
    expect(mine!.royalty_split.expert).toBeCloseTo(0.7, 2)
    expect(mine!.price.robot_deploy).toBe(499)
    state.listing = mine
    state.listedHere = true
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('Atlas Robotics licenses it and downloads the pack', async ({ page, request }) => {
    const l = state.listing
    test.skip(!l, 'no listing from the previous step')
    const errors = watchConsole(page)
    await asPersona(page, BUYER)
    await page.goto('/exchange')
    const card = page.getByTestId(`listing-${l!.id}`)
    await expect(card).toBeVisible()
    await shot(page, 'e2e-05-exchange-grid')
    await card.click()

    await expect(page.getByTestId('page-listing')).toBeVisible()
    await expect(page.getByTestId('listing-title')).toHaveText(l!.title)
    await expect(page.getByTestId('verification-certificate')).toBeVisible()
    await expect(page.getByTestId('consent-record')).toBeVisible()
    await expect(page.getByTestId('never-raw_video')).toBeVisible()
    await expect(page.getByTestId('motion-scene')).toBeVisible()
    await shot(page, 'e2e-06-listing')

    await page.getByTestId('license-option-robot_deploy').click()
    await page.getByTestId('license-button').click()
    const dialog = page.getByTestId('checkout-dialog')
    await expect(dialog).toBeVisible()
    // Honest checkout: labelled as a demo, and no payment fields of any kind.
    await expect(page.getByTestId('demo-banner')).toContainText('no payment is taken')
    await expect(dialog.locator('input[autocomplete^="cc-"], input[name*="card" i], input[type="tel"]')).toHaveCount(0)
    await expect(page.getByTestId('confirm-license')).toBeDisabled()
    await page.getByTestId('agree-terms').click()
    await shot(page, 'e2e-07-checkout')
    await page.getByTestId('confirm-license').click()

    const receipt = page.getByTestId('license-receipt')
    await expect(receipt).toBeVisible({ timeout: 30_000 })
    const price = l!.price.robot_deploy
    const toExpert = Math.round(price * l!.royalty_split.expert * 100) / 100
    state.royalty = toExpert
    await expect(page.getByTestId('receipt-amount')).toHaveText(money(price))
    await expect(page.getByTestId(`royalty-${EXPERT}`)).toContainText(money(toExpert))
    await expect(page.getByTestId('royalty-plant')).toBeVisible()
    await expect(page.getByTestId('receipt-demo-stamp')).toBeVisible()
    state.licenseId = (await page.getByTestId('license-id').textContent())?.trim()
    await shot(page, 'e2e-08-receipt')

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-pack').click()])
    expect(download.suggestedFilename()).toMatch(/^tacit-skill-.*\.zip$/)
    const zip = readFileSync(await download.path())
    const names = zipEntries(zip)
    for (const f of ['skill.json', 'motion/tracks.json', 'SOP.md', 'robot/program.json', 'certificates/verification.json', 'certificates/consent.json', 'LICENSE.txt']) {
      expect(names.some((n) => n.endsWith(f)), `pack contains ${f}`).toBeTruthy()
    }
    // Motion, gaze and text only: no video, no images, no keyframes.
    expect(names.filter((n) => /\.(mp4|webm|mov|jpe?g|png)$/i.test(n))).toEqual([])
    const skill = JSON.parse(zipRead(zip, 'skill.json') ?? '{}') as { steps?: Record<string, unknown>[]; source?: Record<string, unknown> }
    expect(skill.steps?.every((s) => !('keyframe' in s))).toBeTruthy()
    expect(skill.source && 'video' in skill.source).toBeFalsy()
    expect(zipRead(zip, 'LICENSE.txt')).toContain('no payment was taken')

    // The pack is in the buyer's library, with its download.
    await page.getByTestId('open-library').click()
    await expect(page.getByTestId('page-library')).toBeVisible()
    await expect(page.getByTestId(`library-item-${state.licenseId}`)).toBeVisible()
    await shot(page, 'e2e-09-library')
    const lib = await api<{ license: { id: string; license_type: string } }[]>(request, '/api/exchange/library', BUYER)
    expect(lib.some((x) => x.license.id === state.licenseId && x.license.license_type === 'robot_deploy')).toBeTruthy()
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('Maria sees the royalty in her earnings', async ({ page, request }) => {
    test.skip(state.royalty == null, 'no license from the previous step')
    const errors = watchConsole(page)
    await asPersona(page, EXPERT)
    await page.goto('/earnings')
    await expect(page.getByTestId('page-earnings')).toBeVisible()
    const row = page.getByTestId('ledger-row').filter({ hasText: state.listing!.title }).first()
    await expect(row).toBeVisible()
    await expect(page.getByTestId('earnings-ledger')).toContainText(`+${money(state.royalty!)}`)
    await expect(page.getByTestId('earnings-chart')).toBeVisible()
    await shot(page, 'e2e-10-earnings')
    const earn = await api<{ total: number; entries: { listing_id: string; amount: number }[] }>(request, '/api/earnings')
    expect(earn.total).toBeCloseTo((state.earnedBefore ?? 0) + state.royalty!, 2)
    expect(earn.entries.some((e) => e.listing_id === state.listing!.id && Math.abs(e.amount - state.royalty!) < 0.01)).toBeTruthy()
    expect(errors, errors.join('\n')).toEqual([])
  })
})
