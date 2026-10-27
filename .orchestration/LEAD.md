# Lead playbook

The lead owns integration: the board, merges into `main`, the running stack, the E2E suite and
`STATUS.md`. The lead also owns the `backend` card and `deploy/`. Workers own their cards.

Pattern: ECC team orchestration (cards with an owner, scope, state, evidence and a merge gate;
one branch-backed worktree per worker; the lead is the only integrator).

## Where things are

- Repo: `~/tacit` (`main`). Worker worktrees: `~/tacit-wt/<card>` on `work/<card>`.
- Board: `.orchestration/board.json`. Cards: `.orchestration/cards/<card>/{task,status,handoff}.md`.
- Evidence: `.orchestration/evidence/<card>/`.
- Heartbeat: `.orchestration/heartbeat` (ISO time, rewritten by the active lead at least every 30 min).
- Deploy freeze: if `.orchestration/FREEZE` exists and the time in it is still ahead, do not restart the
  backend or models and do not rebuild `web/dist` (QA is running release checks); merge only.
- Stop switch: if `.orchestration/STOP` exists, every session finishes its current step, writes its
  status and stops starting new work.
- The user's original request is summarised in `docs/SPEC.md`; the user is away for several days
  and asked for status on request. Keep `STATUS.md` short and true.

## Loop (every 30 to 60 minutes while work remains)

1. Touch the heartbeat.
2. Read every card's `status.md`. For a card in review: check its merge gate yourself (run its
   tests, look at its evidence), then `git merge --no-ff work/<card>` into `main`, run the backend
   and sim tests, rebuild the web app, restart the backend (`deploy/stack.sh restart-backend`).
3. Unblock: answer questions in a card's status, adjust contracts in `docs/API.md` (tell the
   affected cards), or message the worker (SendMessage, names `tacit-web`, `tacit-sim`,
   `tacit-vision`, `tacit-qa`).
4. Keep the stack up (`deploy/stack.sh status`), and run the E2E suite once the slices it needs
   are merged. File failures as tasks to the owning card.
5. Rewrite `STATUS.md`: overall state, what works end to end (with evidence links), what is
   running where (chips, ports, sessions), blockers, next steps.

## Takeover

`deploy/lead-takeover.sh` (systemd user timer, every 30 min) starts a background lead session if
the heartbeat is older than 60 minutes and no lead session is running (at most 6 starts a day).
A takeover lead reads this file, `STATUS.md`, `board.json` and every card's status, then
continues the loop. It does not redo merged work.

## Done

The release is done when every card is merged, the E2E suite in SPEC section 9 is green on the
real stack, the services run under systemd, and `STATUS.md` says so with evidence. Then the lead
writes the final summary into `STATUS.md`, stops the worker sessions, and leaves only the
watchdog running (no more agent sessions).
