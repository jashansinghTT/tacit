# QA results: the 7 E2E flows (SPEC section 9) on the real stack

Rewritten by `scripts/e2e/report.py` after every run. API: `tests/e2e` (pytest, httpx, websockets). UI: `web/e2e/flows.spec.ts` (Playwright, Chromium, fake camera and microphone).

- Last API run: none
- Last UI run: none
- Green in a row: API 0, UI 0 (merge gate: 2 and 2)

| # | Flow | API | UI | Key timings (API) | Evidence |
|---|---|---|---|---|---|
| 1 | Landing and navigation | not run | not run |  |  |
| 2 | Sample → process → ready skill | not run | not run |  |  |
| 3 | Live capture → coach → spoken answer | not run | not run |  |  |
| 4 | Learn: narration, practice, tutor | not run | not run |  |  |
| 5 | Robot Lab: train → evaluate → GR00T | not run | not run |  |  |
| 6 | Exchange: list → license → pack → earnings | not run | not run |  |  |
| 7 | Box: 9 models on 4 chips | not run | not run |  |  |

## History

| Run | Kind | Passed | Failed |
|---|---|---|---|
