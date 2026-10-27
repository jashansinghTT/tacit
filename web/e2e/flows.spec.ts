/**
 * The seven E2E flows of SPEC section 9 through the UI, on the real stack (Chromium, fake camera and mic).
 *
 * Run with scripts/e2e/ui.sh (builds the merged web branches, serves them proxied to the backend on 8710,
 * and runs scripts/e2e/playwright.config.ts). Each test attaches its timings; report.py puts them in RESULTS.md.
 */
import { test, expect, type Page, type TestInfo, type ConsoleMessage, type Response } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const MEDIA = process.env.QA_E2E_MEDIA ?? path.join(process.env.HOME ?? '', 'tacit/data/e2e')
const RUN_DIR = process.env.QA_UI_RUN_DIR ?? path.join(process.cwd(), 'qa-run')
const fakeArgs = (video: string, audio: string) => [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  `--use-file-for-fake-video-capture=${path.join(MEDIA, video)}`,
  `--use-file-for-fake-audio-capture=${path.join(MEDIA, audio)}`,
  '--autoplay-policy=no-user-gesture-required',
]

// ------------------------------------------------------------------------------------ helpers
type Timing = { step: string; s: number; limit_s: number | null; slow: boolean }

class Run {
  timings: Timing[] = []
  consoleErrors: string[] = []
  apiFailures: string[] = []
  constructor(
    readonly page: Page,
    readonly info: TestInfo,
  ) {
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error') this.consoleErrors.push(`${m.text()} @ ${m.location().url}`)
    })
    page.on('pageerror', (e) => this.consoleErrors.push(`pageerror: ${e.message}`))
    page.on('response', (r: Response) => {
      const u = new URL(r.url())
      if ((u.pathname.startsWith('/api/') || u.pathname.startsWith('/media/')) && r.status() >= 400) this.apiFailures.push(`${r.status()} ${r.request().method()} ${u.pathname}`)
    })
  }
  async time<T>(step: string, limit_s: number | null, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now()
    try {
      return await fn()
    } finally {
      const s = (Date.now() - t0) / 1000
      this.timings.push({ step, s: Math.round(s * 1000) / 1000, limit_s, slow: limit_s != null && s > limit_s })
    }
  }
  note(text: string) {
    this.info.annotations.push({ type: 'note', description: text })
    void this.info.attach('note', { body: text, contentType: 'text/plain' })
  }
  async shot(name: string) {
    const dir = path.join(RUN_DIR, 'screens', this.info.title.split(' ')[0])
    fs.mkdirSync(dir, { recursive: true })
    await this.page.screenshot({ path: path.join(dir, `${name}.png`) })
  }
  async finish() {
    await this.info.attach('timings', { body: JSON.stringify(this.timings), contentType: 'application/json' })
    if (this.apiFailures.length) this.note(`API errors seen by the page: ${[...new Set(this.apiFailures)].join(', ')}`)
  }
}

async function persona(page: Page, id: 'u_maria' | 'u_sam' | 'u_priya' | 'u_atlas') {
  // Once per tab: later switches (localStorage + reload) must stick.
  await page.addInitScript((p) => {
    try {
      if (sessionStorage.getItem('qa.persona')) return
      sessionStorage.setItem('qa.persona', p)
      localStorage.setItem('tacit.persona', p)
      localStorage.setItem('tacit.tour.seen', '1')
    } catch {
      /* ignore */
    }
  }, id)
}

/** Records every media element that plays (narration uses `new Audio()`, outside the DOM). */
async function trackMedia(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __qaMedia: HTMLMediaElement[] }
    w.__qaMedia = []
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!w.__qaMedia.includes(this)) w.__qaMedia.push(this)
      return play.call(this)
    }
  })
}

/** Seconds of audio actually played from `/media/` sources whose URL matches `re`. */
async function playedAudio(page: Page, re = '/media/'): Promise<number> {
  return page.evaluate((r) => {
    const w = window as unknown as { __qaMedia?: HTMLMediaElement[] }
    return (w.__qaMedia ?? []).filter((m) => (m.currentSrc || m.src).includes(r)).reduce((a, m) => a + (m.currentTime || 0), 0)
  }, re)
}

const words = (s: string) => new Set(s.toLowerCase().split(/\s+/).map((w) => w.replace(/[.,!?;:'"]/g, '')).filter((w) => w.length > 2))
const overlap = (a: string, b: string) => [...words(a)].filter((w) => words(b).has(w)).length / Math.max(1, words(b).size)
/** The transcript line of a chat bubble (the bubble also holds an avatar initial, a time and the model's ms). */
const transcriptLine = (bubble: string) => bubble.split('\n').map((l) => l.trim()).sort((a, b) => b.length - a.length)[0] ?? ''
/** Share of the heard words that were said: the fake microphone loops its file, so a capture can start mid-sentence. */
const precision = (heard: string, said: string) => [...words(heard)].filter((w) => words(said).has(w)).length / Math.max(1, words(heard).size)

async function api<T>(page: Page, url: string, init?: { method?: string; data?: unknown; user?: string }): Promise<T> {
  const go = () => page.request.fetch(url, { method: init?.method ?? 'GET', data: init?.data, headers: { 'X-Tacit-User': init?.user ?? 'u_maria' } })
  // A reused keep-alive connection can race the server closing it (uvicorn's 5 s idle timeout): browsers retry
  // such a request on their own, Playwright's request client does not, so retry once.
  const r = await go().catch(async (e: Error) => {
    if (!/ECONNRESET|socket hang up|EPIPE/.test(e.message)) throw e
    return go()
  })
  expect(r.ok(), `${init?.method ?? 'GET'} ${url} -> ${r.status()}`).toBeTruthy()
  return (await r.json()) as T
}

/** What this run made; scripts/e2e/teardown.py removes it after the run. */
function remember(kind: 'skills' | 'listings', id: string) {
  fs.mkdirSync(RUN_DIR, { recursive: true })
  const file = path.join(RUN_DIR, 'created.json')
  const made = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { skills: [], listings: [] }
  if (!made[kind].includes(id)) made[kind].push(id)
  fs.writeFileSync(file, JSON.stringify(made, null, 2))
}

async function qaTitle(page: Page, skillId: string) {
  remember('skills', skillId)
  const sk = await api<{ title: string }>(page, `/api/skills/${skillId}`)
  if (!sk.title.startsWith('QA ')) await api(page, `/api/skills/${skillId}`, { method: 'PATCH', data: { title: `QA ${sk.title}` } })
}

/** The skill the later flows share: the newest ready QA skill made from a sample (F2 makes one). */
async function sharedSkill(page: Page): Promise<string> {
  const fromEnv = process.env.QA_SKILL_ID
  if (fromEnv) return fromEnv
  const file = path.join(RUN_DIR, 'shared-skill.txt')
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim()
  const list = await api<{ id: string; title: string; status: string; source_kind: string }[]>(page, '/api/skills?status=ready&include_test=1')
  const qa = list.find((s) => s.title.startsWith('QA ') && s.source_kind !== 'live')
  expect(qa, 'no ready QA skill: run F2 first').toBeTruthy()
  return qa!.id
}

function zipNames(file: string): string[] {
  const out = execFileSync('python3', ['-c', 'import sys, zipfile; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', file])
  return out.toString().trim().split('\n')
}

// Not serial mode: a failing flow must not skip the others. workers=1 keeps them in file order.

// ------------------------------------------------------------------------------------ F1
// The config's browser has the capture camera (capture.y4m) and the spoken answer (answer.wav).
test.describe('with the capture camera', () => {
  test('F1 landing and navigation render with no console errors', async ({ page }, info) => {
    const run = new Run(page, info)
    await persona(page, 'u_maria')
    await run.time('landing page', 3, async () => {
      await page.goto('/')
      await expect(page.getByTestId('landing-hero')).toBeVisible()
    })
    await page.waitForLoadState('networkidle').catch(() => {})
    await run.shot('landing')
    for (const sec of ['landing-flow', 'landing-box', 'landing-moat', 'landing-exchange']) {
      await expect(page.getByTestId(sec), `landing section ${sec}`).toBeAttached()
    }
    const pages: [string, string][] = [
      ['studio', '/studio'],
      ['skills', '/skills'],
      ['learn', '/learn'],
      ['robot', '/robot'],
      ['exchange', '/exchange'],
      ['team', '/team'],
      ['box', '/box'],
    ]
    let lastHeading = ''
    for (const [key, url] of pages) {
      await run.time(`navigate to ${url}`, 2, async () => {
        await page.getByTestId(`nav-${key}`).first().click()
        await expect(page).toHaveURL(new RegExp(`${url}(\\?|$)`))
        // The new page's own heading, not the old page fading out.
        await expect(page.locator('h1')).toHaveCount(1)
        await expect(page.locator('h1')).not.toHaveText(lastHeading === '' ? /^$/ : lastHeading)
        await expect(page.locator('h1')).toBeVisible()
      })
      lastHeading = (await page.locator('h1').innerText()).trim()
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(800)
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(wide, `${url} scrolls horizontally by ${wide}px`).toBeLessThanOrEqual(1)
      await run.shot(key)
    }
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(wide, `landing scrolls horizontally at 1280 px by ${wide}px`).toBeLessThanOrEqual(1)
    await run.finish()
    expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  })

  // ---------------------------------------------------------------------------------- F2
  test('F2 sample video is processed into a ready skill with steps, verification and SOP', async ({ page }, info) => {
    test.setTimeout(40 * 60_000)
    const run = new Run(page, info)
    await persona(page, 'u_maria')
    const samples = await api<{ id: string; kind: string; title: string }[]>(page, '/api/samples')
    const sample = samples.find((s) => s.id === process.env.QA_SAMPLE) ?? samples.find((s) => s.kind === 'real')
    expect(sample, 'no real sample in /api/samples').toBeTruthy()
    await page.goto('/studio?source=sample')
    await page.getByTestId(`sample-${sample!.id}`).click()
    await run.shot('sample-picked')
    const t0 = Date.now()
    // Tag the new skill as a QA test skill the moment it exists, so a failed run never leaves it in the demo.
    const created = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/skills' && r.request().method() === 'POST')
    await page.getByTestId('sample-offline').click()
    const skillId = ((await (await created).json()) as { skill_id: string }).skill_id
    await qaTitle(page, skillId)
    fs.mkdirSync(RUN_DIR, { recursive: true })
    fs.writeFileSync(path.join(RUN_DIR, 'shared-skill.txt'), skillId)
    await expect(page.getByTestId('processing-panel')).toBeVisible({ timeout: 20_000 })
    await run.shot('processing')
    await run.time('process the sample (UI)', 300, async () => {
      await expect
        .poll(async () => (await api<{ status: string }>(page, `/api/skills/${skillId}`)).status, { timeout: 30 * 60_000, intervals: [3000] })
        .toMatch(/^(ready|failed)$/)
    })
    run.note(`processing took ${((Date.now() - t0) / 1000).toFixed(0)} s`)
    expect((await api<{ status: string }>(page, `/api/skills/${skillId}`)).status).toBe('ready')
    // The page must follow the job to the end (also across a backend restart, which re-runs it under a new id).
    const open = page.getByTestId('open-skill')
    await expect(open, 'the Studio does not show the finished job').toHaveText(/^Open the skill$/, { timeout: 60_000 })
    await run.shot('processed')
    await open.click()
    await expect(page).toHaveURL(new RegExp(`/skills/${skillId}`))
    await page.reload()
    const steps = page.getByTestId('steps-list').locator('[data-testid^="step-"]')
    await expect(steps.first()).toBeVisible()
    expect(await steps.count(), 'steps shown').toBeGreaterThanOrEqual(3)
    await run.shot('skill-overview')
    const sk = await api<{ verification: { status: string; score: number }; steps: unknown[]; sop_markdown: string }>(page, `/api/skills/${skillId}`)
    run.note(`skill ${skillId}: ${sk.steps.length} steps, verification ${sk.verification.status} ${sk.verification.score}`)
    await expect(page.getByText(/verified/i).first()).toBeVisible()
    await page.getByTestId('tab-sop').click()
    await expect(page.getByTestId('sop-panel')).toBeVisible()
    await expect(page.getByTestId('sop-panel')).toContainText(sk.sop_markdown.split('\n').find((l) => l.startsWith('#'))!.replace(/^#+\s*/, '').slice(0, 20))
    await run.shot('skill-sop')
    await page.getByTestId('tab-verify').click()
    await expect(page.getByTestId('verify-summary')).toBeVisible()
    await run.shot('skill-verify')
    await run.finish()
    expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  })

  // ---------------------------------------------------------------------------------- F3
  test('F3 live capture with the fake camera gets a spoken coach question and a transcribed answer', async ({ page }, info) => {
    test.setTimeout(30 * 60_000)
    const run = new Run(page, info)
    await persona(page, 'u_maria')
    const answerText = fs.readFileSync(path.join(MEDIA, 'answer.txt'), 'utf8').trim()
    await page.goto('/studio?source=webcam')
    await page.getByTestId('camera-preview').click()
    await run.time('camera preview', 5, async () => {
      await expect.poll(async () => page.locator('video').first().evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 10_000 }).toBeGreaterThan(0)
    })
    const created = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/skills' && r.request().method() === 'POST')
    await page.getByTestId('capture-start').click()
    const skillId = ((await (await created).json()) as { skill_id: string }).skill_id
    await qaTitle(page, skillId)
    await expect(page.getByTestId('overlay-canvas')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('latency-hud')).toBeVisible()
    await page.waitForTimeout(3000)
    await run.shot('live-analysis')
    // Timeline for the record: questions, voices still coming, answers, and whether the mic is recording.
    const timeline: string[] = []
    const t0 = Date.now()
    const probe = setInterval(() => {
      void page
        .evaluate(() => ({
          q: document.querySelectorAll('[data-testid="coach-question"]').length,
          coming: [...document.querySelectorAll('[data-testid="coach-question"]')].filter((e) => /voice coming/.test(e.textContent ?? '')).length,
          a: document.querySelectorAll('[data-testid="expert-answer"]').length,
          rec: document.querySelector('[data-testid="talk-button"]')?.getAttribute('aria-pressed') === 'true',
        }))
        .then((x) => {
          const line = `q=${x.q} voice_coming=${x.coming} answers=${x.a} mic=${x.rec ? 'REC' : '-'}`
          if (timeline.at(-1)?.split(' ').slice(1).join(' ') !== line) timeline.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${line}`)
        })
        .catch(() => {})
    }, 500)
    const question = page.getByTestId('coach-question').first()
    await run.time('first coach question (from start)', 60, async () => {
      await expect(question).toBeVisible({ timeout: 120_000 })
    })
    run.note(`coach asked: ${await question.innerText()}`)
    await run.shot('coach-question')
    const answer = page.getByTestId('expert-answer').first()
    try {
      await run.time('mic picks up the spoken answer (from question)', 30, async () => {
        await expect(answer).toBeVisible({ timeout: 90_000 })
      })
      await run.time('answer transcribed (from end of speech)', 5, async () => {
        await expect
          .poll(async () => {
            const line = transcriptLine(await answer.innerText())
            return words(line).size >= 3 && precision(line, answerText) >= 0.8
          }, { timeout: 90_000, message: 'no transcript of the spoken answer' })
          .toBeTruthy()
      })
    } finally {
      clearInterval(probe)
      run.note(`capture timeline:\n${timeline.join('\n')}`)
    }
    const heard = transcriptLine(await answer.innerText())
    run.note(`transcript: ${heard} (${(100 * overlap(heard, answerText)).toFixed(0)}% of the answer; the fake mic loops)`)
    await run.shot('answer')
    await page.getByTestId('capture-stop').click()
    await expect(page.getByTestId('processing-panel')).toBeVisible({ timeout: 20_000 })
    const open = page.getByTestId('open-skill')
    await expect(open).toBeVisible({ timeout: 60_000 })
    await run.time('process the capture (UI)', 180, async () => {
      await expect
        .poll(async () => (await api<{ status: string }>(page, `/api/skills/${skillId}`)).status, { timeout: 15 * 60_000, intervals: [3000] })
        .toMatch(/ready|failed/)
    })
    const sk = await api<{ status: string; qa: { answer: string | null; step_index: number | null }[]; steps: { index: number; why: string; why_source: string }[] }>(
      page,
      `/api/skills/${skillId}`,
    )
    expect(sk.status).toBe('ready')
    const kept = sk.qa.find((q) => q.answer && words(q.answer).size >= 3 && precision(q.answer, answerText) >= 0.8)
    expect(kept, `answer not kept: ${JSON.stringify(sk.qa)}`).toBeTruthy()
    const step = sk.steps.find((s) => s.index === kept!.step_index)
    expect(step?.why_source, 'the answer is not attached to a step').toBe('expert')
    await open.click()
    await run.shot('captured-skill')
    await run.finish()
    expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  })
})

// ------------------------------------------------------------------------------------ F4
test.describe('with the practice camera', () => {
  test('F4 learn: narration plays, practice scores with a hint, tutor answers by text and voice', async ({ playwright, baseURL }, info) => {
    // A browser of its own: the trainee's camera (practice.y4m) and a spoken question (question.wav).
    const browser = await playwright.chromium.launch({ args: fakeArgs('practice.y4m', 'question.wav') })
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, permissions: ['camera', 'microphone'] })
    const page = await context.newPage()
    const run = new Run(page, info)
    try {
      await learnFlow(page, run)
    } catch (e) {
      await run.shot('failure').catch(() => {})
      throw e
    } finally {
      await run.finish()
      await browser.close()
    }
    expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  })
})

async function learnFlow(page: Page, run: Run) {
  await persona(page, 'u_sam')
  await trackMedia(page)
  const skillId = await sharedSkill(page)
  const sk = await api<{ quiz: { answer: number }[]; steps: unknown[] }>(page, `/api/skills/${skillId}`)
  await page.goto(`/learn/${skillId}`)
  await expect(page.getByTestId('lesson-title')).toBeVisible({ timeout: 20_000 })
  await run.shot('lesson')
  // Narration (S2 Pro): watch mode voices the intro, then each step.
  await page.getByTestId('play-intro').click().catch(() => {})
  const unblock = page.getByTestId('narration-unblock')
  if (await unblock.isVisible().catch(() => false)) await unblock.click()
  await run.time('narration starts playing', 3, async () => {
    await expect.poll(() => playedAudio(page, '/media/tts/'), { timeout: 20_000, message: 'no narration played' }).toBeGreaterThan(0.3)
  })
  await run.shot('narration')
  // Practice on the fake camera: a live match score and a hint.
  await page.getByTestId('seg-practise').click()
  await page.getByTestId('practice-start').click()
  await expect(page.getByTestId('practice-stage')).toHaveAttribute('data-state', /live|running|tracking/, { timeout: 20_000 })
  await run.time('first practice score', 5, async () => {
    await expect(page.getByTestId('score-ring')).toContainText(/\d/, { timeout: 30_000 })
  })
  await run.time('practice hint shown', 10, async () => {
    await expect(page.getByTestId('practice-hint')).toBeVisible({ timeout: 45_000 })
  })
  await page.waitForTimeout(3000)
  run.note(`practice: score ${(await page.getByTestId('score-ring').innerText()).replace(/\s+/g, ' ')}; hint "${(await page.getByTestId('practice-hint').innerText()).trim()}"`)
  await run.shot('practice')
  await page.getByTestId('practice-stop').click()
  // Tutor by text: streamed text, then spoken sentences.
  const answers = page.getByTestId('tutor-answer')
  const n0 = await answers.count()
  await page.getByTestId('tutor-input').fill('Why does the first step matter?')
  const heardBefore = await playedAudio(page, '/media/tts/')
  await page.getByTestId('tutor-send').click()
  await run.time('tutor text: first words', 3, async () => {
    await expect(answers.nth(n0).getByTestId('tutor-answer-text')).not.toBeEmpty({ timeout: 30_000 })
  })
  await run.time('tutor text: answer complete', 30, async () => {
    await expect(answers.nth(n0)).toHaveAttribute('data-status', 'done', { timeout: 120_000 })
  })
  await run.time('tutor text: answer spoken', 15, async () => {
    await expect.poll(() => playedAudio(page, '/media/tts/'), { timeout: 120_000, message: 'the tutor answer was not spoken' }).toBeGreaterThan(heardBefore + 0.3)
  })
  await run.shot('tutor-text')
  // Tutor by voice: the fake microphone plays question.wav.
  const questionText = fs.readFileSync(path.join(MEDIA, 'question.txt'), 'utf8').trim()
  await page.getByTestId('tutor-mic').click()
  await expect(page.getByTestId('tutor-recording')).toBeVisible()
  await page.waitForTimeout(7000)
  if (await page.getByTestId('tutor-recording').isVisible().catch(() => false)) await page.getByTestId('tutor-mic').click()
  await run.time('tutor voice: question transcribed', 5, async () => {
    await expect(answers).toHaveCount(n0 + 2, { timeout: 60_000 })
    await expect
      .poll(async () => {
        const line = transcriptLine(await page.getByTestId('tutor-question').last().innerText())
        return words(line).size >= 3 && precision(line, questionText) >= 0.8
      }, { timeout: 90_000, message: 'the spoken question was not transcribed' })
      .toBeTruthy()
  })
  const asked = transcriptLine(await page.getByTestId('tutor-question').last().innerText())
  run.note(`voice question heard as: ${asked}`)
  await run.time('tutor voice: answer complete', 30, async () => {
    await expect(answers.last()).toHaveAttribute('data-status', 'done', { timeout: 120_000 })
  })
  await expect(answers.last().getByTestId('tutor-answer-text')).not.toBeEmpty()
  await run.shot('tutor-voice')
  // Quiz and certificate.
  await page.getByTestId('rail-quiz').click()
  for (const [qi, q] of sk.quiz.entries()) await page.getByTestId(`quiz-q-${qi}-c-${q.answer}`).click()
  await page.getByTestId('quiz-submit').click()
  await expect(page.getByTestId('quiz-result')).toHaveAttribute('data-passed', 'true', { timeout: 20_000 })
  await expect(page.getByTestId('certificate-image')).toBeVisible({ timeout: 20_000 })
  await run.shot('certificate')
}

// ------------------------------------------------------------------------------------ F5, F6, F7
test.describe('the rest', () => {
  test('F5 robot lab: train, evaluate at least 80% over 20 trials, GR00T run streams frames', async ({ page }, info) => {
    test.setTimeout(40 * 60_000)
    const run = new Run(page, info)
    await persona(page, 'u_priya')
    const skillId = await sharedSkill(page)
    await page.goto(`/robot/${skillId}`)
    await expect(page.getByTestId('sim-viewer')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('robot-program')).toBeVisible()
    await page.waitForTimeout(1500)
    await run.shot('robot-lab')
    await page.getByTestId('mode-train').click()
    await page.getByTestId('run-train').click()
    await run.time('train the policy (UI)', 300, async () => {
      await expect(page.getByTestId('train-progress')).toHaveAttribute('data-status', /done|failed/, { timeout: 30 * 60_000 })
    })
    await expect(page.getByTestId('train-progress')).toHaveAttribute('data-status', 'done')
    await expect(page.getByTestId('loss-chart')).toBeVisible()
    await run.shot('trained')
    await page.getByTestId('mode-evaluate').click()
    await page.getByTestId('run-evaluate').click()
    // The score reads "17/20" (or a percentage).
    const score = /(\d+)\s*\/\s*(\d+)|(\d+)\s*%/
    await run.time('evaluate 20 trials (UI)', 180, async () => {
      await expect(page.getByTestId('trial-cell')).toHaveCount(20, { timeout: 10 * 60_000 })
      await expect(page.getByTestId('eval-score')).toContainText(score, { timeout: 10 * 60_000 })
    })
    await page.waitForTimeout(2000)
    const m = (await page.getByTestId('eval-score').innerText()).match(score)
    const pct = m?.[3] ? Number(m[3]) : m ? (100 * Number(m[1])) / Number(m[2]) : 0
    run.note(`evaluation shows ${(await page.getByTestId('eval-score').innerText()).trim()} (${pct.toFixed(0)}%)`)
    await run.shot('evaluated')
    expect(pct, 'policy success rate shown').toBeGreaterThanOrEqual(80)
    await page.getByTestId('mode-gr00t').click()
    await page.getByTestId('run-gr00t').click()
    await run.time('GR00T camera frames appear', 10, async () => {
      for (const cam of ['exterior', 'wrist']) {
        await expect
          .poll(async () => page.getByTestId(`camera-${cam}`).locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 60_000 })
          .toBeGreaterThan(0)
      }
    })
    await expect(page.getByTestId('gr00t-latency')).toContainText(/\d+\s*ms/, { timeout: 30_000 })
    await page.waitForTimeout(5000)
    run.note(`GR00T latency panel: ${(await page.getByTestId('gr00t-latency').innerText()).replace(/\s+/g, ' ')}`)
    await run.shot('gr00t-run')
    await run.finish()
    expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  })

  test('F6 exchange: list, license as buyer, download the pack, earnings show the royalty', async ({ page }, info) => {
    const run = new Run(page, info)
    await persona(page, 'u_maria')
    const skillId = await sharedSkill(page)
    const expert = (await api<{ expert: { id: string } }>(page, `/api/skills/${skillId}`)).expert.id
    const before = await api<{ total: number }>(page, '/api/earnings', { user: expert })
    await page.goto('/')
    await page.evaluate((e) => localStorage.setItem('tacit.persona', e), expert)
    await page.goto(`/exchange/sell/${skillId}`)
    await expect(page.getByTestId('sell-steps')).toBeVisible({ timeout: 20_000 })
    await run.shot('sell-check')
    // Walk the wizard: check, consent (the expert confirms), prices, split, market, review.
    for (const step of ['check', 'consent', 'prices', 'split', 'market']) {
      await expect(page.getByTestId(`sell-step-${step}`)).toBeVisible({ timeout: 15_000 })
      if (step === 'consent') {
        await page.getByTestId('consent-confirm').click()
        await run.shot('sell-consent')
      }
      await expect(page.getByTestId('sell-next')).toBeEnabled({ timeout: 15_000 })
      await page.getByTestId('sell-next').click()
    }
    await expect(page.getByTestId('sell-step-review')).toBeVisible({ timeout: 15_000 })
    await run.shot('sell-review')
    await run.time('publish the listing', 3, async () => {
      await page.getByTestId('sell-publish').click()
      await expect(page.getByTestId('sell-published')).toBeVisible({ timeout: 20_000 })
    })
    await page.getByTestId('open-listing').click()
    await expect(page).toHaveURL(/\/exchange\/lst_/)
    const listingId = page.url().split('/exchange/')[1].split(/[?#]/)[0]
    remember('listings', listingId)
    run.note(`listing ${listingId}`)
    // The buyer licenses it.
    await page.evaluate(() => localStorage.setItem('tacit.persona', 'u_atlas'))
    await page.reload()
    await expect(page.getByTestId('license-panel')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('verification-certificate')).toBeVisible()
    await run.shot('listing')
    await page.getByTestId('license-option-robot_deploy').click()
    await page.getByTestId('license-button').click()
    await page.getByTestId('agree-terms').click()
    await run.time('license (UI)', 3, async () => {
      await page.getByTestId('confirm-license').click()
      await expect(page.getByTestId('license-receipt')).toBeVisible({ timeout: 20_000 })
    })
    await expect(page.getByTestId('receipt-amount')).toContainText('499')
    await expect(page.getByTestId(`royalty-${expert}`)).toContainText('349.3')
    await run.shot('receipt')
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByTestId('download-pack').click()])
    const file = path.join(RUN_DIR, `pack-${Date.now()}.zip`)
    await dl.saveAs(file)
    const names = zipNames(file)
    fs.unlinkSync(file)
    run.note(`pack: ${names.length} files`)
    for (const n of ['skill.json', 'SOP.md', 'motion/tracks.json', 'certificates/verification.json', 'certificates/consent.json', 'LICENSE.txt']) {
      expect(names.some((x) => x.endsWith(n)), `pack lacks ${n}`).toBeTruthy()
    }
    expect(names.filter((n) => /\.(mp4|webm|mov|avi|mkv|m4v|y4m)$/i.test(n)), 'video in the pack').toEqual([])
    // The expert sees the royalty.
    await page.evaluate((e) => localStorage.setItem('tacit.persona', e), expert)
    await page.goto('/earnings')
    const after = await api<{ total: number }>(page, '/api/earnings', { user: expert })
    expect(after.total - before.total).toBeCloseTo(349.3, 1)
    await expect(page.getByTestId('earnings-total')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('earnings-ledger')).toContainText('349.3')
    await page.waitForTimeout(2500) // the chart animates in
    await run.shot('earnings')
    await run.finish()
    expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  })

  test('F7 box page shows all nine models healthy on four chips', async ({ page }, info) => {
    const run = new Run(page, info)
    await persona(page, 'u_priya')
    await run.time('box page', 3, async () => {
      await page.goto('/box')
      await expect(page.getByTestId('chip-map')).toBeVisible()
    })
    for (const id of [0, 1, 2, 3]) {
      await expect(page.getByTestId(`chip-panel-${id}`)).toBeVisible()
      await expect(page.getByTestId(`chip-panel-${id}`).getByText(/^ok$/i).first(), `chip ${id} status badge`).toBeVisible()
    }
    const rows = page.locator('[data-testid^="model-"]')
    await expect(rows).toHaveCount(9)
    const box = await api<{ chips: { models: { name: string; healthy: boolean }[] }[] }>(page, '/api/box')
    const unhealthy = box.chips.flatMap((c) => c.models).filter((m) => !m.healthy)
    expect(unhealthy, 'unhealthy models').toEqual([])
    await page.waitForTimeout(2500)
    await run.shot('box')
    await run.finish()
    expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  })
})

// ------------------------------------------------------------------------------------ extra checks (not SPEC 9 flows)
test.describe('extra', () => {
  test('X1 guided tour: every stop lands on its page and highlights its target (SPEC 8)', async ({ page }, info) => {
    const run = new Run(page, info)
    await persona(page, 'u_maria')
    await page.goto('/')
    await expect(page.getByTestId('landing-hero')).toBeVisible()
    await page.getByTestId('tour-start').first().click()
    await expect(page.getByTestId('tour')).toBeVisible()
    const targets = ['studio-source', 'verify-panel', 'lesson-player', 'robot-modes', 'license-panel', 'chip-map']
    for (const [i, t] of targets.entries()) {
      await run.time(`tour stop ${i + 1}: ${t}`, 5, async () => {
        await expect(page.locator(`[data-tour="${t}"]`).first(), `tour stop ${i + 1} has no ${t} on ${page.url()}`).toBeVisible({ timeout: 20_000 })
      })
      await page.waitForTimeout(600)
      await run.shot(`tour-${i + 1}-${t}`)
      if (i < targets.length - 1) await page.getByTestId('tour-next').click()
    }
    await page.getByTestId('tour-close').click()
    await expect(page.getByTestId('tour')).toBeHidden()
    await run.finish()
    expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  })
})
