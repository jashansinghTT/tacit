# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flows.spec.ts >> with the capture camera >> F2 sample video is processed into a ready skill with steps, verification and SOP
- Location: e2e/flows.spec.ts:209:3

# Error details

```
Error: steps shown

expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 3
Received:    1
```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - link "Skip to content" [ref=f1e4] [cursor=pointer]:
    - /url: "#main"
  - banner [ref=f1e5]:
    - generic [ref=f1e6]:
      - link "Tacit home" [ref=f1e7] [cursor=pointer]:
        - /url: /
        - generic [ref=f1e8]: tacit
      - navigation "Main" [ref=f1e18]:
        - link "Studio" [ref=f1e19] [cursor=pointer]:
          - /url: /studio
        - link "Skills" [ref=f1e20] [cursor=pointer]:
          - /url: /skills
        - link "Learn" [ref=f1e22] [cursor=pointer]:
          - /url: /learn
        - link "Robot Lab" [ref=f1e23] [cursor=pointer]:
          - /url: /robot
        - link "Exchange" [ref=f1e24] [cursor=pointer]:
          - /url: /exchange
        - link "Team" [ref=f1e25] [cursor=pointer]:
          - /url: /team
        - link "Box" [ref=f1e26] [cursor=pointer]:
          - /url: /box
      - generic [ref=f1e27]:
        - link "9/9 models · 4 chips" [ref=f1e28] [cursor=pointer]:
          - /url: /box
        - button "Show me" [ref=f1e33] [cursor=pointer]
        - button "Maria Chen Expert" [ref=f1e37] [cursor=pointer]:
          - generic [ref=f1e39]:
            - generic [ref=f1e40]: Maria Chen
            - generic [ref=f1e41]: Expert
  - main [ref=f1e45]:
    - generic [ref=f1e46]:
      - generic [ref=f1e47]:
        - navigation "Breadcrumb" [ref=f1e48]:
          - link "Skills" [ref=f1e50] [cursor=pointer]:
            - /url: /skills
          - generic [ref=f1e51]: QA Arranging dried stems in a vase
        - heading "QA Arranging dried stems in a vase" [level=1] [ref=f1e55]
        - generic [ref=f1e56]:
          - generic [ref=f1e57]:
            - generic [aria-hidden] [ref=f1e58]: MC
            - text: Maria Chen
            - generic [ref=f1e59]: · Senior assembler, 22 years
          - generic [ref=f1e60]: ·
          - generic [ref=f1e61]: Oct 27
          - generic [ref=f1e62]:
            - text: Verified
            - generic [ref=f1e66]: "0.90"
          - generic "Motion, gaze and text shared with consent; raw video and face never" [ref=f1e67]: Consent signed
      - generic [ref=f1e72]:
        - link "Teach" [ref=f1e73] [cursor=pointer]:
          - /url: /learn/sk_390b7e27
        - link "Robot Lab" [ref=f1e77] [cursor=pointer]:
          - /url: /robot/sk_390b7e27
        - link "List on Exchange" [ref=f1e81] [cursor=pointer]:
          - /url: /exchange/sell/sk_390b7e27
    - tablist "Skill sections" [ref=f1e86]:
      - tab "Overview" [selected] [ref=f1e87] [cursor=pointer]
      - tab "Twin" [ref=f1e92] [cursor=pointer]
      - tab "SOP" [ref=f1e96] [cursor=pointer]
      - tab "Verify" [ref=f1e100] [cursor=pointer]
      - tab "Answer questions 1" [ref=f1e104] [cursor=pointer]:
        - text: Answer questions
        - generic [ref=f1e108]: "1"
      - tab "Audit a run" [ref=f1e109] [cursor=pointer]
    - tabpanel "overview" [ref=f1e114]:
      - generic [ref=f1e115]:
        - generic [ref=f1e116]:
          - generic [ref=f1e119]:
            - generic [ref=f1e120]:
              - generic "Recording of QA Arranging dried stems in a vase" [ref=f1e121]
              - generic: 10 fps analysis
            - generic [ref=f1e122]:
              - button "Play" [ref=f1e123] [cursor=pointer]
              - generic [ref=f1e126]:
                - text: 00:00.0
                - generic [ref=f1e127]: / 00:44.5
              - radiogroup "Playback speed" [ref=f1e128]:
                - radio "¼×" [ref=f1e129] [cursor=pointer]
                - radio "½×" [ref=f1e131] [cursor=pointer]
                - radio "1×" [checked] [ref=f1e133] [cursor=pointer]
              - button "Loop step" [ref=f1e136] [cursor=pointer]
              - group "Overlay layers" [ref=f1e143]:
                - button "Hands" [pressed] [ref=f1e144] [cursor=pointer]
                - button "Gaze" [pressed] [ref=f1e150] [cursor=pointer]
                - button "Parts" [pressed] [ref=f1e154] [cursor=pointer]
                - button "Body" [pressed] [ref=f1e159] [cursor=pointer]
            - generic [ref=f1e164] [cursor=pointer]:
              - generic "1. Insert Stem into Vase" [ref=f1e165]:
                - generic [ref=f1e166]:
                  - generic [ref=f1e167]: "01"
                  - generic [ref=f1e168]: Insert Stem into Vase
              - generic "Why do we need to insert the stem in this specific way?"
          - region "Steps" [ref=f1e169]:
            - article [ref=f1e170] [cursor=pointer]:
              - generic [ref=f1e171]:
                - img "Keyframe for step 1" [ref=f1e172]
                - generic [ref=f1e173]: 00:06.8–00:44.4
              - generic [ref=f1e174]:
                - generic [ref=f1e175]:
                  - heading "01Insert Stem into Vase" [level=3] [ref=f1e176]
                  - generic [ref=f1e177]:
                    - generic [ref=f1e178]: right
                    - generic [ref=f1e184]: right hand
                - paragraph [ref=f1e188]: Insert the item held in the right hand into the vase on your right.
                - blockquote [ref=f1e189]:
                  - generic [ref=f1e193]:
                    - paragraph [ref=f1e194]: To place the stem into the vase.
                    - paragraph [ref=f1e195]: Inferred from the video; waiting for Maria to confirm
                - list [ref=f1e199]:
                  - listitem [ref=f1e200]: Hold the stem steady while inserting
                  - listitem [ref=f1e203]: Align the stem with the vase opening
        - complementary [ref=f1e206]:
          - generic [ref=f1e207]:
            - heading "Summary" [level=2] [ref=f1e210]
            - generic [ref=f1e211]:
              - paragraph [ref=f1e212]: Place each stem into the vase to create a finished arrangement, ensuring even distribution and stability.
              - generic [ref=f1e213]:
                - generic [ref=f1e214]:
                  - term [ref=f1e215]: Steps
                  - definition [ref=f1e216]: "1"
                - generic [ref=f1e217]:
                  - term [ref=f1e218]: Length
                  - definition [ref=f1e219]: 0:44
                - generic [ref=f1e220]:
                  - term [ref=f1e221]: Source
                  - definition [ref=f1e222]: sample
          - generic [ref=f1e223]:
            - heading "Safety" [level=2] [ref=f1e226]
            - list [ref=f1e231]:
              - listitem [ref=f1e232]: Do not force the stem into the vase.
              - listitem [ref=f1e234]: Keep the vase stable while inserting.
              - listitem [ref=f1e236]: Avoid touching the vase with dirty hands.
          - generic [ref=f1e238]:
            - heading "Models used" [level=2] [ref=f1e241]
            - table [ref=f1e243]:
              - rowgroup [ref=f1e244]:
                - row [ref=f1e245]:
                  - columnheader "Model" [ref=f1e246]
                  - columnheader "Where" [ref=f1e247]
                  - columnheader "Calls" [ref=f1e248]
                  - columnheader "p50" [ref=f1e249]
              - rowgroup [ref=f1e250]:
                - row [ref=f1e251]:
                  - cell "Gaze-LLE" [ref=f1e252]
                  - cell "chip 0" [ref=f1e253]
                  - cell "445" [ref=f1e256]
                  - cell "41.9 ms" [ref=f1e257]
                - row [ref=f1e258]:
                  - cell "HaMeR" [ref=f1e259]
                  - cell "chip 0" [ref=f1e260]
                  - cell "647" [ref=f1e263]
                  - cell "37.5 ms" [ref=f1e264]
                - row [ref=f1e265]:
                  - cell "RF-DETR" [ref=f1e266]
                  - cell "chip 0" [ref=f1e267]
                  - cell "445" [ref=f1e270]
                  - cell "37.7 ms" [ref=f1e271]
                - row [ref=f1e272]:
                  - cell "VGGT-1B" [ref=f1e273]
                  - cell "chip 0" [ref=f1e274]
                  - cell "1" [ref=f1e277]
                  - cell "3.37 s" [ref=f1e278]
                - row [ref=f1e279]:
                  - cell "S2 Pro" [ref=f1e280]
                  - cell "chip 1" [ref=f1e281]
                  - cell "2" [ref=f1e284]
                  - cell "78.8 s" [ref=f1e285]
                - row [ref=f1e286]:
                  - cell "gpt-oss-20b" [ref=f1e287]
                  - cell "chip 2" [ref=f1e288]
                  - cell "2" [ref=f1e291]
                  - cell "3.84 s" [ref=f1e292]
                - row [ref=f1e293]:
                  - cell "MediaPipe" [ref=f1e294]
                  - cell "CPU" [ref=f1e295]
                  - cell "445" [ref=f1e300]
                  - cell "43.3 ms" [ref=f1e301]
  - status
```

# Test source

```ts
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
  196 |         await expect(page.locator(`[data-tour="${t}"]`).first(), `tour stop ${i + 1} has no ${t} on ${page.url()}`).toBeVisible({ timeout: 20_000 })
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
> 245 |     expect(await steps.count(), 'steps shown').toBeGreaterThanOrEqual(3)
      |                                                ^ Error: steps shown
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
  297 |     const question = page.getByTestId('coach-question').first()
  298 |     await run.time('first coach question (from start)', 60, async () => {
  299 |       await expect(question).toBeVisible({ timeout: 120_000 })
  300 |     })
  301 |     run.note(`coach asked: ${await question.innerText()}`)
  302 |     await run.shot('coach-question')
  303 |     const answer = page.getByTestId('expert-answer').first()
  304 |     try {
  305 |       await run.time('mic picks up the spoken answer (from question)', 30, async () => {
  306 |         await expect(answer).toBeVisible({ timeout: 90_000 })
  307 |       })
  308 |       await run.time('answer transcribed (from end of speech)', 5, async () => {
  309 |         await expect(answer).not.toContainText(/Transcribing/i, { timeout: 90_000 })
  310 |       })
  311 |     } finally {
  312 |       clearInterval(probe)
  313 |       run.note(`capture timeline:\n${timeline.join('\n')}`)
  314 |     }
  315 |     const heard = await answer.innerText()
  316 |     run.note(`transcript: ${heard}`)
  317 |     expect(overlap(heard, answerText), `transcript "${heard}" vs "${answerText}"`).toBeGreaterThanOrEqual(0.5)
  318 |     await run.shot('answer')
  319 |     await page.getByTestId('capture-stop').click()
  320 |     await expect(page.getByTestId('processing-panel')).toBeVisible({ timeout: 20_000 })
  321 |     const open = page.getByTestId('open-skill')
  322 |     await expect(open).toBeVisible({ timeout: 60_000 })
  323 |     await run.time('process the capture (UI)', 180, async () => {
  324 |       await expect
  325 |         .poll(async () => (await api<{ status: string }>(page, `/api/skills/${skillId}`)).status, { timeout: 15 * 60_000, intervals: [3000] })
  326 |         .toMatch(/ready|failed/)
  327 |     })
  328 |     const sk = await api<{ status: string; qa: { answer: string | null; step_index: number | null }[]; steps: { index: number; why: string; why_source: string }[] }>(
  329 |       page,
  330 |       `/api/skills/${skillId}`,
  331 |     )
  332 |     expect(sk.status).toBe('ready')
  333 |     const kept = sk.qa.find((q) => q.answer && overlap(q.answer, answerText) >= 0.5)
  334 |     expect(kept, `answer not kept: ${JSON.stringify(sk.qa)}`).toBeTruthy()
  335 |     const step = sk.steps.find((s) => s.index === kept!.step_index)
  336 |     expect(step?.why_source, 'the answer is not attached to a step').toBe('expert')
  337 |     await open.click()
  338 |     await run.shot('captured-skill')
  339 |     await run.finish()
  340 |     expect(run.consoleErrors, `console errors:\n${run.consoleErrors.join('\n')}`).toEqual([])
  341 |   })
  342 | })
  343 | 
  344 | // ------------------------------------------------------------------------------------ F4
  345 | test.describe('with the practice camera', () => {
```