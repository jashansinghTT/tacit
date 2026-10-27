# Status: vision

State: running
Updated: 2026-10-27T18:54:28+00:00

## Now
Step 3: building the cohost image (adapters + Dockerfile + build script).

## Works
- Step 1 done. Fixtures for all four members committed on work/vision (a612436, 6e75d2d):
  `backend/tests/fixtures/{hamer,gaze,rfdetr,vggt}/` + README. Standalone on chip 0, warm, 20 requests,
  client wall p50 / model p50: HaMeR 15.2 / 13.1 ms, Gaze-LLE (3 heads) 9.6 / 6.3 ms,
  RF-DETR 13.2 / 8.7 ms, VGGT (2 views) 1112 / 895 ms. Each answers bit-identically on repeat.
- Step 2 done. All four images: /opt/tt-metal tree + /opt/tt-venv (Python 3.12.14, ttnn
  0.75.0rc10.dev657+g8b98410e730 = tt-metal main 8b98410e730, torch 2.11.0+cpu, numpy 1.26.4).
  Every tt_metal source file is identical across the four (only build-generated headers differ, in
  #include order) -> one tree runs all four. Code: hamer/, gaze_lle/, rf_detr/ under /opt/tt-metal;
  VGGT under /opt/tt-metal/models/{demos,server} + /opt/tt-metal/vggt. None has tt_kernel.
  All open the chip with worker dispatch (same as the cohost host). Device-open settings:
  HaMeR mesh 1x1 trace 200 MiB; Gaze trace 64 MiB; RF-DETR l1_small 32 KiB, trace 90 MB;
  VGGT l1_small 64 KiB, trace 1536 MiB.

## Decisions
- Build from the published images' code, not the newer HF code/ snapshots in .tools/ref
  (those were updated after the images were built: new api.py/kernels). Same code as the
  standalone fixtures, so outputs can be compared one to one.
- tt-model's cohost launcher refuses to build images (install_lines raises: "kind cohost images
  are built FROM an existing package image plus the co-host runtime, not by tt-model package").
  The speech package was built from a hand-written Dockerfile. So: models/cohost-vision/build.sh
  runs docker build, then renders the staged manifest with tt-model's own ContainerManifest.to_wire
  into ~/tacit/build/cohost-vision/. Same serve path as any package.
- Boot: round 1 = compile only (eager, no trace captured anywhere), round 2 = capture with no
  eager warm runs, so nothing compiles or allocates persistent state after another member's
  trace exists.

## Next
- Adapters, image, staged manifest, first boot on chip 0.

## Blockers
- None.
