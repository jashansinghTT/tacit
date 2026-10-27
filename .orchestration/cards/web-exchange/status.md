# Status: web-exchange

State: running
Updated: 2026-10-27T20:00:00+00:00

## Works (on the real backend, 8710, real model data)
- **Exchange** `/exchange`: stats strip, provenance strip, search, industry, robot and verified-only
  filters (in the URL), sort, listing cards with a motion signature drawn from `/twin` (never a
  video frame), verified and consent badges, price from, licenses sold, expert. Empty state and
  sparse-grid card explain how skills get here. "List a skill" picker for experts.
- **Listing** `/exchange/:id`: 3D motion replay (own self-framing scene: body, glowing hands, wrist
  paths, gaze, parts; no point cloud, no frames) on a time-true step track; buy box with license
  types, terms, royalty bar; VGGT certificate, consent record (shared vs never shared), pack
  contents with the zip tree, steps with the expert's "why", terms table, models that made it.
  **License** opens a checkout labelled "Demo checkout: no payment is taken" (no payment fields;
  the E2E asserts none exist), then the receipt (amount, royalties to the expert and the plant,
  demo stamp) and the pack download.
- **Sell** `/exchange/sell/:skillId`: six steps (check, consent, prices, royalty split with a
  worked example, industry and robots, review and publish) with a live buyer-view preview; the
  backend's 400 message is shown inline; already-listed and not-the-expert states.
- **Library** `/library`: licensed packs, download, "what's inside" (zip tree, certificates, terms).
- **Earnings** `/earnings`: total, last six months chart, ledger, by skill, your listings.
- **E2E** `web/e2e/exchange.spec.ts` (+ `web/e2e/exchange.config.ts`): Maria lists through the
  wizard → Atlas licenses through the checkout → downloads the pack (zip opened: motion, SOP,
  program, certificates; no video or images; no keyframes) → library → Maria's ledger shows the
  royalty. **Green twice in a row on 8710** (listed `sk_c28f1461` vase and `sk_3b7c613d` jars),
  green on the production build (`vite preview` → 8710), green on the dev backend.
- `npm run typecheck`, `npm run lint`, `npm run build` pass.

## Evidence
`.orchestration/evidence/web-exchange/`: `e2e-01..10-*.png` from the real-backend run (sell
check/consent/split/published, grid, listing, checkout, receipt, library, earnings).

## Decisions
- Buyers never see pixels from the recording: cards and the listing draw motion only. Told the
  lead the listing `thumb` was a video frame; fixed in main (9236ea9, motion-only thumb).
- Built `features/exchange/MotionScene.tsx` instead of reusing `components/skill/TwinViewer`:
  its fixed camera frames real twins off-screen and it keys parts by label (duplicate-key
  warnings). Told the lead/web.
- The UI follows the backend where it differs from API.md (terms per type, `contents.steps` and
  `policy`, `verification_score`, receipt `issued_at`), with defaults for the API.md shapes.
- Dev ports: 5712 is held by the web worker's leftover vite (pid 255570), so I use 5715 (dev
  backend 8714, mocked models, `evidence/web-exchange/devbackend.py`), 5716 (dev → 8710) and
  5717 (preview → 8710).

## Next
Full-page screenshots of every state at 1280/1440/1920 and tablet width, a last design pass,
handoff.

## Blockers
None.
