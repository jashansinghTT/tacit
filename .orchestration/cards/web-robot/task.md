# Card `web-robot`: the Robot Lab (robots learn the skill in simulation)

Owner: `tacit-web-robot`. Worktree `~/tacit-wt/web-robot`, branch `work/web-robot` (branched from
`work/web`). Dev server port **5713**. Read first: `docs/SPEC.md` (F5), `docs/API.md` (Robot Lab),
the web card `.orchestration/cards/web/task.md` (design bar, rules), the sim card
`.orchestration/cards/sim/task.md` and `sim/README.md` in `~/tacit` (main), and the existing 3D code in
`web/src/three` (`FrankaArm.tsx`, `GhostHand.tsx`, `HeroScene.tsx`). The UI is the most important part
of this product; the Robot Lab is where "teach a robot by showing it" becomes visible.

## Pages you own
- `web/src/pages/RobotIndex.tsx` (`/robot`): skills and their robot readiness (program, policy status,
  success rate) from `/api/skills` and `/api/robot/{skill_id}`.
- `web/src/pages/RobotLab.tsx` (`/robot/:skillId`):
  - The sim viewer (react-three-fiber): `GET /api/robot/scene?skill_id=` gives the kinematic tree
    (bodies with parent, pos, quat [w,x,y,z], joint axis and range, mesh `/sim/panda/<body>.glb`),
    objects and target bins and cameras, in MuJoCo's frame (metres, **z up**; convert to three's y up).
    Pose the robot from streamed `qpos` with forward kinematics; objects from their pos/quat. The sim
    card is exporting the GLBs into `web/public/sim/` (merge `main` to get them); until they land,
    draw links as primitives.
  - Modes: **Replay the human** (`POST /api/robot/{id}/run {mode: "replay"}`) with a ghost of the
    expert's hands from `/api/skills/{id}/twin`; **Train** (`POST .../train` → job via
    `WS /ws/jobs/{id}`: demos then epochs, live loss chart from `result.loss_curve`); **Evaluate**
    (`POST .../evaluate` → trial grid filling in, success rate); **Run policy**; **Run GR00T on chip 3**
    (`mode: "gr00t"`: show its two camera feeds from `camera` messages, per-call latency from `gr00t`
    messages, the instruction).
  - Runs stream over `WS /ws/robot/{run_id}`: `meta`, `state` at 30 Hz (`qpos` 9 values, objects,
    `ee`, `gripper`, `phase`), `camera`, `gr00t`, `done`. Interpolate between states; never put
    per-frame values in React state (read from a ref/zustand in `useFrame`).
  - An explainer strip: human demo → program → 200 simulated variations → policy → trials, with the
    actual numbers from this skill.

## Rules
- Own only: the two pages above, `web/src/features/robot/**`, `web/src/lib/api/robot.ts`,
  `web/src/lib/mock/robot.ts` (exists; yours now). You may extend `web/src/three/FrankaArm.tsx` (yours
  from now on); do not edit other shared files (ask the lead, `tt-model-manager-4d`).
- The sim worker (`sim-c4` in ListAgents) owns the sim package and its message format; ask it
  directly about scene or message details.
- Work against the real backend on 8710 (the sim and GR00T are live). Checks pass; Playwright test
  `web/e2e/robot.spec.ts`; screenshots and a short screen recording in
  `.orchestration/evidence/web-robot/`.
- Commits on `work/web-robot`, no AI attribution. Keep `status.md` current; `handoff.md` and
  "State: review" at the merge gate.

## Merge gate
Replay, train, evaluate, policy and GR00T runs all work from the page against the real backend;
checks pass; evidence captured.
