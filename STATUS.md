# Tacit status

Updated: 2026-10-27 22:30 UTC by the lead (session tt-model-manager-4d)

**Open it:** http://127.0.0.1:8710 on this box (from a laptop: forward port 8710). Demo script: docs/DEMO.md.
**State:** release verified. QA's two consecutive release rounds on build 27010cd are green in both
suites (API 7/7 and browser 7/7 against the real deployment, rounds 3 and 4, 22:14 and 22:19 UTC). Last
step: the final deploy with the polish pass and small backend fixes (faster tutor voice, busy models shown
as busy), then one final QA round on it.

## Works end to end on the real stack
- Nine models, four Blackhole chips, all healthy (chip 0 vision co-host: HaMeR, Gaze-LLE, RF-DETR, VGGT,
  bit-identical to standalone; chip 1 Whisper + S2 Pro + Music 3; chip 2 gpt-oss-20b; chip 3 GR00T N1.7).
- Watch: video → skill (steps, the why, SOP, quiz, safety, robot program), lesson voiced by S2 Pro, 9 languages.
- Check: real footage 0.90 / 0.97 verified, AI-made 0.23 suspect (VGGT geometry).
- Teach: live capture with the coach asking why out loud after each step; Whisper transcribes the answer.
- Do: trainee practice with live feedback, tutor Q&A by voice, quality audit of a worker's run vs the expert.
- Robot: policy trained from 200 sim variations, 20/20 on the sample programs; GR00T N1.7 drives the sim.
- Earn: Skill Exchange sell → license → motion-only pack → royalty ledger; Reflex glove export.
- QA release rounds 3 and 4: API 7/7 + browser 7/7, twice in a row (evidence: ~/tacit-wt/qa/.orchestration/evidence/qa/RESULTS.md).
- Tests: backend 51/51, sim 37/37 (+2 live GR00T), web mock suites 23/23 on main.

## Fixed today from QA (all with regression tests)
QA-1..8 (restart recovery, program mismatch, speech priority, teardown, Studio re-runs, CPU priority);
QA-11 quiz could come out empty → validated, retried, filled in the background;
QA-12 listing page 500 for trained skills; QA-13 the writer could fold five repetitions into one step →
every observed step survives; QA-14 GR00T calls now show on the Box; quiz answers no longer always first.

## Team (headless Claude sessions, tmux `tacit-team`)
| card | owner | state |
|---|---|---|
| backend, deploy, integration | lead | running |
| liveperf: 5.8 → 10 fps live analysis (camera-capped), outputs identical | tacit-vision | merged |
| perception quality (vase P 1.00 R 0.83, jars P 0.80 R 0.80) | tacit-vision | merged |
| sim + policy + GR00T | tacit-sim | merged |
| web: landing, Studio, Skills, Audit, Box, Learn, Exchange, Robot Lab | tacit-web* | merged |
| polish: whole-app consistency, tour, performance, a11y | tacit-web | running |
| QA: release runs | tacit-qa | gate met on 27010cd; final round after the last deploy |
| showreel (first cut only) | tacit-showreel | running |

## Needs you
- Reflex: running its code here was blocked by the auto-mode safety check (external code). To drive a
  glove, start Reflex yourself (`MOCK=1 ./application/dev.sh`); Tacit finds it at :8000 (or REFLEX_URL).
- MotionSites is on the free plan (3 prompts used): https://motionsites.ai/unlimited
- The showreel is a first cut for your review; no final render without you.
- Optional: add user `jashan` to the `render` group for GPU rendering in the sim (system change, not done).

<!-- runtime:start -->
### Runtime (watchdog, 2026-10-27T22:23:55+00:00)

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
<!-- runtime:end -->
