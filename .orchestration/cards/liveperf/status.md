# Status: liveperf

State: running
Updated: 2026-10-27T21:25:00+00:00

## Now
QA's no-deploy freeze (21:05 to 22:35 UTC): client-side work and short idle benches only. Building the
server-side changes (HaMeR /predict_hands, one JPEG decode per frame in the co-host) as a branch image,
not served; the lead says when it may be swapped in after 22:35.

## Numbers (backend/tools/live_bench.py, vase clip, 10 fps camera; box load average 30 to 50)

| run | fps | frame p50 (two hands) | MediaPipe p50 | per call p50 |
|---|---|---|---|---|
| baseline, with a processing job (60 s, before changes) | 5.84 | 168 ms | 40.6 ms | 31 to 34 ms |
| baseline, idle (20 s, earlier wall-based fps) | ~5-6 | 146 ms | 35.3 ms | 31 to 45 ms |
| client changes, idle (20 s) | 7.8 to 8.0 | 132 ms | 37 ms | 35 to 65 ms (all in flight at once) |
| + pipelined (LiveAnalyzer), idle (20 s) | 9.56 | | 47.5 ms | |

Load runs are paused by the freeze (one allowed run was the baseline). Outputs: `--record/--compare` on 60
frames of each sample clip: 120 of 120 frames identical (hand boxes, landmarks, HaMeR poses, objects, gaze),
sequential and pipelined.

## Done (commits on work/liveperf, rebased on main 5b7d615)
- `tools/live_bench.py`: streams a clip as live capture does (newest frame wins), optional processing job
  alongside (`--load`), `--pipeline`, and `--record/--compare` for exact output checks.
- `perception/frame.py`: RF-DETR's call starts before MediaPipe; analyze = begin + finish; LiveAnalyzer
  (one frame deep); JPEG encode time in timing_ms.
- `perception/mediapipe_runner.py`: pose runs on its own thread beside hands (35.6 -> 30.0 ms p50, same outputs).
- `models/vision.py`: ChipGate: LIVE has 4 slots of its own; BATCH/SLOW 2 slots, 1 while live frames flow.
- `live/capture.py`, `learn/practice.py` (scope extended by the lead): loops use LiveAnalyzer; capture drains
  the frame in flight on stop before saving; bad frames still skipped.
- `perception/timeline.py`: step closing robust to low and uneven frame rates (adaptive release gap, a hand
  not seen is not letting go, resumed contacts, approach seen across stalls); live hand = hand on the step's
  object. `eval_steps.py --sweep` table: live 10/5/3 fps all vase P 1.00 R 0.83, jars P 1.00 R 0.60.
- Tests: 43/43 backend tests pass (new: gate, low-fps steps, lost-hand runs, LiveAnalyzer order + flush,
  capture drain).

## Next
- Branch image with HaMeR /predict_hands + shared decode; vision.py uses it with a per-hand fallback.
- After 22:35 and the lead's go: swap the image, run the 60 s load bench (sequential and pipelined), check
  outputs, hand over.

## Blockers
- None (waiting for the freeze to end for the load measurement and the image swap).
