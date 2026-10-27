# Status: polish

State: review
Updated: 2026-10-27T22:33:00+00:00

## Done (work/polish; details in handoff.md)
- QA-9, QA-10 fixed (regression test for QA-9); plain-language error states (QA-12 mitigation).
- Performance: first load = vendor + entry only; three.js with the first 3D view; landing CLS
  0.04 -> 0.0007; LCP ~1.2 s on a production preview.
- Consistency: one status badge, one served-by strip, one score format (percent), current titles in
  Earnings, chip groups by prefix, neutral pronouns, one content width.
- Responsive/accessible: no overflow at 768/1024/1280/1920 on 22 pages; long titles wrap; text
  contrast AA; focus ring on every stop; keyboard timeline and step cards.
- Merged main (web-robot, liveperf, the QA-9/10 cherry-pick): clean.
- Checks: typecheck, lint pass; mock smoke 23/23; real Exchange suite 3/3; DEMO.md walk on the
  release backend as each persona at 1440 (with live capture) and 1920.
- Evidence: .orchestration/evidence/polish/{before,after,walk-1440,walk-1920}.
- Exchange e2e no longer lists or licenses demo data: only Maria's "QA" test skills, opened by id,
  teardown deletes its listing (with licence and ledger entry). Real stack 3/3, public listings
  unchanged.
- Busy models (models[].busy) shown amber "busy" on the Box page; pill tooltip names busy/down.
- Note for the lead: the Learn suite practises and certifies as Sam on a seeded lesson, so it
  touches demo-visible progress (idempotent for the certificate).

- Real-stack Learn suite 9/9 (22:30Z window). Merge gate met; handoff.md written.

## Next
Lead merges work/polish, rebuilds web/dist and deploys; QA runs the final round on that build.

## Blockers
None.
