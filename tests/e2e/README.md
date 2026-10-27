# E2E suite (API level)

The seven flows of SPEC section 9, driven through the backend's HTTP and WebSocket API on the real
stack (backend on 127.0.0.1:8710, models on the four chips). The browser version of the same flows is
`web/e2e/flows.spec.ts`.

```bash
uv run --project tests/e2e pytest tests/e2e            # all seven flows, about 10 minutes
uv run --project tests/e2e pytest tests/e2e -k test_7  # one flow
python3 scripts/e2e/report.py                          # rewrite RESULTS.md (pytest does this at the end)
```

Each run writes `.orchestration/evidence/qa/runs/<UTC>-api/`: `results.json` (outcome, timings, flags,
notes per flow) and a folder per test with the job snapshots, WebSocket logs, skill JSON and pack
listing it saw. `scripts/e2e/report.py` turns the runs into `.orchestration/evidence/qa/RESULTS.md`.

Every timed step has a limit for what a person would accept; a slower step is flagged in RESULTS.md,
not failed. A flow fails when its result is wrong or missing, or when a model result did not come
from a Tenstorrent chip.

What each flow does:

| # | Flow | Through |
|---|---|---|
| 1 | Landing and navigation | `/` and SPA routes serve the built app; personas, samples, skills, listings load |
| 2 | Sample → ready skill | `POST /api/skills` (sample) → `POST /process` → job stages all done on TT models; ≥3 steps, verified, SOP, quiz, narration, tracks, twin, point cloud |
| 3 | Live capture | `WS /ws/capture/{id}` with sample frames at 10 fps; coach question (text, then S2 Pro voice); answer WAV made with `POST /api/speech/tts`; transcript; stop → processed; answer attached to a step's why |
| 4 | Learn | lesson narration WAVs; `WS /ws/learn/{id}` with the expert's step-1 frames → score and hint; tutor SSE by text and by voice (transcript, deltas, audio); quiz → certificate; manager progress |
| 5 | Robot Lab | train (200 demos, 30 epochs) → evaluate (≥80% over 20 trials) → policy run and GR00T run over `WS /ws/robot/{id}` (state, both cameras, GR00T timings) |
| 6 | Exchange | list (consent) → license as Atlas → library → `pack.zip` (no video) → expert earnings +349.30 |
| 7 | Box | 9 models healthy on 4 chips, cohost memory |

Skills the suite creates are titled `QA …`. Environment knobs (iteration only; a release run uses none):
`TACIT_URL`, `QA_SAMPLE`, `QA_SKILL_ID` (reuse a processed skill), `QA_UPLOAD_VIDEO` (process an upload
instead of a sample), `QA_CAPTURE_VIDEO`, `QA_CAPTURE_SECONDS`, `QA_DEMOS`, `QA_EPOCHS`, `QA_RUN_ID`,
`QA_NO_REPORT`.
