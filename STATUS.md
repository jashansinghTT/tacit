# Tacit status

Updated: 2026-10-27 21:45 UTC by the lead (session tt-model-manager-4d)

**Open it:** http://127.0.0.1:8710 on this box (from a laptop: forward port 8710). Demo script: docs/DEMO.md.
**State:** release candidate. Every page and flow is merged and live on the real hardware. Last step now:
the live-capture speed-up (chip 0 image swap, about 22:10 UTC), then QA's two clean release runs (API +
browser, about 90 min). After that come the polish pass on web/dist and a showreel first cut for your review.

## Works end to end on the real stack
- Nine models, four Blackhole chips, all healthy (chip 0 vision co-host: HaMeR, Gaze-LLE, RF-DETR, VGGT,
  bit-identical to standalone; chip 1 Whisper + S2 Pro + Music 3; chip 2 gpt-oss-20b; chip 3 GR00T N1.7).
- Watch: video → skill (steps, the why, SOP, quiz, safety, robot program), lesson voiced by S2 Pro, 9 languages.
- Check: real footage 0.90 / 0.97 verified, AI-made 0.23 suspect (VGGT geometry).
- Teach: live capture with the coach asking why out loud after each step; Whisper transcribes the answer.
- Do: trainee practice with live feedback, tutor Q&A by voice, quality audit of a worker's run vs the expert.
- Robot: policy trained from 200 sim variations, 20/20 on the sample programs; GR00T N1.7 drives the sim.
- Earn: Skill Exchange sell → license → motion-only pack → royalty ledger; Reflex glove export.
- QA API release run #1: 6/7 flows green; the 7th (listing page) was QA-12, fixed and deployed 21:31 UTC.
- Tests: backend 44/44, sim 37/37 (+2 live GR00T), web smoke/learn/exchange/robot suites green.

## Fixed today from QA (all with regression tests)
QA-1..8 (restart recovery, program mismatch, speech priority, teardown, Studio re-runs, CPU priority);
QA-11 quiz could come out empty → validated, retried, filled in the background;
QA-12 listing page 500 for trained skills; QA-13 the writer could fold five repetitions into one step →
every observed step survives; QA-14 GR00T calls now show on the Box; quiz answers no longer always first.

## Team (headless Claude sessions, tmux `tacit-team`)
| card | owner | state |
|---|---|---|
| backend, deploy, integration | lead | running |
| liveperf: 5.8 → 10 fps live analysis (camera-capped), outputs identical | tacit-vision | chip 0 swap now |
| perception quality (vase P 1.00 R 0.83, jars P 0.80 R 0.80) | tacit-vision | merged |
| sim + policy + GR00T | tacit-sim | merged |
| web: landing, Studio, Skills, Audit, Box, Learn, Exchange, Robot Lab | tacit-web* | merged |
| polish: whole-app consistency, tour, performance, a11y | tacit-web | running |
| QA: release runs | tacit-qa | paused for the chip 0 swap |
| showreel (first cut only) | tacit-showreel | running |

## Needs you
- Reflex: running its code here was blocked by the auto-mode safety check (external code). To drive a
  glove, start Reflex yourself (`MOCK=1 ./application/dev.sh`); Tacit finds it at :8000 (or REFLEX_URL).
- MotionSites is on the free plan (3 prompts used): https://motionsites.ai/unlimited
- The showreel is a first cut for your review; no final render without you.
- Optional: add user `jashan` to the `render` group for GPU rendering in the sim (system change, not done).

<!-- runtime:start -->
### Runtime (watchdog, 2026-10-27T21:40:57+00:00)

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

tmux sessions: drama3: 2 windows (created Mon Oct 19 07:45:00 2026); gptoss: 3 windows (created Tue Oct 13 04:19:04 2026); mm3: 1 windows (created Wed Sep  9 14:57:33 2026); tacit-heartbeat: 1 windows (created Tue Oct 27 19:10:18 2026); tacit-models: 1 windows (created Tue Oct 27 18:33:23 2026); tacit-team: 8 windows (created Tue Oct 27 18:42:05 2026)

Last watchdog action: cpu priority: tt-model-cohost-vision-p150=4096
<!-- runtime:end -->
