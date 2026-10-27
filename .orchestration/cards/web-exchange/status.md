# Status: web-exchange

State: running
Updated: 2026-10-27T19:27:00+00:00

## Now
Read SPEC (F6, section 7), MOAT, API (exchange), the web card and the existing `web/src` (design
system, mock layer, `ListingCard`). Building the five exchange pages against the real backend code.

## Findings
- The real backend on 8710 has no skills yet: the vision models on chip 0 are down (vision card not
  started) and the sample list (`data/samples/samples.json`) is not curated yet, so no skill is
  ready and VGGT-verified, and the sell flow cannot run there today.
- So for development I run a private copy of the backend code from this worktree on **port 8714**
  with its own data dir and every model endpoint mocked in-process (respx, using the backend's own
  test fixtures). The real pipeline turns three sample clips into ready, verified skills there.
  It never calls a model port (21000-21039 are all mocked) and touches no chip.
  Script: `.orchestration/evidence/web-exchange/devbackend.py` (committed with the evidence).
- Backend vs `docs/API.md` (the UI follows the backend): listing `terms` is a dict per license
  type (not a string); `contents` also has `steps` and `policy`; listings carry
  `verification_score`, `steps_count`, `duration`; the receipt carries `license_type`, `demo`,
  `issued_at`; `POST /api/exchange/listings` requires `consent.expert_confirmed: true` and accepts
  `plant`; library license rows have no `listing_id`.

## Next
Exchange grid, Listing detail with checkout, Sell wizard, Library, Earnings; Playwright
`web/e2e/exchange.spec.ts`; screenshots in `.orchestration/evidence/web-exchange/`.

## Blockers
None for building. The merge gate on the real 8710 needs one ready, verified skill there (needs
chip 0 vision up and samples seeded); until then the gate flow runs against the backend code on 8714.
