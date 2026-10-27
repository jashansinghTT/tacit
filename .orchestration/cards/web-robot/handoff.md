# Handoff: web-robot (the Robot Lab)

Branch `work/web-robot` (merged with `main` at efa5754 and later). Owner `tacit-web-robot`.

## What it is
- `/robot` (`web/src/pages/RobotIndex.tsx`): every ready or processing skill as a row with its
  robot program, a readiness track (program, policy, evaluated), success rate, runs and last run;
  counts for programs, trained policies, robot-ready skills (>= 80%) and GR00T's health on its chip.
- `/robot/:skillId` (`web/src/pages/RobotLab.tsx`):
  - **Viewer** (`features/robot/SimViewer.tsx`, react-three-fiber): the MuJoCo scene from
    `GET /api/robot/scene?skill_id=`, z-up content under one -90° x rotation. The Panda is a group
    hierarchy built from `robot.bodies` (body pos/quat, then a joint group per hinge/slide), so a
    frame only sets joint rotations. Links are the sim's GLBs (`/sim/panda/<body>.glb`) when they
    are served (checked by magic bytes), primitives otherwise. Table, bins, objects, the
    randomisation region, a TCP trail, a ring under the current phase's object/bin, GR00T's camera
    frustums (exterior and the wrist camera riding on `panda_hand`), labels. View presets
    (overview, front, top, GR00T's exterior camera) with eased moves; snap under reduced motion.
  - **Run stream** (`features/robot/runStream.ts`): `POST /api/robot/{id}/run`, then
    `WS /ws/robot/{run_id}`. States go into a buffer that `useFrame` samples with interpolation
    (slerp for object quaternions) behind a 100 ms live delay, holding through stalls and catching
    up after bursts. React only hears low-rate changes (status, phase, GR00T calls, done) via
    zustand; telemetry and camera frames update the DOM from rAF/listeners. Finished or stopped
    runs can be replayed locally, scrubbed and slowed down.
  - **Modes** (tab bar, `data-tour="robot-modes"`, `?mode=` in the URL):
    - Replay the human: the arm follows the expert's retargeted wrist; both hands replay as
      skeletons in the workspace and the wrist path is drawn (bright where the arm has been). The
      ghost uses the sim's `meta.human.transform.matrix` (added by sim-c4 on `work/sim`) and falls
      back to the same affine computed in the browser from the twin (`features/robot/retarget.ts`,
      same steps as `lab.py: wrist_path` + `retarget_wrist_path`).
    - Train: demos/epochs choice, `POST .../train`, progress of both stages from `WS /ws/jobs/{id}`,
      live log-scale loss chart from `result.loss_curve` (stored curve after a reload).
    - Evaluate: `POST .../evaluate`, trial grid fills from `result.trials` as each trial ends; score
      ring, 80% bar, failure reasons grouped; clicking a trial re-runs that seed live with the policy.
      After a reload the grid comes from `policy.last_eval`.
    - Run policy: seeded run (and "run the scripted program on this seed" for comparison).
    - Run GR00T on chip 3: model health from `/api/box`, instruction, both 320×180 camera feeds
      under the viewer, last/p50/on-chip latency and a sparkline. Not finishing is shown as the
      expected baseline result.
  - **Explainer strip**: human demo (steps, seconds, expert) → program → sim variations (demos,
    scripted success while training) → policy (final loss, epochs) → trials (success rate), each
    from this skill's data; clicking a step opens its mode.
  - Train/evaluate job ids are kept in sessionStorage so a reload resumes the live view.
  - Unknown skill ids (e.g. the landing's `/robot/sk_sort` on the real stack) get a "not on this
    box" panel with links to the skills that are.
- `web/src/lib/api/robot.ts`: Robot Lab types (scene, status, stream messages, job results) and
  calls; reads both error shapes (`{error}` and FastAPI `{detail}`).
- `web/src/lib/mock/robot.ts`: the mock scene now has the real `tacit-sim-scene/1` shape (no mesh
  URLs, so mock mode never asks the backend for GLBs).

## Checks
- `npm run typecheck`, `npm run lint`, `npm run build`: pass.
- `web/e2e/robot.spec.ts` (8 tests: index, lab + modes + keyboard, unknown skill, replay, train,
  evaluate, policy, GR00T) passes in mock mode and against the real backend
  (`TACIT_E2E_BASE=http://127.0.0.1:8710 npx playwright test e2e/robot.spec.ts --project=smoke`;
  `TACIT_E2E_ROBOT_SKILL=<id>` picks the skill, default the first ready one). On the real stack it
  really trains (200 demos, 30 epochs) and evaluates 20 trials, so it takes several minutes.
- Evidence in `.orchestration/evidence/web-robot/` (see its README.md).

## Test ids (for QA)
`page-robotindex`, `robot-stats`, `robot-skill-list`, `robot-skill-<id>`, `page-robotlab`,
`sim-viewer`, `run-status` (`data-status` idle|starting|streaming|stopped|done|error), `run-phase`,
`sim-clock`, `playback-bar`, `joint-telemetry`, `robot-explainer`, `explainer-<demo|program|variations|policy|trials>`
(`data-state`), `robot-modes`, `mode-<replay|train|evaluate|policy|gr00t>`, `panel-<mode>`,
`run-<replay|policy|gr00t|scripted|train|evaluate>`, `stop-<mode>`, `run-outcome` (`data-success`),
`train-progress` (`data-status`), `loss-chart`, `trial-grid`, `trial-cell` (`data-state`
pending|running|success|fail), `eval-score`, `policy-seed`, `gr00t-feeds`, `camera-<exterior|wrist>`
(`data-frames`), `gr00t-instruction`, `gr00t-latency`, `robot-program`, `run-history`.

## Notes for the lead
- Nothing outside my scope was edited. The lab uses shared pieces as they are (`useSkill`,
  `useTwin`, `useJob`, `useBox`, UI primitives).
- `vite.config.ts` pins the dev server to 5710; I ran mine on 5713 with a local, uncommitted config.
- Playwright's default mock server port 5712 is shared by every web worktree (`reuseExistingServer`),
  so a mock run can hit another worktree's code; run against an own port when testing branches.
