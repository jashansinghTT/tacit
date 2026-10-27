# QA results: the 7 E2E flows (SPEC section 9) on the real stack

Rewritten by `scripts/e2e/report.py` after every run. API: `tests/e2e` (pytest, httpx, websockets). UI: `web/e2e/flows.spec.ts` (Playwright, Chromium, fake camera and microphone).

- Last API run: 20261027T221939Z-api (git 42fc5e8)
- Last UI run: 20261027T221941Z-ui
- Green in a row: API 2, UI 2 (merge gate: 2 and 2)

| # | Flow | API | UI | Key timings (API) | Evidence |
|---|---|---|---|---|---|
| 1 | Landing and navigation | PASS, 0 s | PASS, 8 s | GET / 0.0 s; GET /studio (SPA fallback) 0.0 s; GET /robot (SPA fallback) 0.0 s; GET /api/users 0.0 s | [api](runs/20261027T221939Z-api/test_1_landing_and_navigation) [ui](runs/20261027T221941Z-ui) |
| 2 | Sample → process → ready skill | PASS, 0 s | PASS, 98 s | process (clip 44 s) 65.7 s; create skill from sample 0.0 s; GET tracks 0.0 s; GET twin 0.0 s | [api](runs/20261027T221939Z-api/test_2_sample_process_ready) [ui](runs/20261027T221941Z-ui) |
| 3 | Live capture → coach → spoken answer | PASS, 56 s | PASS, 147 s | coach question voice after the text 8.1 s; saved after stop 3.5 s; analysis latency p50 (frame sent -> analysis back) 0.1 s; answer transcript after sending the voice answer 0.6 s | [api](runs/20261027T221939Z-api/test_3_live_capture_coach_and_answer) [ui](runs/20261027T221941Z-ui) |
| 4 | Learn: narration, practice, tutor | PASS (slow), 69 s | PASS (slow), 42 s | tutor (voice): first text 6.0 s SLOW; tutor (voice): question transcribed 5.5 s SLOW; tutor (text): last sentence spoken (stream end) 39.8 s; tutor (voice): first spoken sentence 6.1 s | [api](runs/20261027T221939Z-api/test_4_learn_narration_practice_tutor) [ui](runs/20261027T221941Z-ui) |
| 5 | Robot Lab: train → evaluate → GR00T | PASS, 106 s | PASS, 80 s | train (200 demos, 30 epochs) 70.6 s; GR00T inference p50 (ms -> s) 0.1 s; GR00T run: first camera frame 0.2 s; evaluate (20 trials) 4.0 s | [api](runs/20261027T221939Z-api/test_5_robot_lab_train_evaluate_run) [ui](runs/20261027T221941Z-ui) |
| 6 | Exchange: list → license → pack → earnings | PASS, 1 s | PASS, 7 s | download pack.zip 0.7 s; earnings 0.0 s; publish listing 0.0 s; browse verified listings 0.0 s | [api](runs/20261027T221939Z-api/test_6_exchange_list_license_pack_earnings) [ui](runs/20261027T221941Z-ui) |
| 7 | Box: 9 models on 4 chips | PASS, 0 s | PASS, 3 s | GET /api/box 0.0 s | [api](runs/20261027T221939Z-api/test_7_box_nine_models_four_chips) [ui](runs/20261027T221941Z-ui) |

## Failures and flags in the last runs

- API F4 flag: slow: tutor (voice): question transcribed took 5.5 s (limit 3 s)
- API F4 flag: slow: tutor (voice): first text took 6.0 s (limit 3 s)
- UI F4 flag: slow: tutor voice: question transcribed took 12.9 s (limit 5 s)

## Notes from the last API run

- F2: skill sk_79aeac4d from sample smp_vase
- F2: verification verified score 0.90
- F2: quiz answer indexes: this skill [1, 1, 1]; 51 questions on the box
- F2: served from the cache of earlier TT results: ['S2 Pro']
- F2: 445 analysed frames, 430 with hands
- F2: sample smp_vase (real): verified 0.90
- F2: sample smp_jars (real): verified 0.97
- F2: sample smp_fake (ai-generated): suspect 0.23
- F3: capture video vase.mp4, 445 frames; answer wav 5.4 s
- F3: capture: {"analysis": 173, "events": 29, "steps": 3, "coach": 2, "coach_audio": 1, "transcript": 1, "errors": 0, "saved": {"type": "saved", "skill_id": "sk_30aa1c5f", "job_id": "job_0d574bdc"}, "analysis_latency_s": {"n": 173, "p50": 0.121, "p90": 0.554}, "frames_sent": 204, "seconds": 24.0}
- F4: es step 1: Inserta el tallo en el jarrón a tu derecha.
- F4: practice: 28 feedback messages, best score 0.95, hints ['Hold the stem steady while inserting.', 'Move your hand to your right, toward the work area.']
- F5: program: [{'op': 'pick', 'object': 'stem'}, {'op': 'place', 'target': 'vase'}]
- F5: evaluation: 100% over 20 trials; failures []
- F5: policy run: 322 states at 30.1 Hz, success True
- F5: GR00T run: 601 states, cameras {'exterior': {'n': 100, 'bytes': 8984}, 'wrist': {'n': 100, 'bytes': 7264}}, 38 queries, p50 76 ms, done {'type': 'done', 'success': False, 'steps': 600, 'reason': 'timed out during pick stem', 'seconds': 20.0, 'regrasps': 0, 'tasks_done': 0, 'gr00t': {'calls': 38, 'p50_ms': 76.5, 'max_ms': 263.7}}, timeout False
- F6: pack: 24.3 MB, 208 files
- F6: pack has policy: True, demonstrations: True
- F7: box: {'models': 9, 'healthy': 9, 'chips': 4}; {0: ('tacit-vision', 'ok', {'HaMeR': True, 'Gaze-LLE': True, 'RF-DETR': True, 'VGGT-1B': True}), 1: ('cohost-speech', 'ok', {'Whisper large-v3': True, 'S2 Pro': True, 'MiniMax Music 3': True}), 2: ('gpt-oss-20b-fast', 'ok', {'gpt-oss-20b': True}), 3: ('gr00t', 'ok', {'GR00T N1.7': True})}
- F7: speech queue: {'live_sessions': 0, 'listen': 0, 'interactive': 0, 'batch': 0, 'busy': False}
- F7: GR00T on the Box: 155 calls, p50 100.0 ms
- F7: no latency yet (no calls since start): ['MiniMax Music 3']

## Notes from the last UI run

- F2: processing took 96 s
- F2: skill sk_0dd23ae7: 5 steps, verification verified 0.901
- F3: coach asked: Why did you choose the right hand to pick up the vase? / 11.3 s / replay
- F3: capture timeline: / 0.5s q=0 voice_coming=0 answers=0 mic=- / 9.5s q=1 voice_coming=0 answers=0 mic=REC / 12.0s q=1 voice_coming=0 answers=1 mic=-
- F3: transcript: check them before I place them in the tray. (50% of the answer; the fake mic loops)
- F4: practice: score 2 MATCH; hint "Bring your hand up to where the part sits."
- F4: voice question heard as: What should I check before I start this task?
- F5: evaluation shows 9/9 (100%)
- F5: GR00T latency panel: LAST 82.1 ms P50 112 ms ON CHIP 58.5 ms
- F6: listing lst_0b0fcdcf
- F6: pack: 208 files

## Extra checks (not SPEC 9 flows; reported, not gating)

| Check | UI | Note |
|---|---|---|
| X1 Guided tour (SPEC 8 demo mode) | PASS, 7 s |  |

## History

| Run | Kind | Passed | Failed |
|---|---|---|---|
| [20261027T221941Z-ui](runs/20261027T221941Z-ui/results.json) | ui | 7/7 | none |
| [20261027T221939Z-api](runs/20261027T221939Z-api/results.json) | api | 7/7 | none |
| [20261027T221420Z-ui](runs/20261027T221420Z-ui/results.json) | ui | 7/7 | none |
| [20261027T221417Z-api](runs/20261027T221417Z-api/results.json) | api | 7/7 | none |
| 20261027T220922Z-ui | ui | aborted | Stopped by QA at 22:16Z after F3 and F4 failed on test-side transcript checks (the looping fake microphone was caught mid-sentence; a new 'waiting for the voice |
| 20261027T220919Z-api | api | aborted | Stopped by QA at 22:14Z after F2 failed on a test-side check (S2 Pro narration served from the TT cache, which the check did not allow; fixed in 28fd7b4). F1 pa |
| [20261027T215602Z-ui](runs/20261027T215602Z-ui/results.json) | ui | 6/7 | F2 |
| [20261027T215559Z-api](runs/20261027T215559Z-api/results.json) | api | 6/7 | F2 |
| [20261027T211440Z-ui](runs/20261027T211440Z-ui/results.json) | ui | 3/7 | F1, F2, F4, F5 |
| [20261027T210713Z-api](runs/20261027T210713Z-api/results.json) | api | 6/7 | F6 |
