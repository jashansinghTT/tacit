# Status: web-robot

State: review
Updated: 2026-10-27T21:20:00+00:00

## Merge gate: met
- Replay, train, evaluate, policy and GR00T runs all work from the page against the real backend
  (`sk_c28f1461`: replay success with 0.7 cm tracking error; 200 demos and 30 epochs, final loss
  0.028; 20/20 evaluation; policy success; GR00T on chip 3 streams both cameras, ~30 calls a run).
- Checks pass: `npm run typecheck`, `npm run lint`, `npm run build`.
- `web/e2e/robot.spec.ts`: 8 passed on the real stack (twice, the second after the 21:05 security
  deploy) and 8 passed on the mock.
- Evidence: `.orchestration/evidence/web-robot/` (14 screenshots, `robot-lab.mp4`, README.md).
- `handoff.md` written (what is where, test ids for QA, notes for the lead).

## What is in the branch
`/robot` index and `/robot/:skillId` lab (viewer posed from the stream, five modes, explainer,
playback), `web/src/features/robot/**`, `web/src/lib/api/robot.ts`, `web/src/lib/mock/robot.ts`
(real scene shape), `web/e2e/robot.spec.ts`. Nothing outside the card's scope was edited.

## Decisions
- Robot types and calls are in `web/src/lib/api/robot.ts`; shared `types.ts` and `api` are untouched.
- Ghost hands use the sim's `meta.human.transform.matrix`; the browser computes the same affine
  from the twin when it is absent. Drawn at about hand size over the arm.
- A GR00T run that does not finish is shown as the expected baseline (amber), not a fault.
- Train/evaluate job ids persist in sessionStorage so a reload resumes the live view.
- Unknown skill ids (the landing/tour use the mock's `sk_sort`) open the best ready skill with a toast.

## Open items for the lead (not blockers)
- Shapes the page uses beyond docs/API.md are listed in handoff.md; consider adding them.
- Playwright's mock server port 5712 is shared by every worktree; branch tests can hit another
  worktree's code.

## Blockers
None.
