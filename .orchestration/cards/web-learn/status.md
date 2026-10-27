# Status: web-learn

State: running
Updated: 2026-10-27T19:58:48+00:00

## Works (against the real backend on :8710, dev server :5711)
- `/learn`: lessons for the current persona with progress, a continue card, filters, stats.
- `/learn/:skillId`: step rail; step demo looped on the shared playback clock (web card's
  `usePlayback`) with the shared 2D overlay or the 3D `TwinViewer`; narration (intro, then each
  step) with word-by-word captions, play/pause, speed, auto-advance with a cancellable countdown;
  the expert's "why" as a quote, labelled "In Maria's words" or "Inferred from the video, not yet
  confirmed"; tips; safety.
- Practise: camera -> `POST /api/learn/sessions` -> `WS /ws/learn/{id}`, JPEG at ~10 fps, mirrored
  overlay of the trainee's hands, live score ring, phase bar, one hint at a time (held 2.6 s),
  step_done banner and advance, score history per step, stop saves progress. Tested with
  Chromium's fake camera fed the expert's own clip: best match 0.89, progress saved.
- Ask the expert: typed or push-to-talk (shared `useMicrophone`, 16 kHz WAV, VAD cut-off) ->
  `POST /api/tutor/{id}/ask` SSE; text streams, audio parts play back to back with the spoken
  sentence highlighted; transcript of the spoken question; 9 answer languages. Tested: text
  answer in ~1 s; voice question transcribed exactly by Whisper and answered.
- Guide my hand: `/api/reflex/status`; connected -> `POST /api/reflex/guide` / `stop`; otherwise a
  3D virtual glove (five fingers x three segments, curl 0..1) plays `/fingers?step=N` in sync with
  the step video, with live curl bars and the step's curl chart; "Download for Reflex" always.
- Quiz -> `POST /api/learn/sessions/{id}/complete` -> certificate SVG shown, downloadable (SVG, PNG).
- `/team`: trainee x skill matrix, recent activity, skills table with provenance, trainees and
  robot readiness (`GET /api/robot/{id}`, 80% target).

## Next
- Playwright suite `web/e2e/learn.spec.ts` + `web/e2e/learn.config.ts`; evidence screenshots on
  the seeded skills sk_c28f1461 and sk_3b7c613d once they are ready.

## Decisions
- Learn types live in `web/src/lib/api/learn.ts` and follow the real backend; shared `types.ts`
  is untouched. The lesson is merged with the skill record for intro caption text and video.
- Reused the web card's `usePlayback`, `OverlayCanvas`, `TwinViewer`, `useCamera`,
  `useFrameGrabber`, `useMicrophone`, `LevelMeter` after merging work/web.
- The tutor's `done` event only arrives after every sentence is voiced (took >2 min while S2 Pro
  was busy seeding narration). The UI treats the text as final once deltas pause for 1.8 s and
  shows "voicing on chip 1" until `done`; a new question can follow.

## Notes for the lead
- No new npm dependencies.
- Shared `ServedByList` badges MediaPipe as "CPU fallback"; MediaPipe is CPU by design (SPEC 1),
  so "fallback" reads wrong. Web card's call.
