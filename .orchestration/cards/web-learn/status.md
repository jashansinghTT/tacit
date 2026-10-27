# Status: web-learn

State: running (merge gate met once; re-verifying after the lead's reprocess)
Updated: 2026-10-27T20:29:37+00:00

## Works (real backend :8710, dev server :5711)
All three pages, end to end; see `handoff.md` for the full list. Highlights:
- Lesson: step demo on the shared clock (2D overlay or 3D twin), intro over the MiniMax bed with
  its credit, narration with captions and auto-advance, the expert's why with honest source label.
- Practise over `WS /ws/learn` with Chromium's fake camera: live score, phase, one hint, step
  done, history, saved progress.
- Ask the expert by text and by voice (Whisper transcript), sentence audio back to back, nine
  languages; one language picker drives lesson text, narration and the tutor.
- Guide my hand: virtual glove in sync with the video, Reflex guide/stop, Download for Reflex.
- Quiz -> certificate (SVG/PNG). Team: progress matrix, activity, skills with robot readiness.

## Checks
- typecheck, lint, build: pass (after merging main and work/web at 621b861).
- `npx playwright test -c e2e/learn.config.ts`: 8/8 passed on sk_c28f1461 (20:15 UTC run);
  evidence in `.orchestration/evidence/web-learn/`.

## Now
- Waiting for sk_c28f1461 / sk_3b7c613d to finish reprocessing, then a final suite run and new
  evidence, then State: review.

## Decisions
- Learn types in `web/src/lib/api/learn.ts` follow the real backend; shared `types.ts` untouched.
- Reused the web card's `usePlayback`, `OverlayCanvas`, `TwinViewer`, `useCamera`,
  `useFrameGrabber`, `useMicrophone`, `LevelMeter`.
- Tutor: `done` = text final, audio may follow until `end`; a new question can follow `done`.
- Practice stop does not wait for `saved` (camera stops at once, "Saving your progress…").
- Served-by on my pages: no chip + cpu = "CPU"; chip model + cpu = "CPU fallback".

## Notes for the lead / web card
- No new npm dependencies.
- Shared `ServedByList` still says "CPU fallback" for MediaPipe on other pages.
- Shared `TwinViewer` duplicate React keys for same-label objects (e2e ignores that warning).
