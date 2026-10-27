# Status: qa

State: running
Updated: 2026-10-27T19:40Z

## Works
- API E2E suite `tests/e2e/` (pytest + httpx + websockets, `uv run --project tests/e2e pytest tests/e2e`),
  one test per SPEC section 9 flow, timings with "a person would accept" limits, evidence per run under
  `.orchestration/evidence/qa/runs/<UTC>-api/`, `scripts/e2e/report.py` writes `RESULTS.md`.
- Flow 3 (live capture → coach question text + S2 Pro voice → spoken answer WAV → Whisper transcript →
  attached to a step's why after processing) PASSED on the real stack (dev run, sd_6898012 clip):
  coach text 1.3 s after the step closed, voice 7.7 s later, transcript 0.6 s, analysis p50 83 ms.
- Flow 7 (Box) PASSED: 9/9 healthy on 4 chips once the vision cohost came up.
- `scripts/e2e/make_media.sh` (y4m 640x360 15 fps + 16 kHz answer/question WAVs from S2 Pro).
- `scripts/e2e/playwright.config.ts` (Chromium fake camera/mic, JSON report into the run folder).

## Findings filed (record: `.orchestration/evidence/qa/FINDINGS.md`)
- QA-1 backend: a backend restart orphans running jobs; skill stuck in "processing" (told the lead).

## Blocked / waiting
- Flow 1 fails until the backend serves a built web app at `/` (currently `{"web": "not built yet"}`).
- `/api/samples` is empty (`~/tacit/data/samples/samples.json` missing), so flows 2, 4, 5, 6 run on an uploaded
  raw clip for now (`QA_UPLOAD_VIDEO`); a release run must use a sample.
- Browser flows wait for the web branches' pages.

## Decisions
- Findings go in my own evidence folder, not in other cards' worktrees: writing into another checkout is
  blocked by my sandbox. Owners get a SendMessage with the finding id.
- Slow steps are flagged in RESULTS.md, not failed; a flow fails on a wrong or missing result, or a model result
  that did not come from a TT chip.
- QA skills are titled "QA ..." (re-prefixed after processing, since the writer renames skills). Listings made by
  the Exchange flow cannot be removed (no unlist endpoint), so each run leaves one QA listing.

## Next
1. Finish the first full API run (flows 2, 4, 5, 6 on an uploaded clip), file findings.
2. Browser spec `web/e2e/flows.spec.ts` against a throwaway merge of the web branches.
