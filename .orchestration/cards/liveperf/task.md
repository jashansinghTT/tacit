# Card `liveperf`: live analysis at 8+ fps on a busy box

Owner: `tacit-vision`. Worktree `~/tacit-wt/vision`; new branch from main: `git checkout -B work/liveperf main`.

## Why
Live capture (Studio) and practice (Learn) analyse webcam frames on chip 0. Alone, the vision models
answer in 10 to 15 ms, but on a busy box a frame takes 170 to 260 ms end to end (HaMeR 60 to 107 ms with
two hands, RF-DETR 63 to 105 ms), so the live view runs at about 3 fps and the coach misses steps. The
demo will run on this box with other work going on, so live has to stay fast under load.

## Do
1. Measure first: a script (`backend/tools/live_bench.py`) that streams a sample clip through
   `perception.frame.analyze(priority=vision.LIVE)` at 10 fps for 60 s and prints per-stage p50/p90
   (MediaPipe, JPEG encode, each model, total) and achieved fps; run it idle and under a synthetic load
   (e.g. a background processing job). Record the baseline.
2. Cut the client-side cost: JPEG size and quality per model (RF-DETR works at 560, HaMeR crops to
   256, Gaze-LLE to 448), one encode per frame shared by all calls, MediaPipe image size and running mode,
   avoiding redundant base64 work; look at where the backend's event loop blocks.
3. Cut the server-side cost (your co-host adapters): a batched HaMeR call for both hands of a frame, and
   anything else you find in the adapters' pre/post-processing. Image rebuilds and chip-0 restarts are
   only allowed **after** the lead says QA's no-deploy freeze is over; until then, work on the client and
   on a branch build of the image without serving it.
4. Check `LiveSegmenter` at 3, 5 and 10 fps with frame gaps (the web card's 2-minute synthetic capture
   closed only 1 step); make step closing robust to low and uneven frame rates.
5. Tests: `cd ~/tacit && .venv/bin/python -m pytest backend/tests` must pass; add tests for anything
   you change in behaviour.

## Rules
Scope: `backend/tacit/perception/**`, `backend/tacit/models/vision.py`, `models/cohost-vision/**`,
`backend/tools/**`, `backend/tests/**`. Do not restart the backend or any model during the freeze; the
lead merges and deploys. Commits on `work/liveperf`, no AI attribution. Message the lead
(`tt-model-manager-4d`) with before/after numbers when ready.

## Merge gate
Live analysis at 8 fps or better with two hands while one offline processing job runs (measured with
the bench), outputs unchanged (same detections and hand poses as before for the same frames), tests pass.
