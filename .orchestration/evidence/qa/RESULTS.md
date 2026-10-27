# QA results: the 7 E2E flows (SPEC section 9) on the real stack

Rewritten by `scripts/e2e/report.py` after every run. API: `tests/e2e` (pytest, httpx, websockets). UI: `web/e2e/flows.spec.ts` (Playwright, Chromium, fake camera and microphone).

- Last API run: 20261027T215559Z-api (git b8ad59a)
- Last UI run: 20261027T215602Z-ui
- Green in a row: API 0, UI 0 (merge gate: 2 and 2)

| # | Flow | API | UI | Key timings (API) | Evidence |
|---|---|---|---|---|---|
| 1 | Landing and navigation | PASS, 0 s | PASS, 12 s | GET / 0.0 s; GET /some/deep/link (SPA fallback) 0.0 s; GET /api/users 0.0 s; GET /learn (SPA fallback) 0.0 s | [api](runs/20261027T215559Z-api/test_1_landing_and_navigation) [ui](runs/20261027T215602Z-ui) |
| 2 | Sample → process → ready skill | FAIL, 0 s | FAIL, 152 s | process (clip 44 s) 92.1 s; create skill from sample 0.0 s | [api](runs/20261027T215559Z-api/test_2_sample_process_ready) [ui](runs/20261027T215602Z-ui) |
| 3 | Live capture → coach → spoken answer | PASS, 64 s | PASS (slow), 160 s | analysis latency p50 (frame sent -> analysis back) 0.2 s; answer transcript after sending the voice answer 0.9 s; process the live capture 49.1 s; coach question text after the step closed 0.6 s | [api](runs/20261027T215559Z-api/test_3_live_capture_coach_and_answer) [ui](runs/20261027T215602Z-ui) |
| 4 | Learn: narration, practice, tutor | PASS (slow), 79 s | PASS (slow), 67 s | tutor (voice): first text 10.5 s SLOW; tutor (voice): question transcribed 10.0 s SLOW; tutor (text): first spoken sentence 22.6 s SLOW; tutor (voice): first spoken sentence 10.6 s SLOW | [api](runs/20261027T215559Z-api/test_4_learn_narration_practice_tutor) [ui](runs/20261027T215602Z-ui) |
| 5 | Robot Lab: train → evaluate → GR00T | PASS (slow), 415 s | PASS (slow), 360 s | train (200 demos, 30 epochs) 331.0 s SLOW; GR00T inference p50 (ms -> s) 0.2 s; evaluate (20 trials) 52.4 s; GR00T run: first camera frame 0.8 s | [api](runs/20261027T215559Z-api/test_5_robot_lab_train_evaluate_run) [ui](runs/20261027T215602Z-ui) |
| 6 | Exchange: list → license → pack → earnings | PASS, 2 s | PASS, 10 s | download pack.zip 1.6 s; license (robot_deploy) 0.0 s; publish listing 0.0 s; browse verified listings 0.0 s | [api](runs/20261027T215559Z-api/test_6_exchange_list_license_pack_earnings) [ui](runs/20261027T215602Z-ui) |
| 7 | Box: 9 models on 4 chips | PASS, 0 s | PASS, 3 s | GET /api/box 0.1 s | [api](runs/20261027T215559Z-api/test_7_box_nine_models_four_chips) [ui](runs/20261027T215602Z-ui) |

## Failures and flags in the last runs

- API F2: AssertionError: every quiz answer is choice 1: a trainee can pass by always picking it
- API F4 flag: slow: tutor (text): first spoken sentence took 22.6 s (limit 8 s)
- API F4 flag: slow: tutor (text): last sentence spoken (stream end) took 54.4 s (limit 45 s)
- API F4 flag: slow: tutor (voice): question transcribed took 10.0 s (limit 3 s)
- API F4 flag: slow: tutor (voice): first text took 10.5 s (limit 3 s)
- API F4 flag: slow: tutor (voice): first spoken sentence took 10.6 s (limit 8 s)
- API F5 flag: slow: train (200 demos, 30 epochs) took 331.0 s (limit 300 s)
- UI F2: Error: apiRequestContext.fetch: read ECONNRESET
- UI F3 flag: slow: answer transcribed (from end of speech) took 8.9 s (limit 5 s)
- UI F4 flag: slow: tutor text: answer spoken took 38.5 s (limit 15 s)
- UI F4 flag: slow: tutor voice: question transcribed took 10.2 s (limit 5 s)
- UI F5 flag: slow: train the policy (UI) took 310.0 s (limit 300 s)

## Notes from the last API run

- F2: skill sk_fdfd8f99 from sample smp_vase
- F2: verification verified score 0.90
- F3: capture video vase.mp4, 445 frames; answer wav 5.4 s
- F3: capture: {"analysis": 91, "events": 16, "steps": 2, "coach": 1, "coach_audio": 0, "transcript": 1, "errors": 0, "saved": {"type": "saved", "skill_id": "sk_8006f240", "job_id": "job_000860cc"}, "analysis_latency_s": {"n": 91, "p50": 0.22, "p90": 1.494}, "frames_sent": 138, "seconds": 14.3}
- F4: es step 1: Inserta el tallo en el jarrón a tu derecha.
- F4: practice: 53 feedback messages, best score 0.95, hints ['Hold the stem steady while inserting.', 'Keep the stem upright as you insert.', 'Maintain a consistent insertion depth.']
- F5: program: [{'op': 'pick', 'object': 'stem'}, {'op': 'place', 'target': 'vase'}]
- F5: evaluation: 100% over 20 trials; failures []
- F5: policy run: 322 states at 30.0 Hz, success True
- F5: GR00T run: 601 states, cameras {'exterior': {'n': 100, 'bytes': 8372}, 'wrist': {'n': 100, 'bytes': 8804}}, 38 queries, p50 220 ms, done {'type': 'done', 'success': False, 'steps': 600, 'reason': 'timed out during pick stem', 'seconds': 20.0, 'regrasps': 0, 'tasks_done': 0, 'gr00t': {'calls': 38, 'p50_ms': 220.4, 'max_ms': 433.5}}, timeout False
- F6: pack: 24.3 MB, 208 files
- F6: pack has policy: True, demonstrations: True
- F7: box: {'models': 9, 'healthy': 9, 'chips': 4}; {0: ('tacit-vision', 'ok', {'HaMeR': True, 'Gaze-LLE': True, 'RF-DETR': True, 'VGGT-1B': True}), 1: ('cohost-speech', 'ok', {'Whisper large-v3': True, 'S2 Pro': True, 'MiniMax Music 3': True}), 2: ('gpt-oss-20b-fast', 'ok', {'gpt-oss-20b': True}), 3: ('gr00t', 'ok', {'GR00T N1.7': True})}
- F7: speech queue: {'live_sessions': 0, 'listen': 0, 'interactive': 0, 'batch': 0, 'busy': False}
- F7: GR00T on the Box: 38 calls, p50 220.4 ms
- F7: no latency yet (no calls since start): ['MiniMax Music 3']

## Notes from the last UI run

- F3: coach asked: Why did you choose the right hand to pick up the vase? / 11.2 s / replay
- F3: capture timeline: / 0.5s q=0 voice_coming=0 answers=0 mic=- / 9.0s q=1 voice_coming=0 answers=0 mic=REC / 12.0s q=1 voice_coming=0 answers=1 mic=-
- F3: transcript: M / so I check them before I place them in the tray. / 24.0 s / Whisper 8766 ms
- F4: practice: score 3 MATCH; hint "Bring your hand up to where the part sits."
- F4: voice question heard as: you said / What should I check before I start this task?
- F5: evaluation shows 3/3 (100%)
- F5: GR00T latency panel: LAST 125 ms P50 189 ms ON CHIP 72.0 ms
- F6: listing lst_70be6c9c
- F6: pack: 208 files

## Extra checks (not SPEC 9 flows; reported, not gating)

| Check | UI | Note |
|---|---|---|
| X1 Guided tour (SPEC 8 demo mode) | PASS, 14 s |  |

## History

| Run | Kind | Passed | Failed |
|---|---|---|---|
| [20261027T215602Z-ui](runs/20261027T215602Z-ui/results.json) | ui | 6/7 | F2 |
| [20261027T215559Z-api](runs/20261027T215559Z-api/results.json) | api | 6/7 | F2 |
| [20261027T211440Z-ui](runs/20261027T211440Z-ui/results.json) | ui | 3/7 | F1, F2, F4, F5 |
| [20261027T210713Z-api](runs/20261027T210713Z-api/results.json) | api | 6/7 | F6 |
