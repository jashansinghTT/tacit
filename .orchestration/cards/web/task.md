# Card `web`: the Tacit website and app

Owner: background session `tacit-web`. Worktree: `~/tacit-wt/web` (branch `work/web`).
Lead: the `tacit` lead session (see `.orchestration/LEAD.md`). Read `docs/SPEC.md` (sections 2, 3
and 8) and all of `docs/API.md` before writing code. **The UI is the most important part of this
project**: it is what the team, the judges and customers will see. Treat it like a flagship
product launch, not a demo.

## Goal

A production-quality web app in `web/`: a landing site that sells the idea in five seconds, and
the app that runs every flow (F1 to F7) end to end against the real backend.

Stack: Vite, React 18, TypeScript (strict), Tailwind, framer-motion, @react-three/fiber + drei +
three, zustand, react-router, TanStack Query, a chart library (visx or recharts), lucide icons.
Dev server on port **5710** proxying `/api`, `/ws`, `/media` and `/sim` to `http://127.0.0.1:8710`.
`npm run build` writes `web/dist`, which the backend serves at `/`.

Until a backend endpoint exists, use a mock layer (`src/lib/mock/`, MSW or an in-app fake
selected with `VITE_TACIT_MOCK=1`) that returns exactly the shapes in `docs/API.md`. The lead's
backend comes up on 8710 during your work; switch each page to the real API as its endpoints
appear (`curl http://127.0.0.1:8710/api/health`). The final app must not depend on mocks.

## Pages

- `/` **Landing**: hero (a 3D Franka arm mirroring a pair of glowing ghost hands, or a looping
  background, plus the line "Teach a robot by showing it."); the five steps Watch → Check →
  Teach → Do → Earn as an animated sequence; "nine models, four chips, one box" with live numbers
  from `GET /api/box`; use cases (onboarding, selling skill data, robot teaching, SOPs, quality
  and safety, multilingual training, retirement capture); why it is hard to copy (read
  `docs/MOAT.md` when it lands; until then SPEC section 7); a Skill Exchange preview; footer.
  CTAs: "Capture a skill" and "Explore the Skill Exchange".
- `/studio` **Studio (Capture)**: source picker (webcam, upload, sample); the live view with
  overlays drawn over the video (2D hand skeletons from `lm2d`, gaze ray from the head box to the
  gaze target, part boxes with labels, a step timeline that fills as steps close), a latency HUD
  per model with its chip, the Coach panel (spoken questions with captions, the expert's
  transcribed answers, a mic level meter and push-to-talk plus automatic voice-activity cut-off),
  Stop → processing view (a pipeline stepper from `WS /ws/jobs/{id}` showing each stage, the model
  and chip that ran it, and timings).
- `/skills` and `/skills/:id` **Skill**: header (title, expert, verified and consent badges);
  tabs: Overview (summary, steps with keyframes and the expert's "why" quotes, models used),
  Twin (3D digital twin: body, hands, gaze ray, objects and the VGGT point cloud, synced to the
  video with a scrubber, play, slow motion, loop a step, orbit), SOP (rendered markdown, export),
  Verify (real vs fake comparison, score, point cloud), Answer questions (the expert answers
  pending "why" questions by voice). Actions: Teach, Robot Lab, List on Exchange.
- `/learn` and `/learn/:skillId` **Learn** (training use case): lesson player: step cards, the twin
  demonstrating the current step, narration with captions and a language picker, Practise mode
  (camera, live match score ring, one hint at a time, step auto-advance), "Ask the expert" (voice
  or text, streamed answer with speech), quiz, certificate.
- `/team` **Manager**: trainee progress per skill, robot readiness per skill, skills captured.
- `/robot/:skillId` **Robot Lab**: the sim viewer (Franka from `/sim/scene.json` + GLBs, posed from
  streamed `qpos`; objects; bins; optional ghost of the expert's hands), mode buttons (Replay the
  human, Train, Evaluate, Run policy, Run GR00T on chip 3), a live training loss chart, the
  evaluation grid of trials with success and failure, GR00T latency and its two camera feeds.
- `/exchange`, `/exchange/:listingId`, `/exchange/sell/:skillId` **Skill Exchange** (selling use
  case): listing grid with filters, listing detail (twin preview, robot preview, verification
  certificate, contents, terms, prices per license type), the "List this skill" wizard (consent
  checklist: motion, gaze, text yes; raw video and face never; prices; royalty split slider;
  publish), license checkout (clearly labelled demo: no payment form, no card fields), success
  state with the pack download.
- `/library` (buyer's licensed packs) and `/earnings` (expert's royalties chart and ledger).
- `/box` **Box**: the four chips as a 3D or 2.5D chip map, the models on each, health, p50
  latency sparklines, calls, device memory per member.
- A persona switcher (Maria the expert, Sam the trainee, Priya the manager, Atlas Robotics the
  buyer) in the top bar, sent as `X-Tacit-User`; a **guided demo tour** ("Show me") that walks a
  visitor through Watch, Check, Teach, Do and Earn with the seeded sample.

## Design bar

- A "control room for skills": near-black base, graphite panels, hairline borders, one electric
  accent and signal colours for healthy, warning and fault; a sharp grotesque for UI text and a
  mono for telemetry. Real data on screen, no lorem ipsum, no stock-photo filler.
- Motion with purpose (telemetry ticking, overlays scanning, skeleton glow, page transitions), and
  `prefers-reduced-motion` honoured.
- Consistent design system first: tokens (colour, type scale, spacing, radius, shadows), then
  primitives (Button, Badge, Card, Panel, Tabs, Stat, Meter, Timeline, Stepper, Toast, Dialog),
  then pages. Keyboard reachable, visible focus, captions for every generated voice line.
- Primary widths 1280 to 1920; usable at 1024; no horizontal scroll.
- Design sources (MCP tools in your session):
  - **MotionSites** (`mcp__motionsites__*`): the account is on the **free plan**, which allows
    **3 prompt retrievals in total**, and free backgrounds only. Call `my_account` first, use
    `build_page_plan` and `search_prompts` (metadata is free) to choose, then spend the three
    `get_prompt` calls on the landing hero and the two most visible sections. Use
    `list_backgrounds` with `access: "free"` for hero video backgrounds. If a result shows an
    upgrade call to action, copy it verbatim into `status.md` for the user.
  - **21st.dev** (`mcp__21st__*`): `search` and `get_inspiration` are free; `get_component`
    consumes a daily quota (watch `structuredContent.quota`). Prefer adapting a few high-quality
    components (hero, bento grid, animated beams, glowing cards, timeline) to the design system
    rather than pasting many.
- Take full-page screenshots of every page (Playwright) into `.orchestration/evidence/web/` and
  look at them critically; iterate until each page looks like a top product site.

## Tests

- `npm run typecheck`, `npm run lint` and `npm run build` pass.
- Playwright (Chromium) smoke test per page in `web/e2e/` that runs in mock mode and asserts no
  console errors. The live-camera path is testable with Chromium's fake devices:
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream
  --use-file-for-fake-video-capture=<file.y4m|mjpeg>` (the QA card will run these against the
  real stack later; make the selectors stable with `data-testid`).

## Rules

- Scope: `web/` only (assets in `web/public/`; `web/public/sim/` belongs to the sim card). Do not
  edit `backend/`, `sim/` or `docs/`; ask the lead for API changes in `status.md`.
- No real payment fields anywhere. Exchange checkout is labelled as a demo.
- Small, clear commits on `work/web`; no AI attribution in commits.
- Keep `status.md` in this folder current after every meaningful step; write `handoff.md` when done.

## Merge gate

All pages implemented against the real API (no mock dependence), typecheck, lint and build pass,
Playwright smoke suite green, screenshots of every page in evidence, `handoff.md` written.
