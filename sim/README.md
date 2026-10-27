# tacit-sim

The Robot Lab simulation for Tacit: a MuJoCo scene with the Franka Panda built from a skill's
robot program, a scripted pick-and-place expert, demonstration collection, a behaviour-cloning
policy trained on CPU, a streaming runner for the web viewer, and GR00T N1.7 (chip 3) in the loop.

## Install and test

```bash
uv pip install -e sim                 # into the backend's environment (torch resolves to the CPU wheel)
uv run --project sim pytest sim/tests # 36 tests, about 12 s; GR00T live test: TACIT_LIVE=1
uv run --project sim python -m tacit_sim.export        # rewrite web/public/sim (needs trimesh)
uv run --project sim python sim/scripts/make_evidence.py  # rewrite .orchestration/evidence/sim
```

Rendering uses EGL (`MUJOCO_GL=egl`, set by the package). On this host it runs in Mesa's
software renderer because the user is not in the `render` group; 320x180 frames take about 25 ms.

## API

```python
from tacit_sim import (scene_description, generate_demos, train_policy, evaluate_policy,
                       Runner, run_episode, retarget_wrist_path)

program = [{"op": "pick", "object": "bracket"}, {"op": "place", "target": "left bin"},
           {"op": "pick", "object": "bolt"}, {"op": "place", "target": "right bin"}]

scene_description(program)                       # GET /api/robot/scene
ds = generate_demos(program, n=200, seed=0, out_dir="data/skills/sk_x/robot/demos",
                    on_episode=lambda i, n, ok: ...)            # ~20 s, 8 processes
tr = train_policy(ds.path, "data/skills/sk_x/robot/policy.pt", epochs=30,
                  on_epoch=lambda epoch, loss: ...)             # ~40 s, CPU
ev = evaluate_policy(program, tr["policy_path"], trials=20, seed=0,
                     on_trial=lambda i, n, row: ...)            # {success_rate, trials}
for msg in Runner(program, "policy", seed=3, policy_path=tr["policy_path"]).frames(realtime=True):
    ...                                                         # WS /ws/robot/{run_id}
run_episode(program, "scripted", seed=3)                        # {success, steps, reason, ...}
path = retarget_wrist_path(wrist_cam_xyz, times, grip)         # Runner(..., "replay", human_path=path)
```

- **Programs** are free text from the LLM: `pick` pairs with the next `place`; a pick with no
  place puts the part back down; other ops are kept in `ignored_ops`. Up to 6 parts and 5 bins.
  Names map to boxes or cylinders (`cup`, `bottle`, `bolt`... are cylinders; `scissors`,
  `remote`... are slim boxes) with stable colours. Bins line the far edge; names with "left"
  go to the robot's left (+y).
- **Modes**: `scripted` (the expert), `policy` (needs `policy_path`), `replay` (needs
  `human_path`: the output of `retarget_wrist_path`, or raw `{"points", "times", "grip"}` in
  the camera frame), `gr00t` (GR00T N1.7 at `http://127.0.0.1:21030`, `TACIT_GR00T_URL`).
- **Seeds**: evaluation trial `i` uses seed `seed + i`, so `Runner(seed=s)` replays a trial
  exactly. Demonstrations use a separate seed range.

### Stream messages (`Runner.frames`)

| type | fields |
|---|---|
| `meta` | `mode, seed, joints` (9 names), `objects, targets, dt` (1/30), `instruction`; replay adds `human {times, points, grip, transform}` |
| `state` | `t, qpos` (7 arm + 2 finger joints), `objects [{name, pos, quat [w,x,y,z]}]`, `ee` (TCP), `gripper` (finger joint, 0 closed to 0.04 open), `phase` (`pick bracket`, `place left bin`, `done`; replay: `approach`, `replay`) |
| `camera` | gr00t mode, 5 Hz: `name` (`exterior` or `wrist`), `t`, `jpeg` (base64, 320x180) |
| `gr00t` | per query: `step, ms` (round trip), `server_ms, device_ms, instruction` |
| `done` | `success, reason, steps, seconds, regrasps, tasks_done`; gr00t adds `gr00t {calls, p50_ms, max_ms}`, replay adds `tracking_error_m` |

The simulation runs on its own thread (MuJoCo's EGL context is bound to the thread that made
it), so `frames()` can be pulled from any thread; closing the generator stops the run.

## How it works

- **Scene** (`scene.py`): Menagerie `franka_emika_panda` (vendored, Apache-2.0) attached with
  prefix `panda_`; gravity compensation; gripper squeeze about 12 N; stiff finger-pad contacts
  (the four small ridge boxes on each finger are not collidable: they trapped cylinders);
  elliptic friction cones with noslip; torque limits 3x the real Panda's (see the comment there).
  30 Hz control, 16 physics substeps.
- **Task monitor** (`env.py`): phases `pick <part>` until the part is held and lifted,
  `place <bin>` until it is released inside the bin, then the next task, then `done`; a dropped
  part sends it back to `pick`.
- **Expert** (`expert.py`): pure state feedback (funnel: travel high, align, descend; grasp
  top-down across the short side; carry, turn long parts lengthwise once clear, lower, release).
  Grasps read the part's current pose, so knocked-over parts get picked up too.
- **Demos** (`demos.py`): DART-style noise in the executed commands (OU drift on the TCP target,
  occasional premature gripper closes and mid-carry drops), clean expert labels. Writes
  `episodes.npz`, `meta.json` and `lerobot/` (LeRobot v2.1-style parquet, no video).
- **Policy** (`policy.py`, `features.py`): MLP 3x512 mapping a 25-d observation (TCP, gripper,
  part and bin relative to the TCP, part size, phase and task one-hots) to a 10-step chunk of TCP
  targets, yaw and gripper; temporal ensembling at run time.
- **GR00T** (`gr00t.py`, `droid.py`): two cameras (exterior on the robot's left, wrist on the hand)
  x two frames (t-15, t) at 320x180, DROID state and the current task's instruction; applies
  the 40-step joint chunk at 15 Hz, re-querying every 8 steps. `droid.py` documents how the
  DROID `eef_9d` convention was recovered from the model's own demo request (exact match).
- **Replay** (`retarget.py`): fits the table plane to the wrist path (PCA), maps it into the
  workspace with one affine (`transform`, also usable for the other hand landmarks), approaches
  the start, then follows it at its own timing.
- **Web assets** (`export.py`, `describe.py`): per-link GLBs, `panda.glb` (named node tree),
  `scene.json` with the kinematic tree; the viewer poses the arm from `qpos`.
