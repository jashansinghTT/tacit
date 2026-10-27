# Status: liveperf

State: review
Updated: 2026-10-27T21:50:00+00:00

## Now
The merge gate is met; see `handoff.md`. `work/liveperf` is rebased on main bffcf3b, and 51/51 backend tests
pass. Since 21:37Z (the lead's go), chip 0 serves the branch image `tt-model/cohost-vision:188bf1934c60`,
and all four members are healthy. The rollback package is `build/cohost-vision-5882863c8941`. The backend
was not restarted; the lead merges and restarts it.

## Numbers (backend/tools/live_bench.py, vase clip, 10 fps camera, 60 s, one processing job alongside)

| run | live fps | two-hand frame p50 | latency p50 | MediaPipe p50 | offline job |
|---|---:|---:|---:|---:|---:|
| before (main, image 5882863c8941; load avg 30 to 50) | 5.84 | 168 ms | 215 ms | 40.6 ms | 5.7 frames/s |
| after, sequential (image 188bf1934c60; load avg 20 to 36) | 9.62 | 108 ms | 119 ms | 23.6 ms | 6.4 frames/s |
| after, pipelined (as capture and practice run) | 10.03 (camera-bound) | 116 ms | 128 ms | 24.9 ms | 6.2 frames/s |

Outputs: 120 of 120 frames identical to the pre-change recording, sequential and pipelined, on the new image.
On hardware, `/predict_hands` answers are identical to `/predict` for each hand. Evidence:
`.orchestration/evidence/liveperf/`.

## Done
- bench (`tools/live_bench.py`), client cost (begin/finish overlap, pose thread, LiveAnalyzer, chip gate),
  server cost (one decode per frame, HaMeR `/predict_hands`, `hamer_hands` with a per-hand fallback),
  LiveSegmenter robust at 3/5/10 fps with stalls, capture drains the last frame on stop, tests.

## Next
- Lead: merge `work/liveperf` and restart the backend.

## Blockers
- None.
