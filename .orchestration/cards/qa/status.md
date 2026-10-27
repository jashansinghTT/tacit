# Status: qa

State: running
Updated: 2026-10-27T20:10Z

## Works
- API suite `tests/e2e/` (one test per SPEC 9 flow; timings with "a person would accept" limits; evidence per
  run in `.orchestration/evidence/qa/runs/<UTC>-api/`; `scripts/e2e/report.py` writes `RESULTS.md`).
  Follows the lead's conventions: "QA " titles (test skills, hidden unless include_test=1), background
  narration (polled, flagged if > 2 min), interrupted jobs followed to their re-run (flagged).
- Browser suite `web/e2e/flows.spec.ts` + `scripts/e2e/playwright.config.ts` + `scripts/e2e/ui.sh` (merges
  work/web, web-learn, web-exchange, web-robot into a local throwaway `qa/ui-merge` at `~/tacit-wt/qa-ui`, builds,
  serves on :5790 proxied to 8710, Chromium with fake camera/mic from `~/tacit/data/e2e`). All 7 flows written
  against the real test ids; F1 and F7 pass in the browser.
- `scripts/e2e/make_media.sh`: capture/practice y4m (640x360, 15 fps) from smp_vase, answer/question WAVs (S2 Pro).
- Seen passing on the real stack in dev runs: API F1, F3 (live capture: coach text 0.8 to 1.3 s after the step
  closes, transcript, answer attached to a step), F7; UI F1, F7.

## Findings (record: `.orchestration/evidence/qa/FINDINGS.md`)
- QA-1 backend: restart orphaned running jobs. Fixed by the lead (re-run on startup); seen working.
- QA-2 sim: BC policy 0/20 on a two-object program (19/20 on one object). Sent to sim-c4. Open.
- QA-3 backend/speech: interactive TTS queued minutes behind narration, 120 s timeouts. Fixed by the lead
  (one S2 Pro slot, interactive first); verifying. Related: STT waits behind S2 Pro on chip 1 (transcript
  50.6 s before the fix); asked the lead to give STT the same priority.

## Blockers
- The backend restarts often while the lead merges (3 of my last 4 runs were interrupted). Asked the lead for a
  deploy-free window for the two consecutive release runs.

## Next
1. Full API run dev-iter4, then the full browser run; file what fails.
2. Two consecutive green timestamped runs, API and UI; RESULTS.md; handoff.
