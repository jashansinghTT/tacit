# Card `sim`: robot simulation, policy training, GR00T in the loop

Owner: background session `tacit-sim`. Worktree: `~/tacit-wt/sim` (branch `work/sim`).
Lead: the `tacit` lead session (see `.orchestration/LEAD.md`). Read `docs/SPEC.md` (F5) and the
Robot Lab part of `docs/API.md` first.

## Goal

A Python package `tacit_sim` (in `sim/`, Python 3.12, its own `pyproject.toml`, installable with
`uv pip install -e sim`) that the backend imports to run the Robot Lab:

1. **Scene**: MuJoCo 3 with the MuJoCo Menagerie Franka Panda (Apache-2.0; clone
   `google-deepmind/mujoco_menagerie` into `sim/third_party/` or fetch just `franka_emika_panda/`),
   a table, named objects and named target bins built from a **program**.
2. **Program**: `[{"op": "pick", "object": "bracket"}, {"op": "place", "target": "left bin"}, ...]`.
   Object and target names come from the expert's capture (COCO-style labels such as "cup",
   "bottle", "scissors", or free text). Map each name to a primitive (box, cylinder) with a
   stable colour from a fixed palette; place targets as open bins along the table's far edge.
3. **Scripted executor**: IK (damped least squares or `mink` if you prefer, both fine) pick and
   place that runs a program reliably under randomised object positions. Grasps are top-down; use
   the Panda fingers with real contact physics (no welding), tuned so grasps hold.
4. **Demonstrations**: `generate_demos(program, n, seed)`: randomised initial states, noise
   injection during collection (DART-style) so the policy sees recoveries; saves episodes
   (observations, actions, success) as `.npz` and as a LeRobot-style dataset folder (parquet + meta
   JSON; no video needed) for the Skill Exchange pack.
5. **Policy**: behaviour cloning in PyTorch on CPU (16 cores, no GPU). Observation: end-effector
   pose, gripper width, object positions relative to the gripper, target position, phase one-hot.
   Action: chunked delta end-effector targets plus gripper. MLP or a small transformer; must train
   in under 5 minutes for about 200 demos, and reach **at least 80% success over 20 randomised
   trials** on a 2-object sort program. Report a loss curve per epoch through a callback.
6. **Replay of the human**: `retarget_wrist_path(points_xyz, times)` maps the expert's wrist path
   (metres, camera frame; the lead provides it from tracks) into the robot workspace (fit the table
   plane and scale), and the robot follows it with IK. This is the "robot imitates the human" view.
7. **GR00T N1.7 in the loop** (foundation-model baseline): GR00T serves on chip 3 at
   `http://127.0.0.1:21030` (`tt-model serve changh95/GR00T-N1.7-3B-p150 --device-id 3 --port 21030
   --detach` with `~/tacit/.tools/ttm/bin/tt-model`, if it is not already up; check `tt-model ps`
   first). Read its card: `~/tacit/.tools/ref/cards/changh95_GR00T-N1.7-3B-p150.md`.
   It expects DROID layout: two cameras (`exterior_image_1_left`, `wrist_image_left`), two frames
   each (t-15 and t), 16:9 frames at 320×180, state `eef_9d` (xyz + rot6d), `gripper_position`
   (1), `joint_position` (7), and an instruction of at most 51 tokens; it returns 40-step chunks of
   absolute `eef_9d`, `gripper_position` and `joint_position`. Render both cameras offscreen
   (`MUJOCO_GL=egl`; the host has an AMD iGPU with Mesa EGL), place the exterior camera like DROID's
   (over the shoulder, facing the table) and a wrist camera on the hand. Apply the returned joint
   targets, re-query every 8 to 16 steps, log per-call latency. It does not have to succeed (sim is
   off its training distribution); it must run without errors and move plausibly.
8. **Streaming runner** for the backend: `Runner(program, mode, seed, policy_path=None,
   human_path=None, gr00t_url=None).frames(realtime=True)` yields dicts exactly as the
   `WS /ws/robot/{run_id}` messages in `docs/API.md` (`meta`, `state` at 30 Hz, `camera` at 5 Hz in
   gr00t mode, `gr00t`, `done`). Also `run_episode(...) -> {success, steps, reason}` without
   realtime pacing, for evaluation.
9. **Web assets**: export the Panda link meshes and the scene to `web/public/sim/` as GLB
   (trimesh can convert the Menagerie OBJ/STL), plus `web/public/sim/scene.json` describing the
   kinematic tree (bodies, parent, local pos and quat, joint axis and range, mesh file, colour) so
   the web viewer can pose the robot from `qpos` with forward kinematics. Keep the total under
   about 15 MB. Also expose the same description at runtime via `tacit_sim.scene_description(program)`
   (objects and bins included) for `GET /api/robot/scene`.

## Public API (the backend codes against this; keep it stable)

```python
from tacit_sim import (
    scene_description,        # (program) -> dict for GET /api/robot/scene
    generate_demos,           # (program, n, seed, out_dir) -> DemoSet {path, n, success_rate}
    train_policy,             # (demos_path, out_path, epochs, on_epoch=cb(epoch, loss)) -> {policy_path, loss_curve}
    evaluate_policy,          # (program, policy_path, trials, seed, on_trial=cb) -> {success_rate, trials: [...]}
    Runner,                   # streaming runner (see above)
    retarget_wrist_path,      # (points_xyz, times) -> workspace path
)
```

## Rules

- Scope: `sim/` and `web/public/sim/` only. Do not edit `backend/` or the rest of `web/`; tell the
  lead what you need instead.
- Chip 3 only, and only for GR00T. Stop it with `tt-model stop`, never `docker kill`.
- Tests in `sim/tests/` (scene loads, IK reaches, scripted program succeeds, policy trains on a
  tiny set, runner yields the documented messages). `uv run pytest sim/tests` must pass.
- Evidence in `.orchestration/evidence/sim/`: an mp4 of a scripted run, of a trained-policy run and
  of a GR00T run (offscreen renders), the success-rate table, GR00T latency numbers.
- Small, clear commits on `work/sim`. No AI attribution in commits.
- Keep `status.md` in this folder current after every meaningful step; write `handoff.md` when done.

## Merge gate

`uv run pytest sim/tests` passes; the policy reaches at least 80% over 20 trials on the example
program `sim/examples/sort2.json`; GR00T closed loop runs for a full episode on chip 3; web assets
exported; `handoff.md` written.
