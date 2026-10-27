# QA findings

Each finding: id, owner card, state (open, fixed, verified, wontfix), what was seen, what was expected, how to
reproduce, evidence. Owners are told by SendMessage; this file (on `work/qa`, also readable at
`~/tacit-wt/qa/.orchestration/evidence/qa/FINDINGS.md`) is the record. QA re-runs the flow when the owner says
it is fixed.

## QA-1 backend: a backend restart leaves skills stuck in "processing" forever

- Owner: backend (lead). State: open. Found 2026-10-27 19:35Z.
- Seen: the backend restarted at 19:29:58Z (systemd) while `job_d78c0842` (process, `sk_0f3b0232`) was in
  `narrate`. Afterwards `GET /api/skills/sk_0f3b0232` says `status: processing, job_id: null`, and the persisted
  job row still says `running` at stage `narrate`. Nothing will finish it; the UI shows a spinner forever.
- Expected: on startup, jobs persisted as queued/running are marked failed ("interrupted by a restart") and their
  skills go back to draft (or failed) so they can be processed again, or the job is re-run.
- Repro: start a process job, `deploy/stack.sh restart-backend` mid-job, then `GET /api/skills/{id}` and
  `GET /api/jobs/{id}`.
- Evidence: `~/tacit/data/tacit.db` table `jobrow` (`job_d78c0842`); dev run `dev-iter1` (test_2 lost its job).
