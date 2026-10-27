# Status: perception

State: review
Updated: 2026-10-27T20:25:57+00:00

## Merge gate: met
Step precision and recall >= 0.7 on both clips, tests pass (30/30 backend tests on the branch merged with main at 865b270, including
a regression test of this gate on the clips' real tracks), numbers recorded below and in
`.orchestration/evidence/perception/`.

## Numbers (backend/tools/eval_steps.py on the cached tracks of sk_c28f1461 = vase, sk_3b7c613d = jars)

| | vase P / R | jars P / R | hand agreement vase / jars | objects vase / jars |
|---|---|---|---|---|
| before: main's segment_steps | 0.40 / 0.33 | 0.00 / 0.00 | 0.5 / - | 0.0 / - |
| before: stored steps after the writer | 0.50 / 0.33 | 0.00 / 0.00 | | |
| **after: segment_steps (10 fps, what process.py runs)** | **1.00 / 0.83** | **0.80 / 0.80** | 1.0 / 0.75 | 0.5 / 1.0 |
| after: tracks subsampled to 5 fps | 1.00 / 0.83 | 0.67 / 0.80 | | |
| after: LiveSegmenter, frame by frame | 1.00 / 0.83 | 1.00 / 0.60 | | |

Vase: the five "push a stem into the black vase" steps, right hand, named "vase on your right"; missed:
"gather the loose stems on the table" (no detected object; 0-4 s). Objects 0.5 = "vase" found, "stem"
cannot be (not a COCO class). Jars: lift the beaker / set it back by the carafe, pick up the candle jar /
set it down and straighten it, lift the white bottle and check it; missed: "handle a second small jar"
(25-28 s: the jar in her hands is never detected, and both hands together at chest is exactly the vase
clip's "sorting the bundle", which is not a step). Steps never overlap; a self-audit of each clip
(learn/audit.compare) now gives 5/5 done (was 1 done, 2 out of order on jars).

Writer (gpt-oss-20b on chip 2, called from the branch on the new steps; `writer_sample.json`):
vase "Insert first stem: Insert the item held in the right hand into the vase on your right" x5 with a
pick/place robot program (was "Move left hand from middle to left of bench"); jars "Pick up front cup",
"Place cup ... and straighten it", "Check bottle: Lift the bottle on your left, hold it up to inspect,
then set it back".

## What changed (commits on work/perception)
- `perception/interactions.py` (new): hand sides from the pose wrists; body scale (shoulder width) as
  the unit; an object tracker that keeps identity through lift, carry and put-back; hand-object contact,
  with the space above a container's opening counting for tall containers (vases, not cups).
- `perception/timeline.py`: `segment_steps` = hand-object interactions: contact runs per hand, bridged
  over 0.8 s; the moving object wins over static clutter, the smallest box over big background ones;
  resting hands and walking ignored; same-object / same-site / two-hand merges; touches right before or
  after handling an object join that step; a handled object set down and adjusted >= 1.5 s is its own
  "place" step; the reach for an object first seen off the work surface joins the step that holds it.
  Each step carries action (insert, pick, place, move, lift_return, handle), target, approach direction
  in the expert's frame, repeat k of n, and object names from where the expert stands. The old
  carried/activity segmentation is the fallback when no interaction is seen.
- `LiveSegmenter`: same primitives; grasp when a hand reaches an object, step closes when every hand has
  let go for 0.8 s; old pause rule only until the first interaction.
- `perception/mediapipe_runner.py`: BUG FIX. Hand sides were swapped (the runner flipped MediaPipe's
  handedness; 397/397 "left" hands on the vase clip were the expert's right wrist). Now from the pose.
- `pipeline/writer.py`: steps carry action/object/target/approach/repeat; one written step per observed
  action (repeats stay separate, "the first of five", "the next"); unrecognised held items may take the
  name in the recording title.
- `tools/eval_steps.py` (`--stored`, `--live`, `--fps`, `-v`, `--json`), `tools/fix_track_sides.py`.
- Tests: 10 new in `backend/tests/test_units.py`, compact real tracks in `backend/tests/fixtures/perception/`.

## For the lead (outside my scope)
- Stored tracks.json files all carry the old swapped sides (`fix_track_sides.py` dry run: e.g. vase
  619/640 hands, jars 457/534). Re-processing samples and uploads re-analyses them (correct after the
  merge); live captures keep their tracks: `PYTHONPATH=backend python backend/tools/fix_track_sides.py
  --write <ids>` rewrites them (backup tracks.json.bak-sides). Segmentation corrects sides itself;
  learn/practice.features, learn/audit, reflex.finger_track and geometry.build_twin read stored sides as
  they are, so they are right for new analyses and wrong for old tracks until fixed. None of them needs a
  code change: the web client sends unmirrored frames (lib/media.ts drawImage without a flip).
- After the merge, re-process sk_c28f1461 and sk_3b7c613d (and the QA copies of the samples) to get the
  new steps, sides and HaMeR is_right into the stored skills.

## Known limits
- Steps need a detected object: work on undetected things (stems on the table, a small jar in the hands)
  is not a step unless it happens at a detected container's opening.
- Jars at 5 fps adds one extra step (P 0.67): its ground-truth boundaries sit near the merge windows.
- Assumes a static camera (an object counts as handled when its box moves); a moving camera makes
  everything look handled.
- LiveSegmenter does not split a set-down from its pick-up (it closes when the hands let go), so it gives
  fewer, longer steps than offline on jars (the coach asks once per action).

## Next
- Lead: review and merge work/perception, then re-process the sample skills.
