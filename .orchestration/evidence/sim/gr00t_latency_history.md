# GR00T N1.7 latency per query (chip 3, port 21030)

Same request shape throughout: two cameras x two frames (t-15, t) at 320x180 JPEG, DROID state,
instruction; one closed-loop episode of 40 s sim (75 queries), synchronous queries.

| Measured (UTC, 2026-10-27) | Host load avg (16 cores) | Round trip p50 / p90 | Server p50 | Device p50 / p90 |
|---|---:|---:|---:|---:|
| 19:28 (first evidence run) | quiet | 67.6 / 72.7 ms | 65.1 ms | 57.8 / 58.4 ms |
| 19:52 | ~30 | 89.9 / 312.6 ms | 85.7 ms | 63.7 / 224.2 ms |
| 21:12 (final evidence run, `gr00t_latency.json`) | ~53 | 592.8 / 904.4 ms | 577.9 ms | 420.1 / 687.2 ms |

The quiet numbers match the model card (55.9 ms device, 69.1 ms server-side). The server log
shows a single client during the 21:12 run (only health checks besides it), so the slowdown is
host CPU starvation: the "device" time includes host-driven upload, trace dispatch and
readback. Realtime streams pipeline their queries (see `tacit_sim/gr00t.py`), so the 30 Hz
stream keeps pace even when queries are slow.

Re-measure on a quiet host: `uv run --project sim python sim/scripts/make_evidence.py --gr00t-latency-only`
(rewrites `gr00t_latency.json` and the GR00T section of `results.md`).
