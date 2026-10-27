# Status: qa

State: review
Updated: 2026-10-27T22:55Z

## Merge gate: met
- Two consecutive green rounds in both suites on RC 27010cd (rounds 3 and 4: API `20261027T221417Z-api`,
  `20261027T221939Z-api` 7/7; browser `20261027T221420Z-ui`, `20261027T221941Z-ui` 7/7 + X1), then a third green
  round on the final build a56321c (API `20261027T223818Z-api` 7/7, browser `20261027T223821Z-ui` 7/7 + X1).
- `RESULTS.md`: API streak 3, UI streak 3, with timings, flags, history and the quiet-box tutor latency.
- `handoff.md` written.

## Findings (`.orchestration/evidence/qa/FINDINGS.md`)
- 15 filed with owners. Fixed and verified: QA-1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 13, 14. Mitigated: QA-5, QA-7.
  QA-15 fixed in the final build (F4 asserts the tutor does not decline).

## Open notes for the lead
- Tutor speech is the slowest thing a demo visitor sees: first spoken clause 16 to 19 s on an idle speech chip
  under today's host load (text on screen in under a second).
- The browser suite needs `~/tacit-wt/qa-ui` (throwaway checkout for node_modules); `ui.sh` recreates it.
