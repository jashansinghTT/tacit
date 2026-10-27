# QA results: the 7 E2E flows (SPEC section 9) on the real stack

Rewritten by `scripts/e2e/report.py` after every run. API: `tests/e2e` (pytest, httpx, websockets). UI: `web/e2e/flows.spec.ts` (Playwright, Chromium, fake camera and microphone).

- Last API run: 20261027T210713Z-api (git abedc21)
- Last UI run: 20261027T211440Z-ui
- Green in a row: API 0, UI 0 (merge gate: 2 and 2)

| # | Flow | API | UI | Key timings (API) | Evidence |
|---|---|---|---|---|---|
| 1 | Landing and navigation | PASS, 0 s | FAIL, 37 s | GET /exchange (SPA fallback) 0.0 s; GET /api/skills 0.0 s; GET / 0.0 s; GET /robot (SPA fallback) 0.0 s | [api](runs/20261027T210713Z-api/test_1_landing_and_navigation) [ui](runs/20261027T211440Z-ui) |
| 2 | Sample → process → ready skill | PASS (slow), 130 s | FAIL, 238 s | process (clip 44 s) 312.9 s SLOW; all narration voiced (after ready) 130.1 s SLOW; create skill from sample 0.0 s; GET tracks 0.0 s | [api](runs/20261027T210713Z-api/test_2_sample_process_ready) [ui](runs/20261027T211440Z-ui) |
| 3 | Live capture → coach → spoken answer | PASS (slow), 87 s | PASS (slow), 191 s | answer transcript after sending the voice answer 7.4 s SLOW; analysis latency p50 (frame sent -> analysis back) 0.2 s; process the live capture 58.1 s; saved after stop 2.0 s | [api](runs/20261027T210713Z-api/test_3_live_capture_coach_and_answer) [ui](runs/20261027T211440Z-ui) |
| 4 | Learn: narration, practice, tutor | PASS (slow), 138 s | FAIL (slow), 61 s | tutor (text): first spoken sentence 27.3 s SLOW; tutor (voice): first text 9.1 s SLOW; tutor (voice): question transcribed 8.5 s SLOW; tutor (text): last sentence spoken (stream end) 78.1 s SLOW | [api](runs/20261027T210713Z-api/test_4_learn_narration_practice_tutor) [ui](runs/20261027T211440Z-ui) |
| 5 | Robot Lab: train → evaluate → GR00T | PASS, 86 s | FAIL, 1201 s | GR00T inference p50 (ms -> s) 0.1 s; train (200 demos, 30 epochs) 51.1 s; GR00T run: first camera frame 1.3 s; evaluate (20 trials) 4.0 s | [api](runs/20261027T210713Z-api/test_5_robot_lab_train_evaluate_run) [ui](runs/20261027T211440Z-ui) |
| 6 | Exchange: list → license → pack → earnings | FAIL, 0 s | PASS, 7 s | publish listing 0.0 s; browse verified listings 0.0 s; open listing 0.0 s | [api](runs/20261027T210713Z-api/test_6_exchange_list_license_pack_earnings) [ui](runs/20261027T211440Z-ui) |
| 7 | Box: 9 models on 4 chips | PASS, 0 s | PASS, 3 s | GET /api/box 0.0 s | [api](runs/20261027T210713Z-api/test_7_box_nine_models_four_chips) [ui](runs/20261027T211440Z-ui) |

## Failures and flags in the last runs

- API F2 flag: slow: process (clip 44 s) took 312.9 s (limit 180 s)
- API F2 flag: slow: all narration voiced (after ready) took 130.1 s (limit 120 s)
- API F3 flag: slow: answer transcript after sending the voice answer took 7.4 s (limit 3 s)
- API F4 flag: slow: tutor (text): first spoken sentence took 27.3 s (limit 8 s)
- API F4 flag: slow: tutor (text): last sentence spoken (stream end) took 78.1 s (limit 45 s)
- API F4 flag: slow: tutor (voice): question transcribed took 8.5 s (limit 3 s)
- API F4 flag: slow: tutor (voice): first text took 9.1 s (limit 3 s)
- API F4 flag: slow: tutor (voice): first spoken sentence took 9.2 s (limit 8 s)
- API F4 flag: slow: tutor (voice): last sentence spoken (stream end) took 45.7 s (limit 45 s)
- API F6: json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)
- UI F1: Error: tour stop 3 has no lesson-player on http://127.0.0.1:5790/learn/sk_3b7c613d
- UI F2: Error: steps shown
- UI F3 flag: answer transcribed (from end of speech) slow
- UI F4: Error: heard "transcribing on chip 1…"
- UI F4 flag: tutor text: answer spoken slow
- UI F5: Test timeout of 1200000ms exceeded.

## Notes from the last API run

- F2: skill sk_bcba9454 from sample smp_vase
- F2: verification verified score 0.90
- F2: 445 analysed frames, 430 with hands
- F2: sample smp_vase (real): verified 0.90
- F2: sample smp_jars (real): verified 0.97
- F2: sample smp_fake (ai-generated): suspect 0.23
- F3: capture video vase.mp4, 445 frames; answer wav 5.4 s
- F3: capture: {"analysis": 129, "events": 26, "steps": 2, "coach": 1, "coach_audio": 0, "transcript": 1, "errors": 0, "saved": {"type": "saved", "skill_id": "sk_f4f1c3f9", "job_id": "job_0b0284f1"}, "analysis_latency_s": {"n": 129, "p50": 0.217, "p90": 0.384}, "frames_sent": 219, "seconds": 24.3}
- F4: es step 1: Empuja el objeto que tienes en la mano derecha dentro del jarrón a tu derecha.
- F4: practice: 48 feedback messages, best score 0.95, hints ['Align with previous item', 'Center the item for balance', 'Check height consistency']
- F5: program: [{'op': 'pick', 'object': 'part'}, {'op': 'place', 'target': 'vase'}]
- F5: evaluation: 100% over 20 trials; failures []
- F5: policy run: 322 states at 30.1 Hz, success True
- F5: GR00T run: 601 states, cameras {'exterior': {'n': 100, 'bytes': 8300}, 'wrist': {'n': 100, 'bytes': 7584}}, 34 queries, p50 113 ms, done {'type': 'done', 'success': False, 'steps': 600, 'reason': 'timed out during pick part', 'seconds': 20.0, 'regrasps': 0, 'tasks_done': 0, 'gr00t': {'calls': 34, 'p50_ms': 113.2, 'max_ms': 910.6}}, timeout False
- F7: box: {'models': 9, 'healthy': 9, 'chips': 4}; {0: ('tacit-vision', 'ok', {'HaMeR': True, 'Gaze-LLE': True, 'RF-DETR': True, 'VGGT-1B': True}), 1: ('cohost-speech', 'ok', {'Whisper large-v3': True, 'S2 Pro': True, 'MiniMax Music 3': True}), 2: ('gpt-oss-20b-fast', 'ok', {'gpt-oss-20b': True}), 3: ('gr00t', 'ok', {'GR00T N1.7': True})}
- F7: speech queue: {'listen': 1, 'interactive': 1, 'batch': 1, 'busy': True}
- F7: no latency yet (no calls since start): ['MiniMax Music 3', 'GR00T N1.7']

## Notes from the last UI run

- F2: processing took 237 s
- F3: coach asked: Why did you choose the right hand to pick up the vase?
11.2 s
replay
- F3: capture timeline:
0.5s q=0 voice_coming=0 answers=0 mic=-
9.0s q=1 voice_coming=0 answers=0 mic=-
15.6s q=1 voice_coming=0 answers=0 mic=REC
21.1s q=1 voice_coming=0 answers=1 mic=-
25.6s q=2 voice_coming=1 answers=1 mic=-
35.6s q=3 voice_coming=2 answers=1 mic=-
- F3: transcript: M
because the parts on the left are already sorted, so I check them before I place them in the tray.
42.7 s
Whisper 18462 ms
- F4: practice: score 32 MATCH; hint "Bring your hand up to where the part sits."
- F4: voice question heard as: transcribing on chip 1…
- F6: listing lst_dcab9eed
- F6: pack: 208 files

## History

| Run | Kind | Passed | Failed |
|---|---|---|---|
| [20261027T211440Z-ui](runs/20261027T211440Z-ui/results.json) | ui | 3/7 | F1, F2, F4, F5 |
| [20261027T210713Z-api](runs/20261027T210713Z-api/results.json) | api | 6/7 | F6 |
