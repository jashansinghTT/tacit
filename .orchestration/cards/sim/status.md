# Status: sim

State: running
Updated: 2026-10-27T20:05Z

## Works (on work/sim, last commit a5d3049; f953b6d and 0e984a3 merged by the lead)
- Public API as in the card; the backend's Robot Lab is wired to it (lead).
- Tests: `uv run --project sim pytest sim/tests`: 36 pass, 1 live GR00T test skipped by default
  (passes with TACIT_LIVE=1). Accepted by the lead as the gate command.
- Policy: 20/20 on sort2 (and 100/100 on seeds 1000-1099); 20/20 on a three-part kit program.
  Demos ~20 s, training ~40 s on CPU.
- Scripted expert: 40/40 on sort2, kit3, an odd LLM-style program, 20/20 on five parts.
- GR00T N1.7 on chip 3 (port 21030): full 40 s episode, 75 queries, ~68 ms p50 round trip.
- Web assets in web/public/sim (5 MB): per-link GLBs, panda.glb, scene.json; FK recipe tested.
- Replay: retarget affine exposed (`transform`) and `meta.human` for web-robot's ghost hands.

## Now
- Regenerating evidence with the final code (videos, success table, GR00T latency), then handoff.

## Decisions (details in handoff.md when written)
- DROID conventions recovered from GR00T's own /demo request (`tacit_sim/droid.py`).
- Software EGL rendering (user not in `render` group; system groups left alone).
- Torque limits 3x the real Panda's: the real limits caused a frozen-arm limit cycle near the
  shoulder singularity.
- GR00T stays running on chip 3 for the stack.
