# Handoff: liveperf

Branch `work/liveperf`, rebased on main bffcf3b. Chip 0 serves the branch image
`tt-model/cohost-vision:188bf1934c60`, staged in `build/cohost-vision` (swapped 21:37Z on the lead's go).
The previous package is kept in `build/cohost-vision-5882863c8941` for a rollback:
`deploy/vision-down.sh`, then `PKG=$HOME/tacit/build/cohost-vision-5882863c8941 deploy/vision-up.sh`.
The backend was not restarted. It works with either image (see `hamer_hands` below), and the new client
code reaches it when the lead merges and restarts.

## Merge gate

| Gate item | Status | Evidence |
|---|---|---|
| Live analysis at 8 fps or better with two hands while one offline processing job runs | **9.62 fps sequential, 10.03 fps pipelined** (the camera's 10 fps; every frame analysed); two-hand frames 108 ms p50 sequential (9.2 fps if every frame had two hands) | `.orchestration/evidence/liveperf/bench_after_load_*.json` |
| Outputs unchanged (same detections and hand poses for the same frames) | 120 of 120 frames identical to the pre-change recording (hand boxes, landmarks, HaMeR poses, objects, gaze), sequential and pipelined, on the new image | `live_bench.py --record ... --compare build/liveperf/outputs_before.json` |
| `/predict_hands` equals `/predict` on hardware | each hand's answer identical to its own `/predict` call; a box outside the image is that hand's 400 only | see "Image swap" below |
| Tests pass | 51 of 51 (main's 44 + 7 new) | `PYTHONPATH=backend .venv/bin/python -m pytest backend/tests` |

## Numbers

`backend/tools/live_bench.py`: the vase clip streamed at 10 fps, newest frame wins as in live capture.
`--load` runs a processing job beside it (jars clip, BATCH priority, three frames in flight). 60 s runs.

| run (with a processing job) | live fps | frame p50 / p90 | two-hand frame p50 | latency p50 / p90 | MediaPipe p50 | offline job |
|---|---:|---:|---:|---:|---:|---:|
| before (main, served image 5882863c8941) | 5.84 | 158 / 211 ms | 168 ms | 215 / 278 ms | 40.6 ms | 5.7 frames/s |
| after, sequential | **9.62** | 101 / 118 ms | 108 ms | 119 / 178 ms | 23.6 ms | 6.4 frames/s |
| after, pipelined (what capture and practice use) | **10.03** | 95 / 135 ms | 116 ms | 128 / 144 ms | 24.9 ms | 6.2 frames/s |

Idle, pipelined: 10.06 fps (camera-bound). Box load average was 30 to 50 for the before run and 20 to 36
for the after runs. Some of the gain is the quieter box, but the after runs keep a margin over 8 fps.

Per-call times now overlap: a frame's calls are all in flight at once. The two hands share one request, so
`hamer_left`/`hamer_right` (54 to 77 ms p50) each show the time of the shared request, not one hand.
Compare frame totals, not per-call rows.

## What changed

- `perception/frame.py`: `analyze` = `begin` (encode, RF-DETR started before MediaPipe, which needs no box,
  then MediaPipe and every chip call started) + `finish` (wait, assemble). `LiveAnalyzer` runs one frame
  deep: a frame's MediaPipe runs while the previous frame's calls are on the chip. Results stay in order,
  and `flush` returns the last frame.
- `perception/mediapipe_runner.py`: pose runs on its own thread beside hands (same outputs).
- `models/vision.py`:
  - `ChipGate`: live calls have 4 slots of their own. Offline work gets 2 slots, or 1 while live frames
    are flowing.
  - `hamer_hands`: sends both hands in one `/predict_hands` request when HaMeR lists that route (checked
    once a minute), otherwise one `/predict` per hand as before.
- `live/capture.py`, `learn/practice.py` (scope extended by the lead):
  - Both loops use `LiveAnalyzer`.
  - On stop, capture drains the frame in flight before `finish()`, so the last frame reaches the frames,
    the segmenter and the saved tracks, in order.
  - A frame that fails decode or analysis is still skipped.
- `perception/timeline.py`: steps close reliably at 3, 5 and 10 fps and across 1 to 2 s stalls:
  - the release gap adapts to the frame interval;
  - a hand that is not seen is not taken as letting go;
  - resumed contacts count;
  - an approach is taken from the hand's last sighting.

  The live hand is now the hand on the step's object. `eval_steps.py --sweep` gives vase P 1.00 R 0.83 and
  jars P 1.00 R 0.60 at 10, 5 and 3 fps with drops.
- `models/cohost-vision` adapters (the image):
  - one JPEG decode per frame, shared by every member: a copy of PIL's own decode, with each member's checks
    and RGB conversion unchanged;
  - HaMeR `POST /predict_hands`: each hand is answered by the `/predict` function itself.

  Existing routes are unchanged.
- `tools/live_bench.py` (new) and `tools/eval_steps.py --drop/--sweep`.

## Image swap (21:37Z, on the lead's go)

1. `cp -a build/cohost-vision build/cohost-vision-5882863c8941` (the rollback package).
2. `models/cohost-vision/build.sh` staged 188bf1934c60 in `build/cohost-vision` while the old image served.
   It is the same image tag as the tested branch build.
3. `PKG=.../cohost-vision-5882863c8941 deploy/vision-down.sh`: clean `tt-model stop`, 4.1 s.
4. `deploy/vision-up.sh`: all four members healthy in 50 s (warm program cache).
5. On hardware, with the HaMeR fixture image (two hands and an off-image box): `/predict_hands` answers
   are identical to `/predict` for each hand, and the off-image box returns its own 400.
6. HaMeR (21000), Gaze-LLE (21001), RF-DETR (21002), VGGT (21003) and the status port (21004) are healthy
   after the benches, with no errors in the container log.

## Notes for the lead

- After merging, the backend restart turns on the client half: `hamer_hands`, `LiveAnalyzer` in capture and
  practice, and the gate. Until then the running backend uses the new image through `/predict` as before.
- Once this branch is merged, `models/cohost-vision/build.sh` on main builds this same image (the adapters
  are in this branch).
