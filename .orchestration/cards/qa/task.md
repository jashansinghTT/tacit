# Card `qa`: the end-to-end suite on the real stack, and the fix loop

Owner: `tacit-qa`. Worktree `~/tacit-wt/qa`, branch `work/qa` (from `main`). Read first:
`docs/SPEC.md` (section 9 lists the 7 E2E tests), `docs/API.md`, `.orchestration/LEAD.md`, the board.

## Goal
Prove every flow works on the real stack (backend on 127.0.0.1:8710 under systemd, nine models live
on the four chips), find what does not, and get it fixed by its owner.

1. **API-level E2E now** (`tests/e2e/test_flows.py`, pytest + httpx against 8710, real models): for each
   of the 7 flows in SPEC section 9, the API version: sample → process → ready skill (≥3 steps,
   verification, SOP, narration); live capture over `WS /ws/capture/{id}` driven by frames from a
   sample video plus a spoken answer (generate the WAV with `POST /api/speech/tts`, then send it as the
   answer: the transcript must come back); learn session over `WS /ws/learn/{id}` with feedback
   messages; tutor SSE with text and audio events; Robot Lab train → evaluate (≥80% over 20 trials)
   → policy run and GR00T run over `WS /ws/robot/{id}`; Exchange list → license → pack.zip (no video
   inside) → earnings; Box shows 9 healthy models on 4 chips. Time each step; flag anything slower
   than a person would accept.
2. **Fake media** for the browser tests: from the samples in `~/tacit/data/samples/` (being prepared
   now) make `.y4m` camera files (640×360, 15 fps) and a `.wav` answer, under
   `~/tacit/data/e2e/` (gitignored), with a script `scripts/e2e/make_media.sh` that rebuilds them.
3. **Browser E2E** (Playwright, Chromium, `web/e2e/flows.spec.ts` in your branch): the same 7 flows
   through the UI once pages land on the web branches (`work/web`, `work/web-learn`,
   `work/web-exchange`, `work/web-robot`; merge them locally into a throwaway branch to test, never
   push their code), with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream
   --use-file-for-fake-video-capture=<y4m> --use-file-for-fake-audio-capture=<wav>`. Screenshots on
   failure.
4. **Fix loop**: every failure goes to its owner with evidence: append to their card's
   `.orchestration/cards/<card>/status.md` under "QA findings" (in their worktree) and send a short
   SendMessage (ListAgents names: web-*, sim-*, vision-*; the lead is `tt-model-manager-4d` and owns
   the backend). Re-run when they say it is fixed. Keep `.orchestration/evidence/qa/RESULTS.md` (a
   table: flow, API result, UI result, timings, last run, link to evidence) current.

## Rules
- Do not change product code; you own `tests/e2e/**`, `web/e2e/flows.spec.ts`, `scripts/e2e/**`,
  `.orchestration/evidence/qa/**`. The stack is shared and real: do not stop or restart models
  (tell the lead), do not delete skills you did not create (prefix yours' titles with "QA ").
- Commits on `work/qa`, no AI attribution. Keep `status.md` current.

## Merge gate
All 7 flows green at the API level and in the browser, twice in a row, with RESULTS.md and evidence.
