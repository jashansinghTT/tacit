# Sim evidence

Generated 2026-10-27T19:42:40Z by `sim/scripts/make_evidence.py` on program `sort2.json`:

```json
[{"op": "pick", "object": "bracket"}, {"op": "place", "target": "left bin"}, {"op": "pick", "object": "bolt"}, {"op": "place", "target": "right bin"}]
```

## Success rates

| Run | Trials | Seeds | Success |
|---|---:|---|---:|
| BC policy (merge gate) | 20 | 0-19 | **100%** |
| BC policy (extra) | 100 | 1000-1099 | 100% |
| Scripted expert (baseline) | 100 | 1000-1099 | 100% |

Gate trials:

| Seed | Success | Steps | Reason |
|---:|---|---:|---|
| 0 | yes | 568 |  |
| 1 | yes | 582 |  |
| 2 | yes | 611 |  |
| 3 | yes | 586 |  |
| 4 | yes | 538 |  |
| 5 | yes | 639 |  |
| 6 | yes | 635 |  |
| 7 | yes | 555 |  |
| 8 | yes | 591 |  |
| 9 | yes | 689 |  |
| 10 | yes | 556 |  |
| 11 | yes | 597 |  |
| 12 | yes | 623 |  |
| 13 | yes | 624 |  |
| 14 | yes | 573 |  |
| 15 | yes | 554 |  |
| 16 | yes | 644 |  |
| 17 | yes | 619 |  |
| 18 | yes | 567 |  |
| 19 | yes | 570 |  |

Second program, `kit3.json` (three parts, two sharing a bin), trained the same way (200 demos, 114.27 s of training): **100%** over 20 trials (seeds 0-19).

```json
[{"op": "pick", "object": "scissors"}, {"op": "place", "target": "kit tray"}, {"op": "pick", "object": "bottle"}, {"op": "place", "target": "kit tray"}, {"op": "pick", "object": "cup"}, {"op": "place", "target": "left bin"}]
```

## Training

- Demos: 200 randomised episodes with noise injection, 166 completed (83%) and used; 148019 frames; 14.67 s on 8 processes.
- Policy: chunked MLP (3 x 512), 114359 frames, 30 epochs in 41.15 s on CPU; final train loss 0.0260, val loss 0.0274 (`loss_curve.json`).

## Videos (offscreen MuJoCo renders, software EGL)

- `scripted_run.mp4`: scripted, seed 0, success True, 18.367 s of sim
- `policy_run.mp4`: policy, seed 0, success True, 18.933 s of sim
- `gr00t_run.mp4`: gr00t, seed 0, success False, 40.0 s of sim, reason: timed out during pick bracket

## GR00T N1.7 closed loop (chip 3, port 21030)

Full episode (seed 1, 40.0 s of sim, 17.6 s wall): 75 queries, success False (timed out during pick bracket).

| Latency per query | p50 | p90 | max | mean |
|---|---:|---:|---:|---:|
| round trip from the sim (ms) | 89.9 | 312.6 | 535.7 | 143.1 |
| server total (ms) | 85.7 | 308.7 | 527.9 | 137.4 |
| device (ms) | 63.7 | 224.2 | 433.5 | 104.6 |

Two cameras x two frames (t-15, t) at 320x180 JPEG, DROID state, re-query every 8 action steps (0.53 s). GR00T is the foundation-model baseline; the sim is off its training distribution, so it is not expected to finish the task.
