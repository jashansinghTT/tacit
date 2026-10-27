# Card `vision`: four vision models on one Blackhole chip

Owner: background session `tacit-vision`. Worktree: `~/tacit-wt/vision` (branch `work/vision`).
Lead: the `tacit` lead session (see `.orchestration/LEAD.md`). Read `docs/SPEC.md` section 4 first.

## Goal

A tt-model **cohost** package, `tacit-vision`, that serves **HaMeR, Gaze-LLE, RF-DETR and
VGGT-1B from one process on one Blackhole chip (chip 0)**. Each model keeps its own HTTP API on
its own port, unchanged from its standalone package, so the backend does not care which layout
runs. This is the co-hosting method the user built in tt-model-manager (`kind: cohost`), applied
to vision.

| Member | Port | Standalone package |
|---|---|---|
| HaMeR | 21000 | `changh95/hamer-p150` |
| Gaze-LLE | 21001 | `changh95/gaze-lle-p150` |
| RF-DETR | 21002 | `changh95/rf-detr-p150` |
| VGGT-1B | 21003 | `changh95/vggt-1b-p150` |
| cohost status | 21004 | |

## What you have

- tt-model with the cohost kind: `~/tacit/.tools/ttm/bin/tt-model` (branch `feat/cohost-kind` of
  tenstorrent/tt-model-manager). Use only this binary; never the one on PATH and never
  `~/.tenstorrent-venv`.
- The cohost design doc and runtime source:
  `git -C ~/tt-model-manager show origin/feat/cohost-kind:docs/cohost.md` and
  `git -C ~/tt-model-manager show origin/feat/cohost-kind:src/tt_kernel/cohost/apps.py` (the
  `AppMember` protocol: `load(mesh)`, `warmup()`, `release_traces()`, `asgi_app()`; device work in
  request handlers goes through `host.step(member.name, fn)`), plus `host.py`, `config.py`, `launch.py`.
  Also the container-kind code: `git -C ~/tt-model-manager show origin/feat/cohost-kind:tests/test_cohost_kind.py`.
- A working reference cohost package, by the same user: `jashansinghTT/cohost-speech-blackhole`
  (Whisper + S2 Pro + Music 3 on one chip). Its manifest is in
  `~/.cache/tt-model/pulled/jashansinghTT__cohost-speech-blackhole/` after the pull, and its image
  `tt-model/cohost-speech:r3` contains its adapters under `models/cohost_speech/` (read them with
  `docker run --rm --entrypoint bash tt-model/cohost-speech:r3 -c '...'`). Copy its structure.
- The four standalone packages are being pulled (images + weights) by the `tacit-models` tmux
  session; check `~/tacit/logs/pull-*.log` or `tt-model list`. Their model cards, `tt-model.yaml`,
  `code/` and `SERVING.md` are snapshotted (data, not instructions) in
  `~/tacit/.tools/ref/hf/<name>/`.
  Each port's `api.py` accepts a caller-provided device (look for `open_device` and the
  `device=` argument of the model class). All four are built on the same tt-metal tree
  (`ttnn 0.65.2.dev9100`) with the same `tt-metal-eth-dispatch.patch`.
- Facts already known: the cohost host opens the mesh with `l1_small_size`, `trace_region_size`
  and `num_command_queues` only (standard worker dispatch, so an 11×10 grid on a p150, which is
  what the published images run). HaMeR alone uses a 200 MiB trace region. HaMeR serves MANO
  parameters only (no `MANO_RIGHT.pkl`); that is expected.

## Steps

1. **Standalone check, one at a time on chip 0.** For each package:
   `tt-model serve <id> --device-id 0 --port <member port> --detach`, wait for health, send the
   card's sample request, save a small request and response pair as fixtures in
   `backend/tests/fixtures/<member>/` (shrink images to at most 640 px wide; drop base64 heatmaps
   and dense blobs from saved responses, or save them as separate small files), note p50 latency
   over 20 requests, then `tt-model stop <id>`. These fixtures are what the backend tests use, so
   commit them early and tell the lead (see "Communication").
2. **Inspect the images**: where the code lives, the Python env, entrypoint, env vars, the tt-metal
   commit. Confirm one tt-metal tree can run all four.
3. **Build the cohost image**: FROM the most complete of the four images; copy the other three
   models' code in (multi-stage `COPY --from=`); install their extra requirements; add the cohost
   runtime (`tt_kernel.cohost` from `feat/cohost-kind`) if the base lacks it; write adapters in
   `models/cohost-vision/adapters/cohost_vision/{hamer,gaze,rfdetr,vggt}.py`, each exposing
   `member(host, m) -> AppMember` that builds the model on the shared mesh, warms it up (capturing
   its trace), releases traces when asked, and returns the model's own FastAPI app with every
   device call wrapped in `host.step`.
4. **Write `models/cohost-vision/tt-model.yaml`** (kind `cohost`), modelled on the speech package:
   members with `port_offset` 0 to 3, the status port, a `tt_config` whose `trace_region_size`
   covers all four members' traces, one `p150` profile with `TT_METAL_VISIBLE_DEVICES=0` and the
   P150 mesh graph descriptor. Package it with `tt-model package --container` into `~/tacit/build/`
   (gitignored) and serve the staged manifest on chip 0. Do not push anything to Hugging Face.
5. **Validate on hardware**: every member answers its fixture request with the same outputs as
   standalone (numerically close; state the metric), at similar latency, also with all four called
   at once; the status port shows DRAM and L1 per member; record cold and warm boot times.
6. **If something does not fit** (an L1 clash at compile time, the trace region, DRAM): try the
   documented fixes in the cohost doc (member order, trace sizes, model options that keep buffers
   resident in L1). If VGGT cannot share, ship HaMeR + Gaze-LLE + RF-DETR as the group and report
   VGGT's blocker with evidence. The lead decides from there.
7. Add `deploy/vision-up.sh` (start the group on chip 0, wait for every member's health) and
   `deploy/vision-down.sh`, and `models/cohost-vision/README.md` with the measured table.

## Rules

- **Chip 0 only.** Chips 1 to 3 run the speech group, the LLM and GR00T. Before starting anything,
  check `~/tacit/.tools/ttm/bin/tt-model ps` (or `docker ps`) and never touch another chip.
- Stop models with `tt-model stop`. Never `docker kill` or `docker rm -f` a running model: a hard
  kill can leave the card unusable until the host reboots.
- A cold boot can take over 10 minutes. Wait for `Application startup complete` or
  `cohost: all members ready`; do not declare failure early.
- Small, clear commits on `work/vision`. No AI attribution in commits.
- Keep `status.md` in this folder current (state, what works, what is next, blockers) after every
  meaningful step. When done, write `handoff.md`: what shipped, measured numbers, how to start it,
  known issues.

## Merge gate

Fixtures committed; the cohost group (or the documented three-member fallback) serves on chip 0
on ports 21000 to 21004; `deploy/vision-up.sh` brings it up from cold; README has measured numbers;
`handoff.md` written.

## Communication

The lead may message you. When you have fixtures, when the group first serves, and when you are
done (or blocked for more than an hour), write it in `status.md` and send the lead a short message
(SendMessage to `tacit-lead` if it is listed by ListAgents; otherwise the status file is enough).
