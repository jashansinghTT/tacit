// The training use case end to end on the real stack (SPEC F4, E2E 4): lesson narration plays,
// practice gives a score and a hint, the tutor answers by text and by voice, the virtual glove
// plays a step, the quiz earns a certificate, and the manager sees it.
import { expect, test, type Page } from '@playwright/test'
import { EVIDENCE_DIR, readFixture } from './learn.fixtures'

const fx = readFixture()
const lessonUrl = `/learn/${fx.skillId}`

test.describe.configure({ mode: 'serial' })

let errors: string[] = []

test.beforeEach(async ({ page }) => {
  errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    const text = m.text()
    // A resource that fails to load is reported by the test that needs it, not here.
    if (m.type() !== 'error' || /Failed to load resource/.test(text)) return
    // Known issue in the shared TwinViewer (web card): objects are keyed by label, so two parts
    // with the same label warn. Reported to the web card; remove this once it is fixed.
    if (/two children with the same key/.test(text) && /TwinViewer/.test(text)) return
    errors.push(`console: ${text.slice(0, 400)}`)
  })
  await page.addInitScript(() => localStorage.setItem('tacit.persona', 'u_sam'))
})

test.afterEach(() => {
  expect(errors, 'no errors in the browser console').toEqual([])
})

/**
 * Evidence screenshot. Full-page captures of a scrolled page repeat the sticky header and rails,
 * so lesson screens are taken as viewport shots scrolled to the part that matters.
 */
async function shot(page: Page, name: string, opts: { fullPage?: boolean; at?: string } = {}) {
  if (opts.at) await page.getByTestId(opts.at).evaluate((el) => (el as unknown as { scrollIntoView: (o: object) => void }).scrollIntoView({ block: 'start' }))
  else await page.evaluate('window.scrollTo(0, 0)')
  if (opts.at) await page.evaluate('window.scrollBy(0, -72)')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png`, fullPage: opts.fullPage })
}

/** Wait for the tutor's answer text; on a transient model error, use "Try again" once. */
async function answered(page: Page) {
  const answer = page.getByTestId('tutor-answer').last()
  await expect(answer).toHaveAttribute('data-status', /done|error/, { timeout: 90_000 })
  if ((await answer.getAttribute('data-status')) === 'error') {
    await page.getByTestId('tutor-retry').click()
    await expect(page.getByTestId('tutor-answer').last()).toHaveAttribute('data-status', 'done', { timeout: 90_000 })
  }
  await expect(page.getByTestId('tutor-answer-text').last()).not.toBeEmpty()
}

async function openLesson(page: Page) {
  await page.goto(lessonUrl)
  await expect(page.getByTestId('lesson-title')).toHaveText(fx.title)
  await expect(page.getByTestId('rail-step-1')).toHaveAttribute('aria-current', 'step')
}

test('learn: the trainee sees lessons with progress', async ({ page }) => {
  await page.goto('/learn')
  await expect(page.getByTestId('page-learn')).toBeVisible()
  await expect(page.getByTestId('lesson-grid')).toBeVisible()
  await expect(page.getByTestId(`lesson-card-${fx.skillId}`)).toBeVisible()
  await expect(page.getByTestId('continue-lesson')).toBeVisible()
  await expect(page.getByTestId('learn-stats')).toContainText('Lessons')
  await page.waitForTimeout(800)
  await shot(page, 'learn', { fullPage: true })
  await page.getByTestId(`lesson-card-${fx.skillId}`).click()
  await expect(page).toHaveURL(new RegExp(`${lessonUrl}$`))
})

test('lesson: the step demo loops with narration, captions and the expert\'s why', async ({ page }) => {
  await openLesson(page)
  const time = () => page.getByTestId('step-video').locator('video').evaluate((v) => (v as unknown as { currentTime: number }).currentTime)
  const a = await time()
  await page.waitForTimeout(1500)
  expect(await time(), 'the step video plays').not.toBe(a)
  await expect(page.getByTestId('why-quote')).toBeVisible()
  await expect(page.getByTestId('why-source')).toHaveText(/words|Inferred/)
  await expect(page.getByTestId('step-instruction')).not.toBeEmpty()
  if (fx.narrated) {
    // The intro, then step 1's line, each with captions.
    await expect(page.getByTestId('captions').locator('p')).toBeVisible({ timeout: 30_000 })
  }
  await page.waitForTimeout(600)
  await shot(page, 'lesson-watch')

  await page.getByTestId('step-next').click()
  await expect(page.getByTestId('lesson-main')).toHaveAttribute('data-step', '2')
  await expect(page.getByTestId('rail-step-2')).toHaveAttribute('aria-current', 'step')

  await page.getByTestId('seg-3d').click()
  await expect(page.getByTestId('twin-viewer').locator('canvas')).toBeVisible()
  await page.waitForTimeout(1500)
  await shot(page, 'lesson-3d')
})

test('practice: the camera gets a live score, a hint and saved progress', async ({ page }) => {
  await openLesson(page)
  await page.getByTestId('seg-practise').click()
  await page.getByTestId('practice-start').click()
  await expect(page.getByTestId('practice-stage')).toHaveAttribute('data-state', 'live', { timeout: 20_000 })
  // The first feedback adds the step to the score history; then wait for a real match.
  await expect(page.getByTestId('history-step-1')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('img', { name: /^Live match score/ })).not.toHaveAttribute('aria-label', /score 0%$/, { timeout: 60_000 })
  await expect(page.getByTestId('practice-hint')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('trainee-overlay')).toBeVisible()
  await page.waitForTimeout(1500)
  await shot(page, 'lesson-practice', { at: 'mode-bar' })
  await page.getByTestId('practice-stop').click()
  await expect(page.getByTestId('practice-saving').or(page.getByTestId('practice-saved'))).toBeVisible()
  await expect(page.getByTestId('practice-saved')).toContainText('Progress saved', { timeout: 25_000 })
  const rows = (await (await page.request.get('/api/learn/progress')).json()) as { trainee: { id: string }; skill_id: string; best_score: number }[]
  const mine = rows.find((r) => r.trainee.id === 'u_sam' && r.skill_id === fx.skillId)
  expect(mine, 'practice progress is saved for the trainee').toBeTruthy()
  expect(mine!.best_score).toBeGreaterThan(0)
})

test('tutor: answers a typed question and speaks the answer', async ({ page }) => {
  await openLesson(page)
  await page.getByTestId('tutor-input').fill('What should I watch out for in this step?')
  await page.getByTestId('tutor-send').click()
  await expect(page.getByTestId('tutor-question').first()).toContainText('watch out for')
  await answered(page)
  // Each sentence is voiced by S2 Pro and played as soon as it arrives.
  await expect(page.getByTestId('tutor-speaking').or(page.getByTestId('tutor-replay')).first()).toBeVisible({ timeout: 120_000 })
  await shot(page, 'lesson-tutor')
})

test('tutor: answers a spoken question with its transcript', async ({ page }) => {
  test.skip(!fx.voice, 'no voiced question on this box to use as the fake microphone')
  await openLesson(page)
  await page.getByTestId('tutor-mic').click()
  await expect(page.getByTestId('tutor-recording')).toBeVisible()
  // The voice-activity cut-off ends the question; Whisper transcribes it on chip 1.
  const q = page.getByTestId('tutor-question').first()
  // Speech shares chip 1 with narration and music; a busy chip queues the request.
  await expect(q).toContainText('you said', { timeout: 150_000 })
  const firstWords = fx.question!.split(/\s+/).slice(0, 3).join(' ').replace(/[^\w\s]/g, '')
  await expect(q).toContainText(new RegExp(firstWords, 'i'), { timeout: 60_000 })
  await answered(page)
  await shot(page, 'lesson-tutor-voice')
})

test('guide: the virtual glove plays the step and the Reflex file downloads', async ({ page }) => {
  await openLesson(page)
  await page.getByTestId('seg-guide').click()
  await expect(page.getByTestId('virtual-glove').locator('canvas')).toBeVisible()
  await expect(page.getByTestId('reflex-explainer')).toContainText('five-finger exoskeleton')
  const status = (await (await page.request.get('/api/reflex/status')).json()) as { connected: boolean }
  await expect(page.getByTestId('reflex-status')).toHaveText(status.connected ? /Glove connected/ : /No glove connected/)

  const track = (await (await page.request.get(`/api/skills/${fx.skillId}/fingers?step=1`)).json()) as { frames: number[][] }
  if (track.frames.length > 3) {
    // The curls follow the video: sample the five bars twice and expect them to move.
    const bars = () => page.getByTestId('finger-bars').innerText()
    const first = await bars()
    await expect.poll(bars, { timeout: 10_000 }).not.toBe(first)
    const guide = page.waitForResponse((r) => r.url().includes('/api/reflex/guide') && r.request().method() === 'POST')
    await page.getByTestId('reflex-guide').click()
    expect((await guide).status()).toBe(200)
  }
  const href = await page.getByTestId('reflex-download').getAttribute('href')
  expect(href).toContain('/reflex.py?step=1')
  const file = await page.request.get(href!)
  expect(file.status()).toBe(200)
  expect(await file.text()).toContain('def steps()')
  await page.waitForTimeout(1200)
  await shot(page, 'lesson-guide', { at: 'mode-bar' })
})

test('guide: with a glove connected, Reflex guides the hand and stops', async ({ page }) => {
  // No glove hardware on this box: only the three Reflex endpoints are stubbed, in this browser.
  const calls: string[] = []
  await page.route('**/api/reflex/status', (r) => r.fulfill({ json: { connected: true, url: 'http://127.0.0.1:8000', mock: true, state: 'idle', fingers: ['thumb', 'index', 'middle', 'ring', 'pinky'] } }))
  await page.route('**/api/reflex/guide', async (r) => {
    calls.push(`guide ${r.request().postData()}`)
    await r.fulfill({ json: { connected: true, name: 'tacit_step1', steps: [{ pose: [0.2, 0.3, 0.3, 0.3, 0.3], seconds: 0.5 }, { pose: [0.15, 0.15, 0.15, 0.15, 0.15], seconds: 0.5 }], seconds: 6 } })
  })
  await page.route('**/api/reflex/stop', async (r) => {
    calls.push('stop')
    await r.fulfill({ json: { ok: true } })
  })
  await openLesson(page)
  await page.getByTestId('seg-guide').click()
  await expect(page.getByTestId('reflex-status')).toHaveText(/Glove connected/)
  await page.getByTestId('reflex-guide').click()
  await expect(page.getByTestId('reflex-stop')).toBeVisible()
  await expect(page.getByTestId('guide-stage')).toContainText('on your hand too')
  await page.getByTestId('reflex-stop').click()
  await expect(page.getByTestId('reflex-guide')).toBeVisible()
  expect(calls[0]).toContain(`"skill_id":"${fx.skillId}"`)
  expect(calls[0]).toContain('"step_index":1')
  expect(calls).toContain('stop')
})

test('quiz: a passing quiz earns a downloadable certificate', async ({ page }) => {
  await openLesson(page)
  await page.getByTestId('rail-quiz').click()
  await expect(page.getByTestId('quiz')).toBeVisible()
  for (const [i, a] of fx.quizAnswers.entries()) await page.getByTestId(`quiz-q-${i}-c-${a}`).click()
  await page.getByTestId('quiz-submit').click()
  await expect(page.getByTestId('quiz-result')).toHaveAttribute('data-passed', 'true')
  const img = page.getByTestId('certificate-image')
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((el) => (el as unknown as { naturalWidth: number }).naturalWidth)).toBeGreaterThan(0)
  const href = await page.getByTestId('certificate-download').getAttribute('href')
  const cert = await page.request.get(href!)
  expect(cert.status()).toBe(200)
  expect(await cert.text()).toContain('SKILL CERTIFICATE')
  await shot(page, 'lesson-quiz', { at: 'quiz' })
  await shot(page, 'lesson-certificate', { at: 'quiz-result' })
})

test('team: the manager sees trainee progress, captured skills and robot readiness', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tacit.persona', 'u_priya'))
  await page.goto('/team')
  await expect(page.getByTestId('page-team')).toBeVisible()
  await expect(page.getByTestId('team-stats')).toContainText('Skills captured')
  await expect(page.getByTestId('matrix-row-u_sam')).toContainText('Certified')
  const row = page.getByTestId(`skill-row-${fx.skillId}`)
  await expect(row).toBeVisible()
  await expect(row.getByTestId('robot-cell')).toBeVisible()
  await expect(page.getByTestId('team-activity')).toContainText('Sam Okafor')
  await page.waitForTimeout(600)
  await shot(page, 'team', { fullPage: true })
})
