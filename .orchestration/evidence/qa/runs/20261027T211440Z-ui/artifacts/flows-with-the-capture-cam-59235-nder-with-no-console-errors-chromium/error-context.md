# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flows.spec.ts >> with the capture camera >> F1 landing and navigation render with no console errors
- Location: e2e/flows.spec.ts:147:3

# Error details

```
Error: tour stop 3 has no lesson-player on http://127.0.0.1:5790/learn/sk_3b7c613d

expect(locator).toBeVisible() failed

Locator: locator('[data-tour="lesson-player"]').first()
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - tour stop 3 has no lesson-player on http://127.0.0.1:5790/learn/sk_3b7c613d locator('[data-tour="lesson-player"]').first() with timeout 20000ms
  - waiting for locator('[data-tour="lesson-player"]').first()

```

```yaml
- link "Skip to content":
  - /url: "#main"
- banner:
  - link "Tacit home":
    - /url: /
    - text: tacit
  - navigation "Main":
    - link "Studio":
      - /url: /studio
    - link "Skills":
      - /url: /skills
    - link "Learn":
      - /url: /learn
    - link "Robot Lab":
      - /url: /robot
    - link "Exchange":
      - /url: /exchange
    - link "Team":
      - /url: /team
    - link "Box":
      - /url: /box
  - link "9/9 models · 4 chips":
    - /url: /box
  - button "Show me"
  - button "Sam Okafor Trainee"
- main:
  - navigation "Breadcrumb":
    - link "Learn":
      - /url: /learn
    - text: Candle Jar and Bottle Check
  - text: Lesson
  - heading "Candle Jar and Bottle Check" [level=1]
  - paragraph: Organize and inspect candle jars and bottles at a workbench, ensuring proper placement and condition.
  - text: Taught by Maria Chen · Senior assembler, 22 years 5 steps 0:38 Verified 0.94 Learning as Sam Okafor Lesson language
  - combobox "Lesson language":
    - option "English" [selected]
    - option "Español"
    - option "Français"
    - option "Deutsch"
    - option "Português"
    - option "हिन्दी"
    - option "中文"
    - option "日本語"
    - option "한국어"
  - button "Play intro"
  - link "Skill record":
    - /url: /skills/sk_3b7c613d
  - navigation "Lesson steps":
    - text: Steps 0/5 practised
    - list:
      - listitem:
        - button "1 Pick up cup 0:01–0:06"
      - listitem:
        - button "2 Place cup on bottle 0:06–0:11"
      - listitem:
        - button "3 Pick cup again 0:14–0:21"
      - listitem:
        - button "4 Place cup on cup 0:21–0:25"
      - listitem:
        - button "5 Check bottle 0:28–0:37"
      - listitem:
        - button "Quiz and certificate 0 questions"
  - radiogroup "Lesson mode":
    - radio "Watch" [checked]
    - radio "Practise"
    - radio "Guide my hand"
  - text: Watch Maria do the step, with narration. 02/05Maria, looping this step
  - paragraph: Step 2. Place cup on bottle. Place the cup on the bottle in front of you and straighten it.
  - text: Next step in 1
  - button "Stay"
  - button "Go"
  - button "Pause"
  - button "Seek within this step"
  - text: 00:07.2 / 00:11.8
  - radiogroup "Playback speed":
    - radio "¼×"
    - radio "½×"
    - radio "1×" [checked]
  - radiogroup "View":
    - radio "Video" [checked]
    - radio "3D"
  - button "Mute narration"
  - button "Replay narration"
  - text: Narrating
  - switch "Auto-advance" [checked]
  - text: Auto-advance
  - group "Overlay layers":
    - button "Hands" [pressed]
    - button "Gaze" [pressed]
    - button "Parts" [pressed]
    - button "Body" [pressed]
  - region "Place cup on bottle":
    - text: Step 2 of 5 · 5.1 s · 0:06–0:11
    - heading "Place cup on bottle" [level=2]
    - button "Back"
    - button "Next"
    - paragraph: Place the cup on the bottle in front of you and straighten it.
    - text: Use Right hand Eyes on bottle Parts cup in front of you, bottle in front of you, cup on your right
    - figure "Maria Chen Inferred from the video, not yet confirmed by Maria":
      - text: Why it matters
      - blockquote: Aligns cup with bottle for stability.
      - text: Maria Chen Inferred from the video, not yet confirmed by Maria
    - text: Tips from the floor
    - list:
      - listitem: Ensure the cup sits flush on the bottle.
  - region "Ask the expert":
    - heading "Ask the expert" [level=2]
    - paragraph: Answers come from Maria's recording and answers, written by gpt-oss-20b on chip 2 and spoken by S2 Pro.
    - text: Answer language
    - combobox "Answer language":
      - option "English" [selected]
      - option "Español"
      - option "Français"
      - option "Deutsch"
      - option "Português"
      - option "हिन्दी"
      - option "中文"
      - option "日本語"
      - option "한국어"
    - paragraph: Stuck on a step? Ask why Maria does it this way, by voice or by typing.
    - button "Why place cup on bottle?"
    - button "What is the most common mistake in step 2?"
    - button "How do I know step 2 is done right?"
    - button "Ask by voice"
    - textbox "Your question":
      - /placeholder: Ask Maria a question…
    - button "Send" [disabled]
- dialog "Guided demo":
  - button "Watch"
  - button "Check"
  - button "Teach"
  - button "Do"
  - button "Earn"
  - button "Box"
  - button "End the tour"
  - text: Step 3 of 6 · Teach
  - heading "Teach the next person" [level=2]
  - paragraph: "Sam, a new hire, learns the skill: each step with Maria's own \"why\", the 3D twin doing it, narration in the trainee's language, and live practice on camera with a match score."
  - paragraph: S2 Pro, Whisper on chip 1 · gpt-oss-20b on chip 2 · HaMeR on chip 0
  - text: ← → to move · Esc to leave
  - button "Back"
  - 'button "Next: Do"'
- status
```

# Test source

```ts
  96  |     const w = window as unknown as { __qaMedia?: HTMLMediaElement[] }
  97  |     return (w.__qaMedia ?? []).filter((m) => (m.currentSrc || m.src).includes(r)).reduce((a, m) => a + (m.currentTime || 0), 0)
  98  |   }, re)
  99  | }
  100 | 
  101 | const words = (s: string) => new Set(s.toLowerCase().split(/\s+/).map((w) => w.replace(/[.,!?;:'"]/g, '')).filter((w) => w.length > 2))
  102 | const overlap = (a: string, b: string) => [...words(a)].filter((w) => words(b).has(w)).length / Math.max(1, words(b).size)
  103 | 
  104 | async function api<T>(page: Page, url: string, init?: { method?: string; data?: unknown; user?: string }): Promise<T> {
  105 |   const r = await page.request.fetch(url, { method: init?.method ?? 'GET', data: init?.data, headers: { 'X-Tacit-User': init?.user ?? 'u_maria' } })
  106 |   expect(r.ok(), `${init?.method ?? 'GET'} ${url} -> ${r.status()}`).toBeTruthy()
  107 |   return (await r.json()) as T
  108 | }
  109 | 
  110 | /** What this run made; scripts/e2e/teardown.py removes it after the run. */
  111 | function remember(kind: 'skills' | 'listings', id: string) {
  112 |   fs.mkdirSync(RUN_DIR, { recursive: true })
  113 |   const file = path.join(RUN_DIR, 'created.json')
  114 |   const made = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { skills: [], listings: [] }
  115 |   if (!made[kind].includes(id)) made[kind].push(id)
  116 |   fs.writeFileSync(file, JSON.stringify(made, null, 2))
  117 | }
  118 | 
  119 | async function qaTitle(page: Page, skillId: string) {
  120 |   remember('skills', skillId)
  121 |   const sk = await api<{ title: string }>(page, `/api/skills/${skillId}`)
  122 |   if (!sk.title.startsWith('QA ')) await api(page, `/api/skills/${skillId}`, { method: 'PATCH', data: { title: `QA ${sk.title}` } })
  123 | }
  124 | 
  125 | /** The skill the later flows share: the newest ready QA skill made from a sample (F2 makes one). */
  126 | async function sharedSkill(page: Page): Promise<string> {
  127 |   const fromEnv = process.env.QA_SKILL_ID
  128 |   if (fromEnv) return fromEnv
  129 |   const file = path.join(RUN_DIR, 'shared-skill.txt')
  130 |   if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim()
  131 |   const list = await api<{ id: string; title: string; status: string; source_kind: string }[]>(page, '/api/skills?status=ready&include_test=1')
  132 |   const qa = list.find((s) => s.title.startsWith('QA ') && s.source_kind !== 'live')
  133 |   expect(qa, 'no ready QA skill: run F2 first').toBeTruthy()
  134 |   return qa!.id
  135 | }
  136 | 
  137 | function zipNames(file: string): string[] {
  138 |   const out = execFileSync('python3', ['-c', 'import sys, zipfile; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', file])
  139 |   return out.toString().trim().split('\n')
  140 | }
  141 | 
  142 | // Not serial mode: a failing flow must not skip the others. workers=1 keeps them in file order.
  143 | 
  144 | // ------------------------------------------------------------------------------------ F1
  145 | // The config's browser has the capture camera (capture.y4m) and the spoken answer (answer.wav).
  146 | test.describe('with the capture camera', () => {
  147 |   test('F1 landing and navigation render with no console errors', async ({ page }, info) => {
  148 |     const run = new Run(page, info)
  149 |     await persona(page, 'u_maria')
  150 |     await run.time('landing page', 3, async () => {
  151 |       await page.goto('/')
  152 |       await expect(page.getByTestId('landing-hero')).toBeVisible()
  153 |     })
  154 |     await page.waitForLoadState('networkidle').catch(() => {})
  155 |     await run.shot('landing')
  156 |     for (const sec of ['landing-flow', 'landing-box', 'landing-moat', 'landing-exchange']) {
  157 |       await expect(page.getByTestId(sec), `landing section ${sec}`).toBeAttached()
  158 |     }
  159 |     const pages: [string, string][] = [
  160 |       ['studio', '/studio'],
  161 |       ['skills', '/skills'],
  162 |       ['learn', '/learn'],
  163 |       ['robot', '/robot'],
  164 |       ['exchange', '/exchange'],
  165 |       ['team', '/team'],
  166 |       ['box', '/box'],
  167 |     ]
  168 |     let lastHeading = ''
  169 |     for (const [key, url] of pages) {
  170 |       await run.time(`navigate to ${url}`, 2, async () => {
  171 |         await page.getByTestId(`nav-${key}`).first().click()
  172 |         await expect(page).toHaveURL(new RegExp(`${url}(\\?|$)`))
  173 |         // The new page's own heading, not the old page fading out.
  174 |         await expect(page.locator('h1')).toHaveCount(1)
  175 |         await expect(page.locator('h1')).not.toHaveText(lastHeading === '' ? /^$/ : lastHeading)
  176 |         await expect(page.locator('h1')).toBeVisible()
  177 |       })
  178 |       lastHeading = (await page.locator('h1').innerText()).trim()
  179 |       await page.waitForLoadState('networkidle').catch(() => {})
  180 |       await page.waitForTimeout(800)
  181 |       const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  182 |       expect(wide, `${url} scrolls horizontally by ${wide}px`).toBeLessThanOrEqual(1)
  183 |       await run.shot(key)
  184 |     }
  185 |     await page.setViewportSize({ width: 1280, height: 800 })
  186 |     await page.goto('/')
  187 |     const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  188 |     expect(wide, `landing scrolls horizontally at 1280 px by ${wide}px`).toBeLessThanOrEqual(1)
  189 |     // The guided demo ("Show me", SPEC 8): Watch, Check, Teach, Do, Earn, Box, each on its own page and target.
  190 |     await page.setViewportSize({ width: 1440, height: 900 })
  191 |     await page.getByTestId('tour-start').first().click()
  192 |     await expect(page.getByTestId('tour')).toBeVisible()
  193 |     const targets = ['studio-source', 'verify-panel', 'lesson-player', 'robot-modes', 'license-panel', 'chip-map']
  194 |     for (const [i, t] of targets.entries()) {
  195 |       await run.time(`tour stop ${i + 1}: ${t}`, 5, async () => {
> 196 |         await expect(page.locator(`[data-tour="${t}"]`).first(), `tour stop ${i + 1} has no ${t} on ${page.url()}`).toBeVisible({ timeout: 20_000 })
      |                                                                                                                     ^ Error: tour stop 3 has no lesson-player on http://127.0.0.1:5790/learn/sk_3b7c613d
  197 |       })
  198 |       await page.waitForTimeout(600)
  199 |       await run.shot(`tour-${i + 1}-${t}`)
  200 |       if (i < targets.length - 1) await page.getByTestId('tour-next').click()
  201 |     }
  202 |     await page.getByTestId('tour-close').click()
  203 |     await expect(page.getByTestId('tour')).toBeHidden()
  204 |     await run.finish()
  205 |     expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  206 |   })
  207 | 
  208 |   // ---------------------------------------------------------------------------------- F2
  209 |   test('F2 sample video is processed into a ready skill with steps, verification and SOP', async ({ page }, info) => {
  210 |     test.setTimeout(40 * 60_000)
  211 |     const run = new Run(page, info)
  212 |     await persona(page, 'u_maria')
  213 |     const samples = await api<{ id: string; kind: string; title: string }[]>(page, '/api/samples')
  214 |     const sample = samples.find((s) => s.id === process.env.QA_SAMPLE) ?? samples.find((s) => s.kind === 'real')
  215 |     expect(sample, 'no real sample in /api/samples').toBeTruthy()
  216 |     await page.goto('/studio?source=sample')
  217 |     await page.getByTestId(`sample-${sample!.id}`).click()
  218 |     await run.shot('sample-picked')
  219 |     const t0 = Date.now()
  220 |     // Tag the new skill as a QA test skill the moment it exists, so a failed run never leaves it in the demo.
  221 |     const created = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/skills' && r.request().method() === 'POST')
  222 |     await page.getByTestId('sample-offline').click()
  223 |     const skillId = ((await (await created).json()) as { skill_id: string }).skill_id
  224 |     await qaTitle(page, skillId)
  225 |     fs.mkdirSync(RUN_DIR, { recursive: true })
  226 |     fs.writeFileSync(path.join(RUN_DIR, 'shared-skill.txt'), skillId)
  227 |     await expect(page.getByTestId('processing-panel')).toBeVisible({ timeout: 20_000 })
  228 |     await run.shot('processing')
  229 |     await run.time('process the sample (UI)', 300, async () => {
  230 |       await expect
  231 |         .poll(async () => (await api<{ status: string }>(page, `/api/skills/${skillId}`)).status, { timeout: 30 * 60_000, intervals: [5000] })
  232 |         .toMatch(/^(ready|failed)$/)
  233 |     })
  234 |     run.note(`processing took ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  235 |     expect((await api<{ status: string }>(page, `/api/skills/${skillId}`)).status).toBe('ready')
  236 |     // The page must follow the job to the end (also across a backend restart, which re-runs it under a new id).
  237 |     const open = page.getByTestId('open-skill')
  238 |     await expect(open, 'the Studio does not show the finished job').toHaveText(/^Open the skill$/, { timeout: 60_000 })
  239 |     await run.shot('processed')
  240 |     await open.click()
  241 |     await expect(page).toHaveURL(new RegExp(`/skills/${skillId}`))
  242 |     await page.reload()
  243 |     const steps = page.getByTestId('steps-list').locator('[data-testid^="step-"]')
  244 |     await expect(steps.first()).toBeVisible()
  245 |     expect(await steps.count(), 'steps shown').toBeGreaterThanOrEqual(3)
  246 |     await run.shot('skill-overview')
  247 |     const sk = await api<{ verification: { status: string; score: number }; steps: unknown[]; sop_markdown: string }>(page, `/api/skills/${skillId}`)
  248 |     run.note(`skill ${skillId}: ${sk.steps.length} steps, verification ${sk.verification.status} ${sk.verification.score}`)
  249 |     await expect(page.getByText(/verified/i).first()).toBeVisible()
  250 |     await page.getByTestId('tab-sop').click()
  251 |     await expect(page.getByTestId('sop-panel')).toBeVisible()
  252 |     await expect(page.getByTestId('sop-panel')).toContainText(sk.sop_markdown.split('\n').find((l) => l.startsWith('#'))!.replace(/^#+\s*/, '').slice(0, 20))
  253 |     await run.shot('skill-sop')
  254 |     await page.getByTestId('tab-verify').click()
  255 |     await expect(page.getByTestId('verify-summary')).toBeVisible()
  256 |     await run.shot('skill-verify')
  257 |     await run.finish()
  258 |     expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  259 |   })
  260 | 
  261 |   // ---------------------------------------------------------------------------------- F3
  262 |   test('F3 live capture with the fake camera gets a spoken coach question and a transcribed answer', async ({ page }, info) => {
  263 |     test.setTimeout(30 * 60_000)
  264 |     const run = new Run(page, info)
  265 |     await persona(page, 'u_maria')
  266 |     const answerText = fs.readFileSync(path.join(MEDIA, 'answer.txt'), 'utf8').trim()
  267 |     await page.goto('/studio?source=webcam')
  268 |     await page.getByTestId('camera-preview').click()
  269 |     await run.time('camera preview', 5, async () => {
  270 |       await expect.poll(async () => page.locator('video').first().evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 10_000 }).toBeGreaterThan(0)
  271 |     })
  272 |     const created = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/skills' && r.request().method() === 'POST')
  273 |     await page.getByTestId('capture-start').click()
  274 |     const skillId = ((await (await created).json()) as { skill_id: string }).skill_id
  275 |     await qaTitle(page, skillId)
  276 |     await expect(page.getByTestId('overlay-canvas')).toBeVisible({ timeout: 15_000 })
  277 |     await expect(page.getByTestId('latency-hud')).toBeVisible()
  278 |     await page.waitForTimeout(3000)
  279 |     await run.shot('live-analysis')
  280 |     // Timeline for the record: questions, voices still coming, answers, and whether the mic is recording.
  281 |     const timeline: string[] = []
  282 |     const t0 = Date.now()
  283 |     const probe = setInterval(() => {
  284 |       void page
  285 |         .evaluate(() => ({
  286 |           q: document.querySelectorAll('[data-testid="coach-question"]').length,
  287 |           coming: [...document.querySelectorAll('[data-testid="coach-question"]')].filter((e) => /voice coming/.test(e.textContent ?? '')).length,
  288 |           a: document.querySelectorAll('[data-testid="expert-answer"]').length,
  289 |           rec: document.querySelector('[data-testid="talk-button"]')?.getAttribute('aria-pressed') === 'true',
  290 |         }))
  291 |         .then((x) => {
  292 |           const line = `q=${x.q} voice_coming=${x.coming} answers=${x.a} mic=${x.rec ? 'REC' : '-'}`
  293 |           if (timeline.at(-1)?.split(' ').slice(1).join(' ') !== line) timeline.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${line}`)
  294 |         })
  295 |         .catch(() => {})
  296 |     }, 500)
```