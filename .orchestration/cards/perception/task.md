# Card `perception`: steps that match what the expert actually did

Owner: `tacit-vision` (you built the vision co-host; this is the next card). Worktree
`~/tacit-wt/vision`; start a new branch from main: `git fetch . main:main 2>/dev/null; git checkout -B work/perception main`.

## Why
The pipeline runs end to end on the chips, but the steps it finds on real footage are weak: on the
vase clip it returned "move the left hand from the middle to the left" instead of "push a stem into
the black vase". Step quality is what a trainee, a manager and a robot maker see first.

## What you have
- Real clips with approximate ground truth: `~/tacit/data/samples/{vase,jars}.mp4` and
  `~/tacit/data/samples/ground_truth.json` (per step: time range, hand, action, objects).
- The perception code (`backend/tacit/perception/`: `frame.py` runs MediaPipe plus HaMeR, Gaze-LLE
  and RF-DETR on chip 0; `timeline.py` has `segment_steps`, `carried_intervals`, `activity_segments`
  and the live `LiveSegmenter`), and the writer that turns steps into text (`backend/tacit/pipeline/writer.py`).
- Cached tracks of processed skills in `~/tacit/data/skills/<id>/tracks.json` (the vase sample is
  `sk_c28f1461`, jars `sk_3b7c613d`), so you can iterate on segmentation without re-running the models.
- The vision models live on chip 0 (your co-host) if you need fresh analyses.

## Do
1. Write `backend/tools/eval_steps.py`: from a tracks file plus the ground truth, print per-clip step
   precision and recall (a detected step matches a ground-truth step when their time ranges overlap by
   IoU of at least 0.3), the boundary error, and whether hand and objects agree. Record the baseline.
2. Improve `timeline.py` until the numbers are good on both clips, without overfitting to them (no
   per-clip constants). Ideas: hand-object interactions as the step unit (a hand that approaches an
   object box, dwells, and retreats); repeated motions toward the same target (the vase clip's
   insertions); gaze shifts as boundary hints; merging tiny segments; better use of HaMeR's 3D hand
   position. Non-COCO objects (stems) can be described by where the hand goes (the vase) instead.
3. Make the step drafts the writer receives concrete ("push something into the black vase with the
   right hand" beats "hand movement"), and pass the writer whatever helps (target object, approach
   direction, repetition count). Do not change the API shapes in `docs/API.md`.
4. Keep `LiveSegmenter` in step with the offline segmentation (same idea of a step), since the coach
   asks its question when a live step closes.
5. Tests: extend `backend/tests/test_units.py`; `cd ~/tacit && .venv/bin/python -m pytest backend/tests`
   must pass. Put before/after numbers in `.orchestration/cards/perception/status.md` and the eval
   output in `.orchestration/evidence/perception/`.

## Rules
Scope: `backend/tacit/perception/**`, `backend/tacit/pipeline/writer.py` (step drafts and prompt only),
`backend/tools/**`, `backend/tests/**`. Do not restart the backend or the models; to try the full
pipeline on a clip, call the live API (`POST /api/skills` with a "QA ..." title, then
`/api/skills/{id}/process`). Commits on `work/perception`, no AI attribution. Message the lead
(`tt-model-manager-4d`) when it is ready to merge.

## Merge gate
Step precision and recall at least 0.7 on both clips (or a clear explanation of what blocks it),
tests pass, numbers recorded.
