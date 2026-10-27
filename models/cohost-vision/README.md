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

By hand:

```bash
models/cohost-vision/build.sh
~/tacit/.tools/ttm/bin/tt-model serve ~/tacit/build/cohost-vision/tt_kernel_manifest.json --device-id 0 --port 21000 --detach
~/tacit/.tools/ttm/bin/tt-model logs  ~/tacit/build/cohost-vision/tt_kernel_manifest.json -f   # until "cohost: all members ready"
curl -s localhost:21000/predict -H 'Content-Type: application/json' -d @backend/tests/fixtures/hamer/request.json
curl -s localhost:21004/
~/tacit/.tools/ttm/bin/tt-model stop  ~/tacit/build/cohost-vision/tt_kernel_manifest.json
```

MEASURED_SECTIONS

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
