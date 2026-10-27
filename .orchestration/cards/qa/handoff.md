# Handoff: qa

DRAFT, finished when the merge gate is met.

## What the card delivers

- `tests/e2e/`: the API-level E2E suite, one test per SPEC section 9 flow, against the real stack (backend on
  127.0.0.1:8710, models on the four chips). pytest + httpx + websockets; `uv run --project tests/e2e pytest tests/e2e`.
- `web/e2e/flows.spec.ts`: the same seven flows in Chromium through the UI, plus `X1` (the guided tour, SPEC 8),
  with fake camera and microphone. `scripts/e2e/playwright.config.ts` and `scripts/e2e/ui.sh` run it.
- `scripts/e2e/make_media.sh`: rebuilds `~/tacit/data/e2e/` (capture/practice `.y4m` 640x360 at 15 fps from the
  first real sample; `answer.wav` and `question.wav` spoken by S2 Pro, with the text next to them).
- `scripts/e2e/report.py`: turns the run folders into `.orchestration/evidence/qa/RESULTS.md` (flow table, timings,
  failures and flags, history, consecutive green runs). `scripts/e2e/teardown.py`: removes a browser run's data.
- `.orchestration/evidence/qa/FINDINGS.md`: every finding QA filed, with owner, state, repro and evidence.

## How to run it (lead)

```bash
cd ~/tacit                                    # after merging work/qa
uv run --project tests/e2e pytest tests/e2e   # API, ~15 to 20 min, writes runs/<UTC>-api/
scripts/e2e/make_media.sh                     # once, or when the samples change
QA_WEB_URL=http://127.0.0.1:8710 scripts/e2e/ui.sh --no-merge --no-build   # browser against the deployed app
scripts/e2e/ui.sh                             # browser against main + the open web branches (local merge)
python3 scripts/e2e/report.py                 # RESULTS.md (both runners call it)
```

## Notes

- Timings carry a limit for what a person would accept; a slower step is flagged in RESULTS.md, not failed.
  Measured on a busy development box; see QA-5 and QA-7.
- Test data: QA skills are titled "QA ..." (test skills, hidden unless include_test=1); each run deletes its
  listings (with licenses and ledger entries) and, when it passed, its skills.
- `ui.sh` keeps a throwaway checkout at `~/tacit-wt/qa-ui` (local branch `qa/ui-merge`); safe to delete.
