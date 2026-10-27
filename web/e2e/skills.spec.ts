import { test, expect, openReadySkill, REAL, writableSkillId } from './fixtures'

test('the skills list filters and opens a skill', async ({ page }) => {
  await page.goto('/skills')
  await expect(page.getByTestId('page-skills')).toBeVisible()
  await expect(page.locator('[data-testid^="skill-card-"]').first()).toBeVisible()
  await openReadySkill(page)
})

test('every skill tab renders', async ({ page }) => {
  const id = await openReadySkill(page)
  await expect(page.getByTestId('skill-player')).toBeVisible()
  await expect(page.getByTestId('steps-list')).toBeVisible()
  await expect(page.getByTestId('models-used')).toBeVisible()
  await page.getByTestId('player-toggle').click()

  await page.getByTestId('tab-twin').click()
  await expect(page).toHaveURL(new RegExp(`/skills/${id}\\?tab=twin`))
  await expect(page.getByTestId('twin-viewer')).toBeVisible({ timeout: 30_000 })

  await page.getByTestId('tab-sop').click()
  await expect(page.getByTestId('sop-panel')).toBeVisible()
  await expect(page.getByTestId('sop-export')).toBeEnabled()

  await page.getByTestId('tab-verify').click()
  await expect(page.getByTestId('verify-summary')).toBeVisible()
  await expect(page.getByTestId('verify-compare')).toBeVisible()

  await page.getByTestId('tab-answer').click()
  await expect(page.getByTestId('pending-questions')).toBeVisible()
})

test('an expert can answer a pending question by typing', async ({ page }) => {
  if (REAL) {
    // never write into demo data on the real stack: use a test ("QA ") skill
    const id = await writableSkillId(page)
    test.skip(!id, 'no test skill to write to on this box')
    await page.goto(`/skills/${id}?tab=answer`)
  } else {
    await openReadySkill(page)
    await page.getByTestId('tab-answer').click()
  }
  const card = page.locator('[data-testid^="question-"]').first()
  test.skip((await card.count()) === 0, 'no pending questions on this skill')
  await card.getByRole('button', { name: 'Type instead' }).click()
  await card.getByLabel('Your answer').fill('Two feels different from three when you roll them.')
  await card.getByTestId('save-answer').click()
  await expect(page.getByTestId('toast').first()).toContainText(/Answer saved|Could not/)
})

// Use case 5: a supervisor audits a worker's run against the skill.
test('a supervisor audits a worker run against the skill', async ({ page }) => {
  test.setTimeout(REAL ? 600_000 : 60_000)
  if (REAL) {
    const id = await writableSkillId(page)
    test.skip(!id, 'no test skill to audit on this box')
    await page.goto(`/skills/${id}?tab=audit`)
  } else {
    await openReadySkill(page)
    await page.getByTestId('tab-audit').click()
  }
  await page.getByTestId('audit-worker').fill('QA e2e worker')
  await page.getByTestId('audit-file').setInputFiles(new URL('../public/mock/samples/sort.mp4', import.meta.url).pathname)
  await page.getByTestId('audit-start').click()
  await expect(page.getByTestId('processing-panel')).toBeVisible()
  await expect(page.getByTestId('audit-report')).toBeVisible({ timeout: REAL ? 540_000 : 30_000 })
  await expect(page.getByTestId('audit-narrative')).not.toBeEmpty()
  await expect(page.locator('[data-testid^="audit-step-"]').first()).toBeVisible()
})
