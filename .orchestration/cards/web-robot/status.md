# Status: web-robot

State: running
Updated: 2026-10-27T20:15:00+00:00

## Works (against the real backend on :8710, dev server :5713)
- `/robot/:skillId` Robot Lab: MuJoCo scene drawn from `GET /api/robot/scene?skill_id=` (GLB Panda
  posed by the kinematic tree, table, bins, objects, spawn region, camera frustums), runs streamed
  over `WS /ws/robot/{id}` into a buffer sampled with interpolation in `useFrame` (no per-frame
  React state), playback/scrub/speed once a run is recorded, joint/gripper/TCP telemetry.
- Modes (tab bar, `data-tour="robot-modes"`): Replay the human (ghost hands of both hands + the
  retargeted wrist path, mapped with the sim's affine), Train (demos then epochs, live log-scale
  loss chart), Evaluate (trial grid filling in live, click a trial to watch it re-run), Run policy
  (seeded), Run GR00T on chip 3 (both camera feeds, instruction, per-call latency).
- Explainer strip with the skill's real numbers: steps → program → demos → loss → success rate.
- `/robot` index: per-skill program, readiness track, success rate, runs; GR00T health.
- Verified from the page: scripted, replay, train (200 demos/30 epochs), evaluate (20/20),
  policy and GR00T runs (38 calls, p50 ~315 ms while the box is busy).

## Decisions
- Robot types and calls live in `web/src/lib/api/robot.ts` (mine); the shared `types.ts`/`api` are
  untouched. Run errors arrive as FastAPI `{detail}`; `robot.ts` reads both error shapes.
- Ghost hands: use `meta.human.transform.matrix` when the sim sends it (sim-c4 added it on
  work/sim); until merged the browser computes the same affine from the twin (same recipe as
  `lab.py: wrist_path` + `retarget_wrist_path`).
- GR00T not finishing is shown as the expected baseline result (warn), not a fault.
- Train/evaluate job ids persist in sessionStorage so a reload resumes the live view.

## Asked and answered
- Lead fixed replay (`finger_track(side=)`), made evaluate push `result.trials` live and persist
  `policy.last_eval`. Thanks.

## Next
Playwright `web/e2e/robot.spec.ts` (real backend), mock-mode compatibility of `mock/robot.ts`,
responsive pass (1024/1920), evidence screenshots + screen recording, handoff.

## Blockers
None.
