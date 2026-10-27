# Status: sim

State: review
Updated: 2026-10-27T21:20Z

Merge gate met; see `handoff.md` in this folder.

## Works
- `tacit_sim` public API (backend wired to it by the lead), plus `policy_info` and
  `ProgramMismatch` (QA-2 root cause: train/evaluate program mismatch, fixed both sides).
- Tests: `uv run --project sim pytest sim/tests`: 37 pass + 2 live GR00T tests (39/39 with
  TACIT_LIVE=1).
- Policy: 20/20 on sort2 (gate), 100/100 on extra seeds; 19-20/20 on six other program shapes.
- GR00T N1.7 closed loop on chip 3 (port 21030, left running): full 40 s episodes; latency
  67.6 ms p50 quiet, much higher when the host is CPU-starved (history in evidence).
- Web assets in web/public/sim; evidence in .orchestration/evidence/sim.

## For the lead
- Merge efbc734, c21cd23, 6f55cde and the handoff commit (all after 87fc566).
- Re-measure GR00T latency on a quiet host:
  `uv run --project sim python sim/scripts/make_evidence.py --gr00t-latency-only`.
- Optional: add user `jashan` to the `render` group for GPU EGL rendering (not done; system change).

## Blockers
None.
