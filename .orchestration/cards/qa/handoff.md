# Handoff: qa

## Result

The seven E2E flows of SPEC section 9 pass on the real stack, at the API level and in the browser, two rounds
in a row on release candidate 27010cd (deployed 2026-10-27 21:49:50Z, under the lead's deploy freeze):

| Round | API (pytest) | Browser (Playwright, against :8710) |
|---|---|---|
| 3 | `runs/20261027T221417Z-api`: 7/7, 5.1 min | `runs/20261027T221420Z-ui`: 7/7 + X1 tour, 3.8 min |
| 4 | `runs/20261027T221939Z-api`: 7/7, 5.0 min | `runs/20261027T221941Z-ui`: 7/7 + X1 tour, 3.9 min |

Confirmation round on the final build (main a56321c, deployed 22:32:55Z): API `runs/20261027T223818Z-api` 7/7
(8.1 min), browser `runs/20261027T223821Z-ui` 7/7 + X1 (6.3 min). That makes three green rounds in a row in both
suites.

Tutor latency on an idle speech chip, questions the tutor had not seen before (`runs/solo-f4-20261027T224830Z/`,
`scripts/e2e/tutor_probe.py`): the text answer is on screen in 0.75 s (by voice: transcribed 0.6 s, text 1.2 s).
The first spoken clause comes at 16 to 19 s and the last at 37 to 47 s, because S2 Pro ran at a real-time
factor of about 3.7 under the box's load from other work (2.4 on a quiet host). That is the main latency to
mention in a demo. With the same question asked twice, the second answer is spoken almost at once from the
TTS cache (0.9 s).

Details, timings and history: `.orchestration/evidence/qa/RESULTS.md`. Every finding QA filed (15, with owner,
state, repro and evidence): `.orchestration/evidence/qa/FINDINGS.md`.

## What the card delivers

- `tests/e2e/`: the API-level suite, one test per flow (pytest + httpx + websockets, own `uv` project).
  F2 sample → ready skill (steps, verification, SOP, quiz, narration, twin, point cloud; real vs AI-made
  sample verdicts), F3 live capture over `WS /ws/capture` (coach question with S2 Pro voice, a spoken answer
  made with `POST /api/speech/tts`, Whisper transcript attached to a step), F4 lesson narration, practice over
  `WS /ws/learn`, tutor SSE by text and voice, the Spanish lesson, quiz and certificate, manager progress,
  F5 train → evaluate (>= 80% over 20) → policy and GR00T runs over `WS /ws/robot`, F6 list → license → pack
  (no video) → library → earnings, F7 nine healthy models on four chips (GR00T calls counted).
- `web/e2e/flows.spec.ts`: the same flows through the UI in Chromium with fake camera and microphone, plus
  `X1`, the guided tour (SPEC 8), reported but not gating.
- `scripts/e2e/`: `ui.sh` (browser runner; against :8710 or a local merge of the web branches),
  `playwright.config.ts`, `make_media.sh` (fake `.y4m` camera files and spoken `.wav` answers in
  `~/tacit/data/e2e`), `report.py` (RESULTS.md), `teardown.py`.
- Every timed step has a limit for what a person would accept; slower steps are flagged, not failed.

## How to run it

```bash
cd ~/tacit                                    # once work/qa is merged
uv run --project tests/e2e pytest tests/e2e   # API, ~5 min; evidence in .orchestration/evidence/qa/runs/<UTC>-api/
scripts/e2e/make_media.sh                     # once, or when the samples change
QA_WEB_URL=http://127.0.0.1:8710 scripts/e2e/ui.sh --no-merge --no-build   # browser against the deployed app
scripts/e2e/ui.sh                             # browser against main + the open web branches (local merge)
```

Both runners rewrite RESULTS.md. `tests/e2e/README.md` has the details and the iteration knobs.

## Things to know

- Test data: skills are titled "QA ..." (test skills, hidden unless `include_test=1`). Each run deletes its
  listings (with licenses and ledger entries) and, when it passed, its skills. QA runs leave the demo's earnings
  and library untouched.
- Timings in RESULTS.md were measured while several workers tested at once on this box (load 30 to 50 on 16
  cores, plus headless Chromium rendering 3D in software). S2 Pro is the slowest link: tutor speech and
  transcripts were flagged slow in some rounds; see QA-3, QA-5 and QA-7. A solo run on a quiet box is the demo case.
- The browser suite runs from `~/tacit-wt/qa-ui` (a throwaway checkout on local branch `qa/ui-merge`, never
  pushed) because it needs the web app's `node_modules`; `ui.sh` creates it when missing.
- Chromium's fake microphone loops its file, so the browser checks accept a transcript of any part of the
  spoken answer (all heard words must have been said); the API suite checks the full sentence.

## Findings at handoff

- Fixed and verified on the stack: QA-1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 13, 14.
- Mitigated: QA-5 (training under CPU load: 2 torch threads, nice 10), QA-7 (S2 Pro CPU priority).
- QA-15 (tutor declining a basic question): fixed in 6585afc; F4 now fails on a decline.
