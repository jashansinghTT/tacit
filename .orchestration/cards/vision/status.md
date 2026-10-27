# Status: vision

State: review
Updated: 2026-10-27T19:24:54+00:00

## Now
Merge gate met; handoff.md written. The group is running on chip 0 (warm boot, image
tt-model/cohost-vision:5882863c8941). Nothing in progress.

## Works
- Fixtures for all four members committed (a612436, 6e75d2d); lead cherry-picked them into main.
- The cohost group SERVES on chip 0: hamer :21000, gaze :21001, rfdetr :21002, vggt :21003,
  status :21004. First served 19:10Z. Start: deploy/vision-up.sh; stop: deploy/vision-down.sh.
- Outputs: all four members bit-identical to their standalone packages on the fixture requests
  (max abs diff 0 on every field; VGGT dense arrays too). Also bit-identical under load: all four
  at once (10 each: 40/40), and HaMeR+Gaze+RF-DETR 300 each with VGGT running 10 times (910/910).
- Latency, one at a time (wall p50 / model p50, standalone in brackets): HaMeR 15.6/13.3 (15.2/13.1),
  Gaze 9.9/6.4 (9.6/6.3), RF-DETR 12.3/8.2 (13.2/8.7), VGGT 2 views 1078/886 (1112/895) ms.
  Three live members saturating the chip: ~32 ms p50 each (~30 frames/s); a request that lands
  during a VGGT forward waits up to ~0.95 s.
- Soak: HaMeR/Gaze/RF-DETR 3000 each + VGGT 60, 152 s: 9060/9060 bit-identical, no late compiles.
- Boot: cold (empty kernel cache, deploy/vision-up.sh incl. image build) 221 s; warm 30-31 s.
  Clean stop (deploy/vision-down.sh) 3.5 s.
- README with measured numbers: models/cohost-vision/README.md; evidence: .orchestration/evidence/vision/.
- Status port: DRAM per member (HaMeR 1.18, Gaze 0.14, RF-DETR 0.07, VGGT 3.43 GiB; total
  4.82 GiB/chip), L1 held after every phase 0 KiB/core, compiles_after_capture {}.

## Decisions
- Build from the published images' code, not the newer HF code/ snapshots (same code as the
  standalone fixtures -> one-to-one comparison).
- tt-model refuses to build kind-cohost images; build.sh builds the image (FROM the VGGT image,
  other members' code copied from their images, no network) and renders the manifest with
  tt-model's own ContainerManifest.to_wire into ~/tacit/build/cohost-vision/.
- Boot round 1 = eager compile only, round 2 = capture only (no eager runs once any trace exists).
- L1 fit (step 6): first boot failed: VGGT's camera layer norm needs CBs up to byte 1,545,088 of
  core (0,0); RF-DETR's 24 layer-scale rows and HaMeR's ones row were resident in L1 (46 KiB/core).
  Mixed DRAM/L1 placement does not compile for the fused matmul-addcmul kernel, so the adapters
  copy those rows into L1 right before each use (freed after). Bit-identical outputs, +0.3 ms HaMeR.
- l1_small_size 64 KiB (VGGT's own): at 96 KiB VGGT's dense outputs moved by a few fp16 ulps.

## Next
- Lead: review and merge work/vision; point deploy/stack.yaml's vision-cohost group at
  deploy/vision-up.sh (or the staged manifest ~/tacit/build/cohost-vision/tt_kernel_manifest.json).

## Blockers
- None.
