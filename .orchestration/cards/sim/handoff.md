# Handoff: sim

Branch `work/sim`. The lead has merged up to 87fc566. Still to merge: efbc734 (pipelined GR00T
queries in realtime runs), c21cd23 (2 torch threads), 6f55cde (60k-frame epoch cap) and the
final evidence + handoff commit.

## Merge gate

| Gate item | Status | Evidence |
|---|---|---|
| `uv run --project sim pytest sim/tests` passes (lead accepted `--project sim`) | 37 pass, 2 live GR00T tests skipped; with `TACIT_LIVE=1` all 39 pass (at load ~43) | run it; about 15 s, 25 s live |
| Policy >= 80% over 20 trials on `sim/examples/sort2.json` | **20/20 (100%)**; 100/100 on seeds 1000-1099 | `.orchestration/evidence/sim/results.md`, `summary.json` |
| GR00T closed loop runs a full episode on chip 3 | 40 s episodes, 75 queries, no errors | `gr00t_run.mp4`, `gr00t_latency.json` |
| Web assets exported | `web/public/sim/`: 11 link GLBs, `panda.glb`, `scene.json`, 5 MB | `test_web_assets.py` checks FK against MuJoCo |
| handoff.md | this file | |

Videos (offscreen MuJoCo, 640x360): `scripted_run.mp4`, `policy_run.mp4`, `gr00t_run.mp4` (with
the two GR00T camera views) in `.orchestration/evidence/sim/`. Regenerate everything with
`uv run --project sim python sim/scripts/make_evidence.py` (about 10 minutes on a loaded host).

## Results

| Program | Scripted expert | BC policy (200 demos, 30 epochs, 20 trials, seeds 0-19) |
|---|---:|---:|
| `sort2.json` (2 parts, 2 bins), merge gate | 100/100 | **20/20**; 100/100 on seeds 1000-1099 |
| `kit3.json` (3 parts, 2 sharing a bin, a tall bottle) | 40/40 | 20/20 (19/20 with the 60k epoch cap) |
| QA-2's `[knife -> tray, cup -> tray]` | 30/30 | 20/20 |
| one part `[handbag -> microwave]` | 40/40 | 20/20 |
| same part twice `[cup -> left bin, cup -> right bin]` | 40/40 | 20/20 |
| LLM-style `[inspect gauge, pick phone, pick remote, place right bin, place nowhere]` | 40/40 | 19/20 |
| five parts, five bins | 20/20 | 20/20 |

Timing (16-core host shared with the backend, browsers and model servers; load average 30 to 50
during most of these runs): 200 demos 11 to 31 s (87 s for five parts), 8 processes; training
30 epochs 49 to 91 s (2 torch threads, at most 60k sampled frames per epoch); 20 evaluation
trials 8 to 60 s. Without the thread and epoch caps, the busy host pushed training to 170 to
300 s (8 threads spin-waiting: 68 s per epoch versus 5.5 s on 2 threads).

GR00T N1.7 latency per query (two cameras x two frames at 320x180, re-query every 8 action steps):

| Measured | Host load | Round trip p50 / p90 | Device p50 |
|---|---:|---:|---:|
| 19:28 | quiet | 67.6 / 72.7 ms | 57.8 ms |
| 19:52 | ~30 | 89.9 / 312.6 ms | 63.7 ms |
| 21:12 (final evidence run) | ~53 | 592.8 / 904.4 ms | 420.1 ms |
| 22:36 (quiet-host re-measure, current `gr00t_latency.json`) | 6.5 to 8.8 | 70.9 / 118.2 ms | 58.2 ms |

The quiet numbers match the model card. GR00T had a single client in the 21:12 run, so the
slowdown is host CPU starvation (upload, trace dispatch and readback are host-driven). Realtime
streams pipeline queries and keep pace anyway. Details and the re-measure command:
`.orchestration/evidence/sim/gr00t_latency_history.md`.

## What the backend gets (`tacit_sim`)

`scene_description`, `generate_demos`, `train_policy`, `evaluate_policy`, `Runner(...).frames()` /
`.run_episode()`, `run_episode`, `retarget_wrist_path`, `policy_info`, `ProgramMismatch`.
Full reference with message tables: `sim/README.md`. Points the backend should know:

1. **Train and evaluate on the same program.** QA-2 (policy 0/20) was the backend training on
   `program_for()`'s fallback and evaluating later on the skill's new program. Sim side:
   `evaluate_policy` and `Runner(mode="policy")` raise `ProgramMismatch` (a `ValueError`) naming
   both programs; `policy_info(path)["program"]` returns the training program. Backend side
   (lead, 13de1fd): the training program is stored on `skill.robot.policy.program` and used for
   evaluation and runs, a changed program marks the policy stale, and programs are normalised to
   pick-and-place pairs.
2. **Picks without places** reaching the sim directly become "pick up and put it back down"
   tasks (the backend now pairs them with a target first).
3. `generate_demos` uses a `spawn` process pool (safe under a threaded server); the entry point
   must be import-safe (uvicorn's is). `workers=1` runs in-process.
4. `Runner.frames()` runs the sim on its own thread; pull from any thread; closing the
   generator stops the run. In realtime gr00t runs, queries are pipelined (the control loop
   never waits for GR00T after the first chunk); `run_episode` waits for each query
   (deterministic).
5. Replay: pass `retarget_wrist_path(points_cam, times, grip)`; `meta.human` carries the path
   and its camera-to-robot affine (`transform.matrix`), used by the web ghost hands.

## Decisions (and why)

- **DROID conventions for GR00T** were recovered from the model's own `GET /demo` request:
  `eef_9d` xyz is the Panda hand frame; rot6d is rows 0-1 of link 7's rotation passed through
  DROID's Euler round trip (intrinsic ZXY read, extrinsic yzx rebuild, axis permutation).
  Reproduces the demo state to 6e-8 (`test_droid.py`). Gripper 0 open, 1 closed.
- **GR00T behaviour**: runs without errors and moves smoothly, reaching down to the table toward
  the robot's left (the instruction's "left bin" side); it does not grasp. Camera placement was
  varied (four placements, DROID-like included) with the same outcome; the sim (Panda hand
  instead of Robotiq, rendered images) is off its training distribution, as the card expected.
- **Training on a shared box**: torch runs on 2 threads (`TACIT_SIM_TORCH_THREADS` overrides)
  and an epoch is a random sample of at most 60k frames (`train_policy(epoch_samples=...)`).
  Both were measured under the real load of this box; see Timing above.
- **Rendering is Mesa software EGL**: user `jashan` is not in the `render` group, so
  `/dev/dri/renderD128` is not accessible. I did not change system groups. Adding the user to
  `render` (then re-login) would move rendering to the AMD iGPU; nothing else changes.
- **Physics tuning** (all in `scene.py`, each with its reason in a comment): gravity
  compensation; gripper squeeze about 12 N (Menagerie's 2 N slips, 30 N sinks into parts); stiff
  pad contacts; the four small ridge boxes on each finger are not collidable (they locked
  cylinders to one finger); elliptic cones with noslip; joint torque limits 3x the real
  Panda's (the real 87/12 Nm limits sustained a substep-rate limit cycle near the shoulder
  singularity that froze the arm).
- **Joint names** have the `panda_` prefix (`panda_joint1`...), as in docs/API.md.
  `state.gripper` is the finger joint value (0 closed, 0.04 open).
- **Seeds**: evaluation trial i uses seed + i, so `Runner(seed=s)` replays that trial;
  training demos use a disjoint seed range.
- **Menagerie Panda is vendored** (`sim/third_party/`, Apache-2.0, about 5 MB packed) so the
  sim works offline on the box.
- **GR00T on chip 3** (`changh95/GR00T-N1.7-3B-p150`, port 21030) was started by this card and is
  left running for the stack. Stop it only with `~/tacit/.tools/ttm/bin/tt-model stop
  changh95/GR00T-N1.7-3B-p150`.

## Known limits

- Parts are boxes or cylinders chosen from the name; up to 6 parts and 5 bins per program.
- Replay follows the wrist only (no grasp of sim parts); the grip signal opens and closes the
  hand.
- The policy is per program (trained on that skill's program); it does not transfer between
  programs, which is why mismatches now raise.
- Software rendering costs about 25 ms per 320x180 frame and 50 to 100 ms per 640x360 frame
  with shadows (videos), and more when the host is loaded.

## Files

- `sim/tacit_sim/`: `scene.py`, `program.py`, `env.py` (task monitor), `ik.py`, `expert.py`,
  `demos.py`, `features.py`, `policy.py`, `runner.py`, `gr00t.py`, `droid.py`, `retarget.py`,
  `render.py`, `describe.py`, `export.py`.
- `sim/tests/` (9 files), `sim/examples/{sort2,kit3}.json`, `sim/scripts/make_evidence.py`,
  `sim/README.md`, `sim/uv.lock`.
- `web/public/sim/` (assets), `.orchestration/evidence/sim/` (evidence).
