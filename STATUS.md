# Tacit status

Updated: 2026-10-27 20:18 UTC by the lead (session tt-model-manager-4d)

**Open it:** http://127.0.0.1:8710 on this box (from a laptop: forward port 8710). Demo script: docs/DEMO.md.
**State:** most of the product works end to end on the real hardware. Merged and live: backend, vision
co-host, robot sim, landing, Studio, Skills, Verify, Audit, Box, and the whole Skill Exchange (sell →
license → pack → royalty passed twice on real data). In progress: Learn/Lesson/Team (working, polishing),
Robot Lab page, better step detection on real footage, QA's two clean runs, a showreel first cut.

## Works end to end on the real stack
- Nine models, four Blackhole chips, all healthy (chip 0 vision co-host: HaMeR, Gaze-LLE, RF-DETR, VGGT,
  bit-identical to standalone; chip 1 Whisper + S2 Pro + Music 3; chip 2 gpt-oss-20b; chip 3 GR00T N1.7).
- Video → skill in about real time for perception; gpt-oss-20b at 85 tokens/s (greedy); lesson in 9 languages.
- Check: real footage 0.90 / 0.97 verified, AI-made 0.24 suspect (VGGT).
- Live capture: the coach asks why out loud about 1 s after a step ends; Whisper transcribes the answer.
- Robot: policy trained from 200 sim variations (~1-3 min), 20/20 on the sample programs; GR00T drives the sim.
- Quality audit of a worker's run against the expert (new use case); Reflex glove export and virtual glove.
- Backend tests 20/20, sim tests 37/37, web smoke 12/12 and Exchange e2e green on the real stack.

## Recently fixed (from QA and the workers)
Restart recovery of jobs; the coach's voice no longer waits behind narration (one-slot speech gate,
transcription first); buyers see motion-only previews, never video frames; renames during processing
stick; train/evaluate use the same robot program; handedness from pose wrists (in review).

## Team (headless Claude sessions, tmux `tacit-team`)
| card | owner | state |
|---|---|---|
| backend, deploy, integration | lead | running |
| perception quality (vase P 1.00 R 0.83, jars P 0.67 R 0.80 so far) | tacit-vision | running |
| sim + policy + GR00T | tacit-sim | handoff in progress |
| web: landing, Studio, Skills, Audit, Box | tacit-web | running |
| web: Learn, Lesson, Team, Reflex glove | tacit-web-learn | running |
| web: Exchange | tacit-web-exchange | merged |
| web: Robot Lab | tacit-web-robot | running |
| QA: end-to-end suite | tacit-qa | running |
| showreel (first cut only) | tacit-showreel | running |

## Needs you
- Reflex: running its code here was blocked by the auto-mode safety check (external code). To drive a
  glove, start Reflex yourself (`MOCK=1 ./application/dev.sh`); Tacit finds it at :8000 (or REFLEX_URL).
- MotionSites is on the free plan (3 prompts used): https://motionsites.ai/unlimited
- The showreel is a first cut for your review; no final render without you.

<!-- runtime:start -->
### Runtime (watchdog, 2026-10-27T20:13:26+00:00)

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
