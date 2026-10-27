# Handoff: web-exchange

Branch `work/web-exchange` (merged with `main` at 4606b9f, so it merges cleanly). Touches only
the card's scope: the five pages, `web/src/features/exchange/**`, `web/src/lib/api/exchange.ts`,
`web/src/components/exchange/ListingCard.tsx`, plus `web/e2e/exchange.spec.ts` and
`web/e2e/exchange.config.ts`. No shared file was edited (`lib/mock/exchange.ts` was not needed:
the existing mock already serves every exchange route, and all five pages render in mock mode
with no console errors).

## Merge gate: met
- Full selling flow on the **real backend (8710), real model data**: Maria lists a verified
  skill through the wizard, Atlas Robotics licenses it, downloads the pack, and Maria's ledger
  shows the royalty. `web/e2e/exchange.spec.ts` green twice in a row on 8710 (listed
  `sk_c28f1461` vase and `sk_3b7c613d` jars), green on the production build (`vite preview` →
  8710), green on the final code (license path on 8710; full path on the dev backend).
- `npm run typecheck`, `npm run lint`, `npm run build` pass.
- Screenshots: `.orchestration/evidence/web-exchange/` (`e2e-01..10` from the 8710 run; every
  page and state at 768/1024/1440/1920: grid as buyer and expert, empty, no-match, listing as
  buyer and as its expert, checkout, receipt, every wizard step incl. not-ready, not-the-expert
  and already-listed, library with "what's inside", empty library, earnings, empty earnings).

## Run the test
```
cd web
TACIT_E2E_BASE=http://127.0.0.1:8710 npx playwright test -c e2e/exchange.config.ts
# EVIDENCE_DIR=<dir> saves screenshots; E2E_SKILL=<skill_id> picks the skill to list
```
Base URL must serve this branch's web build and proxy `/api` (8710 after the merge and a web
rebuild, or `TACIT_BACKEND=http://127.0.0.1:8710 npx vite --port 5716`). The test lists Maria's
first ready, verified, unlisted, non-test skill (sample clips first); when none is left it
licenses one of her existing listings instead and says so in an annotation. Each run adds one
license (and royalty) to the real ledger.

## What is where
- `pages/Exchange.tsx`: grid, URL-backed search/filters/sort, stats, provenance strip, empty
  state ("how skills get here"), "List a skill" picker (`features/exchange/SellPicker.tsx`).
- `pages/Listing.tsx`: `MotionPreview` (3D replay in `MotionScene.tsx`, self-framing via
  `motion.ts`, time-true step track), buy box + `CheckoutDialog` (`Checkout.tsx`), certificate,
  consent record, pack contents (`Provenance.tsx`), steps with the why, terms, models.
- `pages/Sell.tsx` + `features/exchange/sell/{draft.ts,Steps.tsx}`: the six-step wizard.
- `pages/Library.tsx`, `pages/Earnings.tsx`; `features/exchange/ExchangeNav.tsx` (Browse /
  Library / Earnings tabs, since the top bar has no Library or Earnings link).
- `lib/api/exchange.ts`: typed client for what the backend returns (wider than `types.ts`).
- `.orchestration/evidence/web-exchange/devbackend.py`: this worktree's backend on its own port
  and data dir with every model endpoint mocked in-process (respx, backend fixtures), so the real
  pipeline yields verified skills without touching a chip. Used while chip 0 was down.

## Decisions worth knowing
- Buyers never see pixels from a recording: cards draw a motion glyph from `/twin`, the listing
  replays motion in 3D without the point cloud (it is coloured from the video). The lead fixed
  the listing `thumb` (was a video frame) in 9236ea9.
- The checkout says "Demo checkout: no payment is taken" before anything else, has no payment
  fields (the E2E asserts none exist), and the receipt carries a demo stamp.
- Consent copy promises nothing the backend does not do (no "withdraw any time").

## For other cards (sent by message)
- web: `Tour.tsx` "Earn" routes to the mock id `/exchange/lst_sort`; on the real backend it should
  use the first listing. `TwinViewer` keys parts by label (duplicate keys) and its fixed camera
  frames real twins off-screen. The top bar's "Exchange" is not active on `/library` and
  `/earnings`. Their old vite still holds port 5712; I used 5715/5716/5717.
- Backend: `models_used` can list a model twice (chip and cache); handled in the UI.
