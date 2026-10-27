# Handoff: vision (tacit-vision cohost on chip 0)

Branch `work/vision` (worktree `~/tacit-wt/vision`). Merge gate met: fixtures committed; the
four-member cohost group serves on chip 0 on ports 21000-21004; `deploy/vision-up.sh` brings it
up from cold; README has measured numbers. The group is running now (warm boot, image
`tt-model/cohost-vision:5882863c8941`).

## What shipped

| path | what |
|---|---|
| `backend/tests/fixtures/{hamer,gaze,rfdetr,vggt}/` + `README.md` | real request/response pairs from each standalone package on chip 0 (already cherry-picked into main) |
| `models/cohost-vision/tt-model.yaml` | the authored manifest, `kind: cohost`: 4 app members (ports 21000-21003), status 21004, per-member env, `tt_config` |
| `models/cohost-vision/adapters/cohost_vision/` | `hamer.py`, `gaze.py`, `rfdetr.py`, `vggt.py` (one `AppMember` each), `common.py` |
| `models/cohost-vision/Dockerfile`, `build.sh`, `render_manifest.py` | image build (FROM the VGGT image, other members' code from their images, no network) and staged package in `~/tacit/build/cohost-vision/` |
| `models/cohost-vision/tools/vision_probe.py` | fixtures, latency, output comparison vs standalone, concurrency/soak test |
| `models/cohost-vision/README.md` | how it works, how to rebuild, measured numbers, known issues |
| `deploy/vision-up.sh`, `deploy/vision-down.sh` | start (from cold, waits for all four `/health`) and stop |
| `.orchestration/evidence/vision/` | the raw measurements behind the README |

## How to run it

```bash
deploy/vision-up.sh      # exit 0 when hamer :21000, gaze :21001, rfdetr :21002, vggt :21003, status :21004 are up
deploy/vision-down.sh    # tt-model stop (clean SIGTERM, 3.5 s)
```

`vision-up.sh` builds the image if the staged manifest or its image is missing, stops a standalone
vision package that holds chip 0 (and refuses if anything else does), and is safe to call when
the group is already up (exit 0). For `deploy/stack.yaml`: the `vision-cohost` group's package is
the staged manifest `~/tacit/build/cohost-vision/tt_kernel_manifest.json` (built from
`models/cohost-vision/`), served as
`tt-model serve <that manifest> --device-id 0 --port 21000`; calling `deploy/vision-up.sh`
does all of it.

## Measured (details in `models/cohost-vision/README.md`)

- **Outputs: bit-identical to standalone** for all four members (max abs diff 0 on every field,
  VGGT's dense arrays included). Also under load: all four at once 40/40, and a 152 s soak
  (HaMeR/Gaze/RF-DETR 3000 requests each with VGGT running 60 times): 9060/9060 identical.
- **Latency alone** (wall p50 / model p50; standalone in brackets): HaMeR 15.6/13.3 (15.2/13.1),
  Gaze-LLE 3 heads 9.9/6.4 (9.6/6.3), RF-DETR 12.3/8.2 (13.2/8.7), VGGT 2 views 1078/886
  (1112/895) ms. VGGT 1/3/4 views: 0.42/1.86/2.81 s.
- **Under load**: the three live members saturated get ~30 requests/s each (p50 32 ms, p95 41 ms);
  a live request that lands during a VGGT forward waits up to ~0.95 s (2 views).
- **Memory**: DRAM 4.82 GiB/chip (HaMeR 1.18, Gaze 0.14, RF-DETR 0.07, VGGT 3.43) + 1.84 GiB trace
  region; L1 held 0 KiB/core after every phase; L1_SMALL 14.8 KiB/core; `compiles_after_capture` {}.
- **Boot**: cold (empty kernel cache, via vision-up.sh) 221 s; warm 30-31 s.

## Status port for the Box page (F7)

`GET http://127.0.0.1:21004/` returns `members.<name>.{kind, port, ready}`,
`dram_gib_per_chip.members.<name>.{load, warmup-compile, warmup-capture}` (GiB added per phase;
sum them for a member's DRAM), `dram_gib_per_chip.total`, `l1_kib_per_core_after_phase.<name>`,
`compiles_after_capture` (should stay `{}`) and `device_owner` (the member on the chip right now).
Example: `.orchestration/evidence/vision/status_port.json`.

## Known issues

- **VGGT blocks the live path while it runs** (0.4 s for 1 view to 2.8 s for 4): HaMeR, Gaze-LLE
  and RF-DETR requests wait behind it. Keep VGGT calls out of live capture (Check step only), or
  expect the stall. Splitting VGGT's trace so others can interleave would need changes to VGGT's
  port; not done.
- HaMeR returns MANO parameters only (no `MANO_RIGHT.pkl`, as expected). To enable meshes, place
  the file at `~/.cache/tt-model/cohost-vision/weights/MANO_RIGHT.pkl`.
- If a member's server thread dies the whole group exits (co-host design); a watchdog can rerun
  `deploy/vision-up.sh`.
- Two deliberate changes to the members, both output-neutral (bit-identical): HaMeR's ones row
  and RF-DETR's layer-scale rows are copied into L1 per use instead of resident (they made VGGT's
  camera layer norm clash with L1), and `l1_small_size` is VGGT's 64 KiB (at 96 KiB VGGT's dense
  outputs moved by a few fp16 ulps).
- tt-model has no `ps` command; use `docker ps` or the status port.
