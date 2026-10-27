# Tacit status

Updated: 2026-10-27 19:48 UTC by the lead (session tt-model-manager-4d)

**Open it:** http://127.0.0.1:8710 on this box (from a laptop: forward port 8710).
**State:** building in parallel. The backend, all nine models and the landing, Studio and Skill pages
run end to end on the real hardware; the Learn, Exchange and Robot Lab pages are being built now.

## What works end to end (verified on the real stack)
- Nine models on four Blackhole chips, all healthy: chip 0 vision co-host (HaMeR, Gaze-LLE, RF-DETR,
  VGGT; outputs bit-identical to the standalone packages), chip 1 speech co-host (Whisper, S2 Pro,
  Music 3), chip 2 gpt-oss-20b, chip 3 GR00T N1.7.
- Video → skill: a 49 s real clip is analysed at about real time (HaMeR 15 ms, Gaze-LLE 10 ms,
  RF-DETR 13 ms per frame), written up by gpt-oss-20b (greedy: 85 tokens/s), checked by VGGT, turned
  into a 3D twin, and narrated by S2 Pro.
- Check: VGGT tells real footage from AI-made: real clips score 0.90 and 0.97 (verified), the AI clip
  0.24 (suspect).
- Live capture with the spoken coach (question by voice, answer transcribed by Whisper): passed QA.
- Robot sim: policy trained from 200 simulated variations in about 1 minute, 20/20 trials succeed on
  the sample program; GR00T N1.7 drives the simulated Franka from rendered cameras.
- Reflex glove (the Hack the North project): skills export as Reflex movements and play on a Reflex
  backend through its API; a virtual glove is used when none is connected.
- Backend tests 13/13, sim tests 35/35.

## Team (headless Claude sessions in tmux `tacit-team`, independent of any laptop)
| card | owner | state |
|---|---|---|
| backend, deploy, integration | lead | running |
| vision co-host | tacit-vision | merged |
| perception quality on real footage | tacit-vision | running |
| sim + policy + GR00T | tacit-sim | running (assets merged) |
| web: landing, Studio, Skills, Box | tacit-web | running (merged once) |
| web: Learn, Lesson, Team, Reflex glove | tacit-web-learn | running |
| web: Exchange, Sell, Library, Earnings | tacit-web-exchange | running |
| web: Robot Lab | tacit-web-robot | running |
| QA: end-to-end suite | tacit-qa | running |

## Needs you
- Reflex: running its code on this box was blocked by the auto-mode safety check (external code).
  To drive a real or mock glove, start Reflex yourself (`MOCK=1 ./application/dev.sh` in its repo) and
  Tacit will find it at http://127.0.0.1:8000 (or set REFLEX_URL).
- MotionSites is on the free plan (3 prompts used). More prompts: https://motionsites.ai/unlimited

<!-- runtime:start -->
### Runtime (watchdog, 2026-10-27T19:52:57+00:00)

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

tmux sessions: drama3: 2 windows (created Mon Oct 19 07:45:00 2026); gptoss: 3 windows (created Tue Oct 13 04:19:04 2026); mm3: 1 windows (created Wed Sep  9 14:57:33 2026); tacit-heartbeat: 1 windows (created Tue Oct 27 19:10:18 2026); tacit-models: 1 windows (created Tue Oct 27 18:33:23 2026); tacit-team: 7 windows (created Tue Oct 27 18:42:05 2026)
<!-- runtime:end -->
