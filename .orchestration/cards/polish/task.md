# Card `polish`: the whole app as one product

Owner: `tacit-web`. Worktree `~/tacit-wt/web`; new branch from main: `git checkout -B work/polish main`
(main has every web branch except web-robot, which merges soon; merge `work/web-robot` into your branch
when it lands so you polish the Robot Lab too).

## Why
Four workers built the pages in parallel against one design system. Before the demo, the app has to
feel like one product made by one hand, and the demo path (docs/DEMO.md) has to be flawless.

## Do
1. **Walk the demo script** (`docs/DEMO.md`) end to end on the real stack as each persona, at 1440 and
   1920, and fix every rough edge: copy that does not match the data, empty or loading states that look
   broken, layout jumps, inconsistent spacing, type sizes, badges, buttons, toasts, page headers.
2. **Consistency audit across pages**: same patterns for panels, tables, stat tiles, step lists, model
   and chip badges ("CPU" vs "CPU fallback"), served-by strips, time and number formats, persona
   handling. Fix in the shared components where possible (you own them).
3. **The guided tour** ("Show me"): make it walk Watch → Check → Teach → Do → Earn with the real seeded
   skills (vase sk_c28f1461, jars sk_3b7c613d), skipping anything that needs a webcam.
4. **Performance**: the three.js chunk is ~850 KB; load 3D only on the routes that use it, keep first
   load of the landing fast, no layout shift when the hero canvas mounts.
5. **Responsive and accessible**: usable at 1024 and on a tablet, keyboard reachable everywhere, visible
   focus, contrast at AA for text, captions for every generated voice line, reduced motion respected.
6. Screenshots before and after for every page in `.orchestration/evidence/polish/`.

## Rules
- Do not change the backend or the API contract. Until the freeze in `~/tacit/.orchestration/FREEZE` is
  over, work and test only on your own dev server; the lead deploys after it.
- Keep the Playwright suites green (smoke, learn, exchange, robot). Commits on `work/polish`, no AI
  attribution. Keep `status.md` current; `handoff.md` and "State: review" at the gate.

## Merge gate
Demo script runs clean as every persona; before/after screenshots; checks and all e2e suites green.
