# Status: web-learn

State: review
Updated: 2026-10-27T20:54:46+00:00

## Merge gate: met
- Learn, Lesson and Team work end to end against the real backend on :8710 (seeded skill
  sk_c28f1461 after the reprocess).
- Practice with Chromium's fake camera: live score (best 93), hint, history, saved progress.
- Tutor with audio: typed and spoken questions (Whisper transcript), sentence audio played back.
- Virtual glove plays a step in sync with the video; connected path tested with stubbed Reflex.
- typecheck, lint, build pass at 9d89b46; `npx playwright test -c
  e2e/learn.config.ts` 9/9 passed; screenshots in `.orchestration/evidence/web-learn/`.
- `handoff.md` lists everything delivered, the files, how to check, and known issues.

## Decisions
- Learn types in `web/src/lib/api/learn.ts` follow the real backend; shared `types.ts` untouched.
- Reused the web card's `usePlayback`, `OverlayCanvas`, `TwinViewer`, `useCamera`,
  `useFrameGrabber`, `useMicrophone`, `LevelMeter`.
- Tutor: `done` = text final, audio may follow until `end`; Try again on a failed answer.
- One language picker drives lesson text (`?lang`), narration (on-demand TTS while it is made)
  and the tutor. Intro plays over the MiniMax Music 3 bed with its credit line.
- Practice stop does not wait for `saved`; served-by on my pages labels CPU-by-design models "CPU".

## Notes for the lead / web card
- No new npm dependencies; no shared files edited.
- Shared `ServedByList` still says "CPU fallback" for MediaPipe on other pages (lead passed it on).
- Shared `TwinViewer` logs duplicate React keys for same-label objects (e2e ignores that warning).
