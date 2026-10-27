# Status: qa

State: running (release runs during the lead's deploy freeze, 21:05 to 22:35Z)
Updated: 2026-10-27T21:20Z

## Works
- API suite `tests/e2e/` and browser suite `web/e2e/flows.spec.ts` cover all 7 SPEC 9 flows on the real stack,
  with timings, evidence per run, `RESULTS.md` (via `scripts/e2e/report.py`) and teardown of what each run makes
  (listings with their licenses and ledger entries always; skills when the run passed).
- Browser runs use a local merge of main + work/web, web-learn, web-exchange, web-robot (`scripts/e2e/ui.sh`,
  `~/tacit-wt/qa-ui`, vite preview on :5790 proxied to 8710); web-robot is not on main yet.
- Seen passing on the real stack (dev runs): API F1, F3, F7; browser F1 (incl. the guided tour), F3, F6, F7.

## Release runs
- API #1 `20261027T210713Z-api` and UI #1 `20261027T211440Z-ui` running.

## Findings (record: `.orchestration/evidence/qa/FINDINGS.md`)
- Fixed: QA-1 (jobs after restart), QA-2 (train/evaluate program), QA-3 (TTS priority), QA-4 (policy after
  restart), QA-6 (teardown endpoints), QA-8 (Studio follows re-run jobs). Mitigated: QA-5 (training under load),
  QA-7 (S2 Pro CPU priority).
- Open: QA-9 web (hands-free answering never arms while the coach's voice is slow; sent to web-1e); STT still
  7 to 13 s behind the S2 Pro request in flight (told the lead). Watch item: one live capture closed no step in 2 min.

## Next
Two consecutive green release runs (API and UI), then handoff.
