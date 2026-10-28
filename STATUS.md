# Tacit status

Updated: 2026-10-27 23:25 UTC by the lead (session tt-model-manager-4d)

**Open it:** http://127.0.0.1:8710 on this box (from a laptop: `ssh -L 8710:localhost:8710 <box>`).
Demo script: [docs/DEMO.md](docs/DEMO.md) (about 6 minutes). Why it matters: [docs/MOAT.md](docs/MOAT.md).

**State: released.** Every card is merged and the final build is live (backend deployed 22:32 UTC; web
rebuilt 23:20 UTC with footage credits). QA's end-to-end suites passed three rounds in a row in both the API
suite and the browser suite against the real deployment, 7/7 flows each (SPEC section 9), the last round on
the final build. Services run under systemd; the watchdog keeps them up. A 74 s showreel first cut is ready
for your review (no final render without you). No agent sessions are running; only the watchdog is.

## What works end to end (real hardware, nine models on four Blackhole chips)
- **Watch:** record live with a webcam or use a sample. Hands in 3D (HaMeR), gaze (Gaze-LLE) and parts
  (RF-DETR) are analysed at the camera's 10 fps on chip 0. The coach (gpt-oss-20b, chip 2) asks why after
  each step, out loud (S2 Pro, chip 1), and Whisper (chip 1) puts the answer on the step. The video becomes
  a skill: steps, the why, SOP, quiz, safety notes and a robot program.
- **Check:** VGGT (chip 0) rebuilds the scene in 3D. Real footage verifies (0.90 and 0.97); an AI-made clip
  is flagged suspect (0.23).
- **Teach:** lessons with a 3D twin of the expert, narration, 9 languages, practice with a live match score
  and hints, a voice tutor that answers from the expert's own explanations, a quiz and a certificate. Also a
  quality audit of a worker's run against the expert, and Reflex glove export plus a virtual glove.
- **Do:** Robot Lab trains a policy from 200 sim variations, 20/20 on the sample programs. Replay follows
  the expert's hands, and GR00T N1.7 (chip 3) drives the sim arm at 71 ms per decision (58 ms on the chip).
- **Earn:** Skill Exchange: consented listing → motion-only preview → license → pack (no video) → royalty
  ledger.
- **Box:** live view of all nine models, the chip each runs on, latency, device memory; busy shows as busy.

## Evidence
- QA: [.orchestration/evidence/qa/RESULTS.md](.orchestration/evidence/qa/RESULTS.md) (every run, with timings),
  FINDINGS.md (15 findings: 13 fixed and verified, 2 mitigated).
- Live speed: .orchestration/evidence/liveperf/ (5.8 → 10 fps, outputs identical).
- Sim and GR00T: .orchestration/evidence/sim/results.md. UI before/after: .orchestration/evidence/polish/.
- Tests: backend 55/55, sim 37/37 (+2 live GR00T), web mock suites 25/25, typecheck and lint clean.

## Known limits
- **Tutor voice:** S2 Pro speaks at 2 to 4× real time (slower when the box is busy). Text shows in about
  1 s. A new answer's voice starts 8 to 18 s later; questions asked before replay from cache in about 1 s
  (the demo's suggested questions are pre-voiced). Mitigations in place: interactive voice before batch,
  narration holds while someone talks, short first clause.
- Sim views render in software (this user has no GPU render access).
- Sample videos are Pexels/Pixabay stock footage, credited where they play; personas are fictional.

## How to run it
- `~/tacit/deploy/stack.sh status|up|down|restart-backend`; systemd user units `tacit-backend`,
  `tacit-models`, `tacit-watchdog.timer` (every 5 min: restarts what is down, writes the block below).
- Chips: 0 vision co-host (HaMeR :21000, Gaze-LLE :21001, RF-DETR :21002, VGGT :21003), 1 speech co-host
  (Whisper :21010, S2 Pro :21011, Music 3 :21012), 2 gpt-oss-20b :21020, 3 GR00T N1.7 :21030.
- E2E: `uv run --project tests/e2e pytest tests/e2e` (API) and
  `QA_WEB_URL=http://127.0.0.1:8710 scripts/e2e/ui.sh --no-merge --no-build` (browser).

## Needs you
- **Showreel first cut** for review: `data/showreel/first-cut.mp4` (74 s, 1080p, soundtrack made by MiniMax
  Music 3 on chip 1), previews in .orchestration/evidence/showreel/, every on-screen claim sourced in
  showreel/CLAIMS.md. Your two open choices (handoff in .orchestration/cards/showreel/handoff.md): the long
  opening (title at 22 s) and the soundtrack take.
- Reflex: running its code here was blocked by the auto-mode safety check (external code). To drive a
  glove, start Reflex yourself (`MOCK=1 ./application/dev.sh`); Tacit finds it at :8000 (or REFLEX_URL).
- MotionSites is on the free plan (3 prompts used): https://motionsites.ai/unlimited
- Optional: add user `jashan` to the `render` group for GPU rendering in the sim (system change, not done).

<!-- runtime:start -->
### Runtime (watchdog, 2026-10-28T03:34:56+00:00)

| service | state | check |
|---|---|---|
| backend | up | http://127.0.0.1:8710/api/health |
| llm | up | http://127.0.0.1:21020/v1/models |
| speech | up | http://127.0.0.1:21013/ |
| gr00t | up | http://127.0.0.1:21030/health |
| hamer | up | http://127.0.0.1:21000/health |
| gaze | up | http://127.0.0.1:21001/health |
| rfdetr | up | http://127.0.0.1:21002/health |
| vggt | up | http://127.0.0.1:21003/health |

tmux sessions: drama3: 2 windows (created Mon Oct 19 07:45:00 2026); gptoss: 3 windows (created Tue Oct 13 04:19:04 2026); mm3: 1 windows (created Wed Sep  9 14:57:33 2026); tacit-models: 1 windows (created Tue Oct 27 18:33:23 2026); tacit-team: 8 windows (created Tue Oct 27 18:42:05 2026)
<!-- runtime:end -->
