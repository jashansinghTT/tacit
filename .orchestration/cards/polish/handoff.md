# Handoff: polish

Branch `work/polish` (worktree `~/tacit-wt/web`), from main 0c7ddb5 with main merged since
(web-robot, liveperf, the QA-9/10 cherry-pick). The whole app, one product.

## What changed

**Demo path and QA findings**
- QA-9: hands-free answering armed only once the newest question was voiced, so with slow S2 Pro
  it never armed. It now listens as soon as a question's text arrives, raises the speech threshold
  while the coach speaks, ducks that voice while the expert talks, and pins each answer to the
  question open when they began. "Transcribing with Whisper… N s" on the bubble. Mock regression.
- QA-10: the Lesson page carries the tour's `lesson-player` target again; the tour follows the first
  seeded sample skill (the vase skill the demo script uses). Every tour stop has its target on the
  release backend: Watch, Check, Teach, Do, Earn, Box.
- QA-12 mitigation: page load failures speak plainly (box not answering, model unavailable, server
  error) with the raw status small underneath and a way back; the listing page uses it.

**Performance**
- First load preloads only `vendor` + entry. Rollup had parked Vite's preload helper and shared
  helpers inside the three.js and charts chunks, so every page preloaded ~1.2 MB extra. three.js
  (~980 KB with the Robot Lab) now loads with the first 3D view, recharts with Earnings; Skills and
  Box load ~414 KB of JS.
- Landing CLS 0.04 → 0.0007 (the hero's negative margin collapsed through the route wrapper).
  LCP ≈ 1.2 s on a production preview; the hero canvas mounts in ≈ 0.4 s into a fixed-size frame.

**Consistency**
- One `SkillStatusBadge` (cards, Team table, skill header said Ready / ready / processing).
- One served-by strip (`ServedByList`); the lesson's copy called any chipless CPU result "CPU",
  hiding a chip model's CPU fallback.
- Verification scores as one percent format everywhere (`fmtScorePct`): ring 24 and badge 0.23
  disagreed before.
- Earnings shows current skill titles (ledger rows keep the title from licence time); Sell copy no
  longer reads as if the skill had six steps; Box and landing map chip groups by prefix (the LLM
  group is now `gpt-oss-20b-fast`); neutral pronouns for the expert in the Robot Lab copy.
- One content width (1680 px) for header and pages.

**Responsive and accessible**
- No horizontal overflow on any of the 22 pages at 768, 1024, 1280 and 1920 (Team scrolled sideways
  at tablet width: an sr-only label escaped its scroll container).
- Long multi-step titles ("… (1 of 5)") wrap in the step cards, lesson header and twin list; lesson
  rail and timeline clamp gracefully.
- Text contrast at AA: `fg-subtle` #6e7580 → #868d97 (≥ 5:1 on every surface), `fg-faint`
  #4a5058 → #767d88 (4.8:1 on the page).
- Keyboard: every focus stop shows a ring on every page checked (landing, studio, skill, lesson,
  exchange, sell, robot, box); the step timeline is a keyboard slider; step cards play on
  Enter/Space; cards ring on keyboard focus.

## Checks

- `npm run typecheck`, `npm run lint` (0 warnings): pass.
- Mock smoke suite (`npx playwright test --project=smoke`): 23/23 (Robot Lab spec included).
- Real stack: Exchange suite (`-c e2e/exchange.config.ts`) 3/3; Learn suite: see status.md (needs a
  quiet window on chip 0).
- Demo walk of docs/DEMO.md on the release backend, each persona: `tools/demo-walk.mjs`
  (1440 with live capture, 1920 without), screenshots in `.orchestration/evidence/polish/walk-*`.

## Evidence

`.orchestration/evidence/polish/before/` and `after/`: all 22 pages as their persona at 1440 and
1920, each with `audit.txt` (load time, overflow, console errors; after: none).

## Tools added (web/tools)

`polish-shots.mjs` (every page × persona × width + audit), `demo-walk.mjs`, `perf.mjs` (FCP, LCP,
CLS, JS bytes), `cls.mjs` (layout-shift sources), `keyboard.mjs` (focus-ring audit),
`overflow.mjs` (WIDTHS=…).

## Notes

- Health dips: during QA's runs the top-bar pill read 5/9 and 8/9 for a while (busy models failing
  health checks); reported to the lead.
- Both seeded skills are already listed, so DEMO.md step 6 ("List on Exchange") lands on "This skill
  is already on the Exchange"; list a fresh capture, or reseed, before the demo.
