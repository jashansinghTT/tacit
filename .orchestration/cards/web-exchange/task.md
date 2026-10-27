# Card `web-exchange`: the selling use case (Skill Exchange, Sell, Library, Earnings)

Owner: `tacit-web-exchange`. Worktree `~/tacit-wt/web-exchange`, branch `work/web-exchange` (branched
from `work/web`, which has the design system, app shell, mock layer and landing page). Dev server port
**5712**. Read first: `docs/SPEC.md` (F6, section 7 moat), `docs/MOAT.md`, `docs/API.md` (Skill Exchange
section), the web card `.orchestration/cards/web/task.md` (design bar, rules) and the existing code in
`web/src` (use its primitives; `components/exchange/ListingCard.tsx` already exists, build on it). The UI
is the most important part of this product: this is where a robot maker decides to pay.

## Pages you own
- `web/src/pages/Exchange.tsx` (`/exchange`): listing grid, search, filters (industry, robot type,
  verified only), sort; each card shows verification and consent badges, price from, licenses sold,
  the expert. Empty state that explains how skills get here.
- `web/src/pages/Listing.tsx` (`/exchange/:listingId`): hero with the skill's motion preview (the twin
  or the step keyframes are NOT available to buyers; use the 3D twin data `/api/skills/{id}/twin` as a
  skeleton animation, or the finger track), the **verification certificate** (VGGT score, views,
  reprojection, stability), the **consent record** (what is shared: motion, gaze, text; never raw
  video or faces; who signed, when), contents (steps, episodes, formats, trained policy), terms per
  license type, prices. **License** opens a checkout dialog clearly labelled "Demo checkout: no payment
  is taken" (no card fields, no payment data of any kind), then the receipt (amount, royalty split to
  the expert and the plant) and the pack download.
- `web/src/pages/Sell.tsx` (`/exchange/sell/:skillId`): the "List this skill" wizard: (1) check: only
  ready, verified skills (explain why provenance matters); (2) consent: the expert confirms what is
  shared, with the never-shared list; (3) prices per license type (training, robot_deploy, exclusive)
  with defaults; (4) royalty split slider (expert vs plant, default 70/30) with a worked example;
  (5) industry and robot types; (6) review and publish → `POST /api/exchange/listings`.
- `web/src/pages/Library.tsx` (`/library`): the buyer's licensed packs (`GET /api/exchange/library`),
  download, what is inside.
- `web/src/pages/Earnings.tsx` (`/earnings`): the expert's royalties (`GET /api/earnings`): total,
  chart by month, ledger (who licensed what, when, amount). Make the "experts get paid" story land.

## Rules
- Own only: the five pages above, `web/src/features/exchange/**`, `web/src/lib/api/exchange.ts`,
  `web/src/lib/mock/exchange.ts`. Do not edit shared files (`components/ui`, `components/layout`,
  `styles`, `App.tsx`, `lib/api/client.ts|index.ts|types.ts`, `lib/mock/server.ts`); ask the lead
  (`tt-model-manager-4d`) in status/message if you need a change. You may extend
  `components/exchange/ListingCard.tsx` (yours from now on).
- Personas: buyer = `u_atlas` (Atlas Robotics), expert = `u_maria`; the top bar's persona switcher sets
  `X-Tacit-User`.
- Work against the real backend on 8710. `npm run typecheck`, `npm run lint`, `npm run build` pass;
  Playwright test `web/e2e/exchange.spec.ts` covering list → license → download → earnings;
  screenshots in `.orchestration/evidence/web-exchange/`.
- Commits on `work/web-exchange`, no AI attribution. Keep `status.md` current; `handoff.md` and
  "State: review" at the merge gate.

## Merge gate
The full selling flow works against the real backend (sell a verified skill as Maria, license it as
Atlas, download the pack, see the royalty as Maria); checks pass; screenshots in evidence.
