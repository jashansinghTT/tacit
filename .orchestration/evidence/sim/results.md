# Sim evidence

Generated 2026-10-27T20:58:19Z by `sim/scripts/make_evidence.py` on program `sort2.json`:

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
| 0 | yes | 565 |  |
| 1 | yes | 588 |  |
| 2 | yes | 617 |  |
| 3 | yes | 592 |  |
| 4 | yes | 544 |  |
| 5 | yes | 637 |  |
| 6 | yes | 634 |  |
| 7 | yes | 558 |  |
| 8 | yes | 595 |  |
| 9 | yes | 687 |  |
| 10 | yes | 562 |  |
| 11 | yes | 600 |  |
| 12 | yes | 624 |  |
| 13 | yes | 624 |  |
| 14 | yes | 572 |  |
| 15 | yes | 560 |  |
| 16 | yes | 649 |  |
| 17 | yes | 618 |  |
| 18 | yes | 574 |  |
| 19 | yes | 578 |  |

Second program, `kit3.json` (three parts, two sharing a bin), trained the same way (200 demos, 49.04 s of training): **95%** over 20 trials (seeds 0-19). Failures: seed 11: timed out during pick scissors

```json
[{"op": "pick", "object": "scissors"}, {"op": "place", "target": "kit tray"}, {"op": "pick", "object": "bottle"}, {"op": "place", "target": "kit tray"}, {"op": "pick", "object": "cup"}, {"op": "place", "target": "left bin"}]
```

## Training

- Demos: 200 randomised episodes with noise injection, 166 completed (83%) and used; 148019 frames; 30.86 s on 8 processes.
- Policy: chunked MLP (3 x 512), 114359 frames, 30 epochs in 91.02 s on CPU; final train loss 0.0289, val loss 0.0296 (`loss_curve.json`).

## Videos (offscreen MuJoCo renders, software EGL)

- `scripted_run.mp4`: scripted, seed 0, success True, 18.367 s of sim
- `policy_run.mp4`: policy, seed 0, success True, 18.833 s of sim
- `gr00t_run.mp4`: gr00t, seed 0, success False, 40.0 s of sim, reason: timed out during pick bracket

## GR00T N1.7 closed loop (chip 3, port 21030)

Measured 2026-10-27T22:36:57Z at host load average 8.8. Full episode (seed 1, 40.0 s of sim, 11.3 s wall): 75 queries, success False (timed out during pick bracket).

| Latency per query | p50 | p90 | max | mean |
|---|---:|---:|---:|---:|
| round trip from the sim (ms) | 70.9 | 118.2 | 163.0 | 81.1 |
| server total (ms) | 67.5 | 114.9 | 158.9 | 77.8 |
| device (ms) | 58.2 | 65.8 | 145.8 | 63.3 |

Two cameras x two frames (t-15, t) at 320x180 JPEG, DROID state, re-query every 8 action steps (0.53 s). GR00T is the foundation-model baseline; the sim is off its training distribution, so it is not expected to finish the task.
