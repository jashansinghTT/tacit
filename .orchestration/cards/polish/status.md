# Status: polish

State: running
Updated: 2026-10-27T21:45:00+00:00

## Done so far (work/polish)
- Baseline: typecheck, lint pass on main; "before" screenshots of all 22 pages at 1440 and 1920 in
  .orchestration/evidence/polish/before/ (audit.txt lists load times, overflow, console errors).
- QA-9 (hands-free never armed when S2 Pro lags) and QA-10 (tour Teach step had no target) fixed,
  with a mock regression test for QA-9. Tour prefers the first seeded sample skill (vase).
- Performance: first load preloads only vendor + entry (three.js and charts were preloaded on every
  page); three.js loads with the first 3D view; landing CLS 0.04 -> 0.0007 (route wrapper margin
  collapse); LCP ~1.2 s on a production preview.
- Default smoke project scoped to its own specs (learn/exchange/robot have their own configs).

## Next
Listing page friendly error for backend 500s (QA-12 mitigation), copy fixes (Sell, Earnings
titles), consistency audit across pages, persona walk of docs/DEMO.md, 1024/tablet and keyboard,
merge work/web-robot when it lands, "after" screenshots.

## Blockers
None. Freeze until 22:35 UTC: testing only on my dev server (:5710) and a preview build (:5718).
