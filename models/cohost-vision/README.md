# tacit-vision: four vision models on one Blackhole chip

HaMeR, Gaze-LLE, RF-DETR and VGGT-1B served from **one process on chip 0**, each on its own port
with the HTTP API of its standalone package, so the backend does not care which layout runs.
This is tt-model's co-host kind (`kind: cohost`, branch `feat/cohost-kind`), applied to vision.

| member | port | standalone package | API |
|---|---|---|---|
| HaMeR | 21000 | `changh95/hamer-p150` | `POST /predict {image, bbox, is_right}` → MANO `rotmats`, `betas`, `cam`, `cam_t_full` |
| Gaze-LLE | 21001 | `changh95/gaze-lle-p150` | `POST /predict {image, bboxes, heatmap_format}` → per head `inout`, `gaze_target` |
| RF-DETR | 21002 | `changh95/rf-detr-p150` | `POST /predict {image, threshold}` → `detections` |
| VGGT-1B | 21003 | `changh95/vggt-1b-p150` | `POST /predict {images, output_format}` → cameras + dense depth/points |
| status | 21004 | | `GET /` → readiness, DRAM and L1 per member, late compiles |

Every member also keeps `GET /health`, `GET /info` and `GET /v1/models`.

## Start and stop

```bash
deploy/vision-up.sh        # builds the image if needed, starts the group on chip 0, waits for all four
deploy/vision-down.sh      # tt-model stop (clean SIGTERM; the host closes the mesh)
```

`vision-up.sh` builds only when the staged manifest or its image is missing; after changing an
adapter, the manifest or the Dockerfile, run `build.sh` yourself, then `vision-down.sh` and
`vision-up.sh`. `vision-up.sh` exits 0 once all four `/health` say ok (also when the group was
already up), so a watchdog can call it to restart a group that went down.

By hand:

```bash
models/cohost-vision/build.sh
~/tacit/.tools/ttm/bin/tt-model serve ~/tacit/build/cohost-vision/tt_kernel_manifest.json --device-id 0 --port 21000 --detach
~/tacit/.tools/ttm/bin/tt-model logs  ~/tacit/build/cohost-vision/tt_kernel_manifest.json -f   # until "cohost: all members ready"
curl -s localhost:21000/predict -H 'Content-Type: application/json' -d @backend/tests/fixtures/hamer/request.json
curl -s localhost:21004/
~/tacit/.tools/ttm/bin/tt-model stop  ~/tacit/build/cohost-vision/tt_kernel_manifest.json
```

## Measured (chip 0 of this QuietBox 2, Blackhole p300c, 2026-10-27)

All requests are the fixture requests in `backend/tests/fixtures/<member>/` (README there), sent
by `tools/vision_probe.py`; standalone = each member's own published package alone on chip 0.

### Outputs: identical to standalone

Every member answers its fixture requests **bit-identically** to its standalone package: the
maximum absolute difference is 0 on every output field. That covers HaMeR's `rotmats`, `betas`,
`cam` and `cam_t_full` (right and left hand), and Gaze-LLE's `inout`, gaze target and float32
64x64 heatmaps for 3 heads. It covers RF-DETR's labels, boxes and scores (5 of 5 matched, IoU 1,
score diff 0), and VGGT's `extrinsic`, `intrinsic`, `pose_enc` and all four dense arrays (npz and
JSON forms). The same holds under load: every response in the runs below was compared with the
standalone baseline, and all of them were identical.

| run | HaMeR | Gaze-LLE | RF-DETR | VGGT |
|---|---|---|---|---|
| one at a time, after a cold and after a warm boot | identical | identical | identical | identical |
| all four at once, 10 requests each | 10/10 | 10/10 | 10/10 | 10/10 |
| live path, 300 each, with VGGT running 10 times | 300/300 | 300/300 | 300/300 | 10/10 |
| soak: 3000 each, with VGGT running 60 times (152 s) | 3000/3000 | 3000/3000 | 3000/3000 | 60/60 |

### Latency, one request at a time (warm, 20 requests)

| member | request | standalone wall p50 / model p50 | cohost wall p50 / model p50 |
|---|---|---|---|
| HaMeR | one hand, 334x512 frame | 15.2 / 13.1 ms | 15.6 / 13.3 ms |
| Gaze-LLE | 3 heads, 500x334 | 9.6 / 6.3 ms | 9.9 / 6.4 ms |
| RF-DETR | 640x480 | 13.2 / 8.7 ms | 12.3 / 8.2 ms |
| VGGT-1B | 2 views, npz | 1112 / 895 ms | 1078 / 886 ms |

Wall is the client's round trip; model is the server's own device-time field (`timing_ms.device`,
`inference`, `inference`, `forward`). Other VGGT view counts in the group: 1 view 419 ms, 3 views
1.86 s, 4 views 2.81 s (wall, JSON output).

### Latency with the members busy at once

The members take turns on the chip, so a request waits for whatever device work is ahead of it.

| load | HaMeR p50 / p95 / max | Gaze-LLE p50 / p95 / max | RF-DETR p50 / p95 / max |
|---|---|---|---|
| the three live members back to back (300 each) | 32 / 41 / 60 ms | 33 / 42 / 49 ms | 33 / 40 / 61 ms |
| the same, with VGGT (2 views) running 10 times meanwhile | 32 / 54 / 955 ms | 32 / 54 / 931 ms | 32 / 54 / 939 ms |

With all three live members saturated, each serves about 30 requests/s (90 in total), so one
frame of HaMeR + Gaze-LLE + RF-DETR fits in about 33 ms. A live request that arrives during a
VGGT forward waits for the rest of it (up to 1.1 s for 2 views, 2.8 s for 4). VGGT itself: p50
1.18 s per 2-view request while the others are busy.

### Device memory (status port, `GET :21004/`)

| member | DRAM per chip after load / compile / capture | L1 held after each phase |
|---|---|---|
| HaMeR | 1.18 / +0.00 / +0.00 GiB | 0 KiB/core |
| Gaze-LLE | 0.13 / +0.01 / +0.00 GiB | 0 KiB/core |
| RF-DETR | 0.06 / +0.01 / +0.00 GiB | 0 KiB/core |
| VGGT-1B | 2.60 / +0.46 / +0.37 GiB | 0 KiB/core |
| total | 4.82 GiB of 32 GiB, plus a 1.84 GiB trace region | L1_SMALL 14.8 KiB/core |

`compiles_after_capture` stays `{}` through all of the above, error requests included: no
program is compiled once traces exist.

### Boot

| boot | time to all four healthy | notes |
|---|---|---|
| cold (empty kernel cache, `deploy/vision-up.sh` incl. image build) | 221 s | compile: HaMeR 25 s, Gaze-LLE 35 s, RF-DETR 30 s, VGGT 123 s; captures 2 s |
| warm (kernel cache in `~/.cache/tt-model/cohost-vision/cache`) | 31 s | |

Standalone, for comparison: HaMeR 19 s, Gaze-LLE 39 s, RF-DETR 36 s, VGGT 219 s (partly warm
caches), one chip each.

## Known issues and limits

- **VGGT blocks the live path while it runs.** A VGGT request holds the chip for its whole
  forward (0.4 s for 1 view to 2.8 s for 4); HaMeR, Gaze-LLE and RF-DETR requests that arrive
  meanwhile wait. Run VGGT outside live capture (Tacit uses it only in the offline Check step).
- **One request at a time per member**, as standalone; requests queue first come, first served.
- **HaMeR: MANO parameters only.** `MANO_RIGHT.pkl` is licence-bound and not shipped; place your
  own at `~/.cache/tt-model/cohost-vision/weights/MANO_RIGHT.pkl` (mounted as `/weight-cache`)
  to get vertices, joints and 2-D keypoints.
- **One member down, the group down** (co-host design): if a member's server thread ends, the
  container exits; `deploy/vision-up.sh` starts it again.
- The image is built FROM the four member images, so they must be loaded in docker to rebuild it.
- Only HaMeR's and RF-DETR's L1 constant rows changed placement (copied into L1 at each use
  instead of resident; see below); everything else is each member's published code as is.

## What had to change to fit (and why)

1. **No member may keep anything resident in L1.** The first boot failed compiling VGGT's camera
   layer norm: `Statically allocated circular buffers ... clash with L1 buffers on core range
   [0-0 - 0-0]. L1 buffer allocated at 1427456 and static circular buffer region ends at
   1545088`. That program uses nearly all of core (0,0)'s L1, while RF-DETR (24 layer-scale rows)
   and HaMeR (one ones row) held 46 KiB/core of resident L1. They keep those rows in L1 because
   the fused matmul-addcmul kernel wants its scale row in the same buffer type as an L1 residual,
   and mixed placement does not compile in this tree (`no matching function for call to
   read_ternary_blocks_sync`). So the adapters free the resident copies and have the models' own
   selectors (`hamer.vit._ones`, `TtDinoBackbone._ls`) return a copy made into L1 right before
   the op that reads it. Same values, same op: outputs stay bit-identical; cost +0.2 ms on
   HaMeR's device time, none measurable on RF-DETR. Resident L1 would also be unsafe in a group
   even if it fit: a trace replay does not re-check circular buffers, so one member's replay
   could silently overwrite another's L1 constants. The boot log lists every live L1 buffer
   after each phase (`TT_COHOST_L1_REPORT=1`): none, throughout.
2. **`l1_small_size` is VGGT's own 64 KiB.** At 96 KiB (enough for RF-DETR's 32 KiB plus VGGT's
   64 KiB), VGGT's dense outputs moved in 0.3% of values by a few fp16 ulps (PCC 1 - 1e-7;
   cameras unchanged): its conv2d configs depend on the L1_SMALL size. At 64 KiB they are
   bit-identical. The group uses 14.8 KiB/core of it.

## How it is built (and how to rebuild it)

`tt-model package --container` builds no image for kind `cohost` (its launcher refuses: "kind
cohost images are built FROM an existing package image plus the co-host runtime"), which is how
the speech group was made too. So `build.sh` does what `package` would:

1. Stages a build context in `~/tacit/build/cohost-vision-ctx/`: the adapters
   (`adapters/cohost_vision/`) and tt-model's co-host runtime (`tt_kernel/__init__.py` +
   `tt_kernel/cohost/*.py`, stdlib only) copied from the tt-model install at `~/tacit/.tools/ttm`
   (identical to `feat/cohost-kind` at `beaa4a8`; hashes in `runtime.sha256` next to the manifest).
2. `docker build` with `Dockerfile`: FROM the VGGT image (`tt-model/vggt-1b-p150:2c77d478b134`),
   with `hamer/`, `gaze_lle/` and `rf_detr/` copied byte for byte from their own published
   images, plus `scipy` from HaMeR's image (HaMeR reads `MANO_RIGHT.pkl` with it). No network.
3. Tags the image `tt-model/cohost-vision:<first 12 of its id>` (as `package` names images) and
   renders `~/tacit/build/cohost-vision/tt_kernel_manifest.json` from `tt-model.yaml` with
   tt-model's own `ContainerManifest.to_wire` (`render_manifest.py`). `cohost-config.json` there
   is the exact group config the container receives.

It needs the four member images in docker (`tt-model pull changh95/{hamer,gaze-lle,rf-detr,vggt-1b}-p150`).
To change a member's settings, edit its `env` in `tt-model.yaml`; to change code, edit an adapter;
then rerun `build.sh` and restart the group. Nothing is pushed to Hugging Face.

Why one image can hold all four: the four published images are built from the same tt-metal tree
(main `8b98410e730` + `tt-metal-eth-dispatch.patch`, ttnn `0.75.0rc10.dev657+g8b98410e730`) and the
same venv (Python 3.12.14, torch 2.11.0+cpu, numpy 1.26.4). Every `tt_metal/` source file is
identical across them; only build-generated headers differ, in `#include` order. The co-host host
opens the chip with worker dispatch (11x10 grid), as every member's standalone server did.

The members run the code of their **published images**, not the newer `code/` in the Hub repos
(updated after those images were built). That is what the standalone fixtures came from, so the
outputs can be compared one to one.

## How the members share the chip

- **One process, one mesh.** `tt_kernel.cohost` opens chip 0 once and owns every device call:
  a request's device work runs as one step on the device thread (`host.step`), first come, first
  served. A member's own FastAPI app serves its port in the same process; the adapter replaces
  the app's lifespan (which would open a chip) and puts a step-wrapped model in the app's `STATE`.
- **Two-round boot.** A trace replays the addresses it captured; anything allocated or compiled
  after some trace was captured can sit in that trace's scratch and be overwritten. So every
  adapter splits its standalone warm-up: round 1 (all members) runs eager forwards only, at every
  shape that will be traced: every program compiled, every prepared weight, constant table and
  persistent input buffer allocated, with no trace live anywhere. Round 2 only captures (no eager
  warm runs), so nothing compiles or allocates long-lived memory once any trace exists. The only
  buffers allocated in round 2 are trace inputs and outputs, which each member writes and reads
  inside its own step. The status port's `compiles_after_capture` stays `{}` (checked below).
- **Env per member.** Each member's standalone env is applied only while it loads and warms up.
  HaMeR and Gaze-LLE both read `TT_FUSED_SDPA`, `TT_FUSED_FIDELITY` and `TT_FUSED_L1` with
  different meanings, so none of those is set for the whole container.
- **Device config.** `trace_region_size` is the sum of the members' own regions (HaMeR 200 MiB,
  Gaze-LLE 64 MiB, RF-DETR 90 MB, VGGT 1536 MiB); `l1_small_size` holds RF-DETR's and VGGT's
  conv2d configs (32 and 64 KiB standalone).

## Files

| file | what |
|---|---|
| `tt-model.yaml` | the authored manifest: members, ports, per-member env, device config |
| `Dockerfile`, `build.sh`, `render_manifest.py` | image build and staged package (see above) |
| `adapters/cohost_vision/{hamer,gaze,rfdetr,vggt}.py` | one `AppMember` per model; `common.py` shared pieces |
| `tools/vision_probe.py` | fixtures, latency, output comparison against standalone, all-four-at-once test |
| `../../deploy/vision-{up,down}.sh` | start (from cold) and stop |
