# Status: qa

State: running (merge gate met on RC 27010cd; one confirmation round on the final build after the lead's ~23:00Z deploy)
Updated: 2026-10-27T22:35Z

## Merge gate
- Met on RC 27010cd (deployed 21:49:50Z, deploy freeze in force): two consecutive green rounds in both suites.
  - Round 3: API `20261027T221417Z-api` 7/7, browser `20261027T221420Z-ui` 7/7 + X1 (guided tour).
  - Round 4: API `20261027T221939Z-api` 7/7, browser `20261027T221941Z-ui` 7/7 + X1.
  - `RESULTS.md`: API streak 2, UI streak 2. Browser runs went straight against :8710 (main has every web branch).
- Earlier runs on this RC failed only on test-side checks, all fixed (quiz-index check, keep-alive reset,
  cached TT narration, looping fake microphone, a new transcript placeholder); listed in RESULTS history.

## Works
- `tests/e2e/` (API, ~5 min), `web/e2e/flows.spec.ts` (browser, ~4 min), `scripts/e2e/{ui.sh, make_media.sh,
  report.py, teardown.py, playwright.config.ts}`, `RESULTS.md`, `FINDINGS.md`, evidence per run.
- Teardown leaves no QA data in the demo (earnings unchanged by QA runs).

## Findings (`.orchestration/evidence/qa/FINDINGS.md`)
- 15 filed. Fixed and verified on the stack: QA-1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 13, 14. Mitigated: QA-5, QA-7.
  Fixed on main for the final deploy: QA-15 (tutor declining; F4 now asserts it does not).

## Next
1. After the lead's final deploy (~23:00Z: polish UI, QA-15, keep-alive 30 s, narration hold after tutor use,
   busy-not-down health): one final round (API + browser) and one solo API F4 on a quiet box.
2. handoff.md, State: review.
