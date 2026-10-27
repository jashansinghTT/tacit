import type { Page } from '@playwright/test'
import { test, expect, REAL } from './fixtures'

// Robot Lab (SPEC F5, section 9 test 5): the lab draws the sim, and every mode works from the page:
// replay the human, train, evaluate, run the policy and run GR00T on chip 3.
//
// Mock mode (default) uses the in-app mock. On the real stack (TACIT_E2E_BASE=http://127.0.0.1:8710)
// it picks the first ready skill, or TACIT_E2E_ROBOT_SKILL, and really trains and evaluates it.

test.describe.configure({ mode: 'serial' })

let skillId = 'sk_sort'

test.beforeAll(async ({ request }) => {
  if (!REAL) return
  if (process.env.TACIT_E2E_ROBOT_SKILL) {
    skillId = process.env.TACIT_E2E_ROBOT_SKILL
    return
  }
  const res = await request.get('/api/skills?status=ready')
  const skills = (await res.json()) as { id: string }[]
  expect(skills.length, 'a ready skill on the box').toBeGreaterThan(0)
  skillId = skills[0].id
})

async function openLab(page: Page, mode?: string) {
  await page.goto(`/robot/${skillId}${mode ? `?mode=${mode}` : ''}`)
  await expect(page.getByTestId('page-robotlab')).toBeVisible()
  await expect(page.getByTestId('sim-viewer').locator('canvas')).toBeVisible()
}

/** Waits for the streamed run to end and returns its outcome element. */
async function waitForRun(page: Page, timeout: number) {
  const status = page.getByTestId('run-status')
  await expect(status).toHaveAttribute('data-status', /starting|streaming/)
  await expect(status).toHaveAttribute('data-status', 'done', { timeout })
  await expect(page.getByTestId('sim-clock')).not.toHaveText('00:00.00')
}

test('the index lists skills with their robot readiness', async ({ page }) => {
  await page.goto('/robot')
  await expect(page.getByTestId('page-robotindex')).toBeVisible()
  await expect(page.getByTestId('robot-stats')).toContainText('GR00T')
  const row = page.getByTestId(`robot-skill-${skillId}`)
  await expect(row).toBeVisible()
  await row.click()
  await expect(page).toHaveURL(new RegExp(`/robot/${skillId}`))
  await expect(page.getByTestId('page-robotlab')).toBeVisible()
})

test('the lab draws the scene, the explainer and the five modes', async ({ page }) => {
  await openLab(page)
  for (const k of ['demo', 'program', 'variations', 'policy', 'trials']) await expect(page.getByTestId(`explainer-${k}`)).toBeVisible()
  await expect(page.getByTestId('robot-program')).toBeVisible()
  await expect(page.getByTestId('joint-telemetry')).toBeVisible()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'idle')
  // modes are tabs: arrow keys move between them and the URL keeps the mode
  await page.getByTestId('mode-replay').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('mode-train')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('panel-train')).toBeVisible()
  await expect(page).toHaveURL(/mode=train/)
  await page.getByTestId('seg-top').click()
  await page.getByTestId('seg-overview').click()
})

test('an unknown skill offers the skills on this box', async ({ page }) => {
  await page.goto('/robot/sk_does_not_exist')
  await expect(page.getByText('This skill is not on this box')).toBeVisible()
}, )

test('replay the human: the arm follows the expert, her hands alongside', async ({ page }) => {
  test.setTimeout(240_000)
  await openLab(page, 'replay')
  const run = page.getByTestId('run-replay')
  await expect(run).toBeEnabled({ timeout: 20_000 })
  await run.click()
  await expect(page.getByTestId('run-phase')).toBeVisible({ timeout: 30_000 })
  await waitForRun(page, 200_000)
  await expect(page.getByTestId('run-outcome')).toBeVisible()
  // the recorded run can be played back
  await page.getByRole('button', { name: 'Play from the start' }).click()
})

test('train a policy: demos, then epochs with a live loss curve', async ({ page }) => {
  test.setTimeout(600_000)
  await openLab(page, 'train')
  await page.getByTestId('seg-200').click()
  await page.getByTestId('seg-30').click()
  await page.getByTestId('run-train').click()
  const progress = page.getByTestId('train-progress')
  await expect(progress).toBeVisible()
  await expect(progress).toHaveAttribute('data-status', 'done', { timeout: 560_000 })
  await expect(page.getByTestId('loss-chart').locator('path').first()).toBeVisible()
  await expect(page.getByTestId('mode-train')).toContainText('trained')
})

test('evaluate: the trial grid fills in and gives a success rate', async ({ page }) => {
  test.setTimeout(400_000)
  await openLab(page, 'evaluate')
  await page.getByTestId('seg-20').click()
  await page.getByTestId('run-evaluate').click()
  const cells = page.getByTestId('trial-cell')
  await expect(cells).toHaveCount(20)
  await expect(page.locator('[data-testid="trial-cell"][data-state="pending"]')).toHaveCount(0, { timeout: 360_000 })
  await expect(page.getByTestId('run-evaluate')).toBeEnabled({ timeout: 30_000 })
  const score = (await page.getByTestId('eval-score').innerText()).replace(/\s/g, '')
  const [ok, n] = score.split('/').map(Number)
  expect(n).toBe(20)
  test.info().annotations.push({ type: 'success rate', description: `${ok}/${n}` })
  await expect(page.getByTestId('explainer-trials')).toHaveAttribute('data-state', 'done')
})

test('run the trained policy on a seeded scene', async ({ page }) => {
  test.setTimeout(180_000)
  await openLab(page, 'policy')
  await page.getByTestId('policy-seed').fill('7')
  await page.getByTestId('run-policy').click()
  await waitForRun(page, 150_000)
  await expect(page.getByTestId('run-outcome')).toContainText('seed 7')
})

test('run GR00T on chip 3: camera frames, instruction and per-call latency', async ({ page }) => {
  test.setTimeout(240_000)
  await openLab(page, 'gr00t')
  await page.getByTestId('run-gr00t').click()
  await expect(page.getByTestId('gr00t-feeds')).toBeVisible()
  await expect(page.getByTestId('camera-exterior')).not.toHaveAttribute('data-frames', '0', { timeout: 60_000 })
  await expect(page.getByTestId('camera-wrist')).not.toHaveAttribute('data-frames', '0')
  await expect(page.getByTestId('gr00t-instruction')).toBeVisible()
  await expect(page.getByTestId('gr00t-latency')).toContainText('ms')
  await waitForRun(page, 200_000)
})
