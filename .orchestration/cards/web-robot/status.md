# Status: web-robot

State: running
Updated: 2026-10-27T19:35:00+00:00

## Now
Read the spec, API, card, sim card and the backend's Robot Lab glue (`backend/tacit/robot/lab.py`)
and the sim runner on `work/sim`. Building the Robot Lab viewer and the two pages.

## Facts gathered
- Backend 8710 is up; `GET /api/robot/scene?skill_id=` returns the sim's `tacit-sim-scene/1`
  description (kinematic tree with meshes `/sim/panda/<body>.glb`, table, bins, objects, cameras).
- The GLBs are on `work/sim` (commit 0e984a3), not on main yet, and `~/tacit/web` does not exist
  on main, so the backend's `/sim` mount is empty for now. The viewer draws primitives until the
  GLBs load.
- `GET /api/robot/{id}` also returns `sim_available` (not in docs/API.md); `program_for` falls
  back to `pick part → place tray` when a skill has no program, so train/evaluate/run work on any
  skill; replay needs a twin (processed skill).

## Next
Viewer (FK from the scene tree, GLB or primitive links, objects, bins, ghost hands), run stream
store, modes, train chart, evaluation grid, GR00T panel, explainer strip, RobotIndex, e2e test.

## Blockers
None.
