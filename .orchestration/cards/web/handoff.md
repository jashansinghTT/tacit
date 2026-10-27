# Handoff: web

Branch `work/web` (worktree `~/tacit-wt/web`). App in `web/`, README in `web/README.md`.

## Scope delivered (after the lead's split)

Mine: landing, design system and shared components, app shell, Studio, Skills, Skill detail,
Box, guided tour, 404. Learn/Lesson/Team, the Exchange pages and the Robot Lab belong to the
web-learn, web-exchange and web-robot cards (their pages are stubs on this branch until merged).

| Page | Route | Real API used |
|---|---|---|
| Landing | `/` | `GET /api/box` (live stats), `GET /api/exchange/listings` (preview), featured skill for links |
| Studio (F1) | `/studio` | `POST /api/skills` (live, sample, upload), `WS /ws/capture/{id}` (frames, analysis, events, steps, coach, coach_audio, transcript, saved), `POST /api/skills/{id}/process`, `WS /ws/jobs/{id}`, `GET /api/samples` |
| Skills | `/skills` | `GET /api/skills` |
| Skill (F2/F3) | `/skills/:id` | `GET /api/skills/{id}`, `/tracks`, `/twin`, `/pointcloud`, `POST /verify`, `GET /api/samples/{id}/verify`, `POST /answer`, `POST /audit`, `GET /audits`, `GET /audits/{id}`, jobs |
| Box (F7) | `/box` | `GET /api/box` every 3 s (incl. `speech_queue`, per-member memory) |
| Tour | "Show me" | live featured skill and listing ids |

Skill tabs: Overview (video with hand, gaze, part and pose overlays; steps with keyframes and the
expert's "why"; models used), Twin (3D body, hands, gaze, objects, VGGT cloud on the video's
clock; slow motion, loop step, orbit), SOP (markdown, export, print), Verify (score, metrics,
certificate, this capture next to an AI-made sample), Answer questions (voice or text through
`/answer`), Audit a run (use case 5: worker video vs expert, red/amber/green step table,
narrative, gaze checks, side-by-side videos).

## Merge gate

- No mock dependence: the mock is a build-time switch; `npm run build` contains no mock code
  (`grep -c mockFetch dist/assets/*.js` → 0) and strips `public/mock/`. Every page above runs on
  the real backend (verified against :8710 through the dev proxy on :5710).
- `npm run typecheck`, `npm run lint` (0 warnings), `npm run build`: pass.
- Playwright (`web/e2e`, Chromium): mock suite 13/13 green. Real stack (`TACIT_E2E_BASE`):
  11 specs green; the Studio live-capture spec and the audit spec pass when the backend is not
  restarted mid-test (see notes). Smoke specs: landing, hotspot detail, top-bar navigation,
  persona switcher, tour, 404, Box, Skills list, every skill tab, typed answer, audit, live
  capture with fake camera and mic, source picker.
- Evidence: `.orchestration/evidence/web/mock/` and `.orchestration/evidence/web/real/`
  (full-page screenshots of every page and skill tab, the hero detail, the tour, a live capture
  and the processing view), plus `real-studio-live-capture.png`.

## How to check

```bash
cd web && npm ci
npm run typecheck && npm run lint && npm run build
npx playwright test --project=smoke                                    # mock
TACIT_E2E_BASE=http://127.0.0.1:8710 npx playwright test --project=smoke   # real stack
```

## Notes for the lead and QA

- Real-stack tests never write into demo data: captures are named "QA e2e …" up front
  (`studioUrl`), and answers and audits only go to "QA " skills (`writableSkillId`).
- Real payloads that differ from the contract text are normalised in `src/lib/api/normalize.ts`:
  verification details (`reproj_rel`, `camera_drift`), QA rows with `step_index` and no `id`,
  audit `run_t` as `[start, end]` and gaze targets as lists, partial skills while processing.
- Backend observations reported to the lead: frequent restarts drop live captures and running
  audit jobs; a PATCH during processing is overwritten when the job saves; stop used to wait
  behind coach TTS (fixed by the lead at ~20:37).
- Shared APIs other web cards use: `components/ui/*`, `components/layout/*`,
  `components/skill/TwinViewer.tsx` (`TwinViewer`, `CloudViewer`), `components/skill/twinView.ts`,
  `components/skill/SkillPlayer.tsx`, `lib/playback.ts`, `lib/media.ts`, `e2e/fixtures.ts`.
  `three/FrankaArm.tsx` (web-robot) is used by the landing hero with props `q` and `glow`.
- Dev ports: real dev server 5710, my mock server 5719 (5711/5712/5713 belong to the other web
  cards).
