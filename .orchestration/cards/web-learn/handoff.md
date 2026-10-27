# Handoff: web-learn

Branch `work/web-learn` (worktree `~/tacit-wt/web-learn`). Merges `work/web` (TwinViewer, overlay,
media hooks) and `main` up to the card's start. No new npm dependencies. No shared files edited.

## What it delivers (SPEC F4, the training use case)

| Page | Route | Against the real backend |
|---|---|---|
| Learn | `/learn` | `GET /api/learn/lessons` for the persona: continue card, stats, filters, lesson grid with progress |
| Lesson | `/learn/:skillId` | `GET /api/learn/lessons/{id}[?lang]` + `/api/skills/{id}` + `/tracks` + `/twin`; sessions, `WS /ws/learn`, tutor SSE, quiz, Reflex |
| Team | `/team` | `GET /api/learn/progress`, `/api/skills`, `/api/robot/{id}` per ready skill |

Lesson player:
- **Step rail** (keyframes, times, practice score per step, steps practised incl. earlier sessions)
  and the quiz at the end; safety notes under it. Arrow keys move between steps.
- **Watch**: the step looped from the source video on the shared `usePlayback` clock with the
  shared 2D overlay (hands, gaze, parts, body toggles), or the 3D `TwinViewer` with the point
  cloud; play/pause, speed, seek within the step. Narration: the intro over the MiniMax Music 3
  bed (credit line shown while it plays), then each step's line, with word-by-word captions;
  narration toggle and replay; auto-advance with a cancellable countdown.
- The expert's **why** as a quote, labelled "In Maria's words" (`why_source: expert`) or
  "Inferred from the video, not yet confirmed by Maria"; tips; hand / gaze / parts chips.
- **Practise**: camera, `POST /api/learn/sessions`, `WS /ws/learn/{id}`, JPEG ~10 fps (640 px),
  mirrored overlay of the trainee's hands, live score ring, phase bar (85% mark), one hint at a
  time (held 2.6 s), the expert's step looping as a picture-in-picture, step_done banner and
  advance, score history per step, latency and served-by, stop saves progress.
- **Ask the expert**: typed or push-to-talk (16 kHz WAV, voice-activity cut-off) to
  `POST /api/tutor/{id}/ask`; streamed text, sentence audio played back to back with the spoken
  sentence highlighted, the spoken question's transcript, sources link to steps, replay,
  starter questions; "waiting for the voice chip" from `/api/box` `speech_queue`.
- **Languages**: one picker (header and tutor) for nine languages drives the lesson text
  (`?lang=`), narration and the tutor. Lines not voiced yet are spoken on demand through
  `POST /api/speech/tts` while the lesson polls for its own narration.
- **Guide my hand (Reflex)**: `/api/reflex/status`; connected: `POST /api/reflex/guide` / `stop`;
  otherwise the 3D virtual glove (five fingers x three capsule segments, curl 0..1) plays
  `/api/skills/{id}/fingers?step=N` in sync with the step video, with live curl bars, the step's
  curl chart and a grip summary. "Download for Reflex" (`reflex.py?step=N`) always.
- **Quiz** -> `POST /api/learn/sessions/{id}/complete` (new session on a 404) -> certificate SVG,
  download as SVG or PNG.

## Files

- Pages: `web/src/pages/{Learn,Lesson,Team}.tsx`
- `web/src/features/learn/`: store, context, StepRail, StepVideo, WatchStage, narration, Captions,
  StepDetail, PracticeStage, usePractice, overlay (mirrored camera hands), AskExpert, useTutor,
  audioQueue, QuizPanel, LessonCard, team, ServedBy
- `web/src/features/reflex/`: VirtualGlove, GuideStage, fingers
- `web/src/lib/api/learn.ts` (types and calls for Learn, tutor, Reflex, music; follows the live
  backend), `web/src/lib/mock/learn.ts` (Reflex mock for mock mode)
- Tests: `web/e2e/learn.spec.ts`, `learn.config.ts`, `learn.setup.ts`, `learn.fixtures.ts`

## How to check

```
cd web
npm run typecheck && npm run lint && npm run build
npx playwright test -c e2e/learn.config.ts      # real stack; starts the dev server on 5711 if needed
```
The setup picks the seeded lesson (`sk_c28f1461`, else `sk_3b7c613d`, else the first verified one;
override with `LEARN_SKILL`), feeds Chromium's fake camera the expert's own step 1 clip and the
fake microphone a question voiced by S2 Pro. `LEARN_BASE` points it at another web server.

Evidence: `.orchestration/evidence/web-learn/` (learn, lesson-watch, lesson-3d, lesson-practice,
lesson-tutor, lesson-tutor-voice, lesson-guide, lesson-quiz, lesson-certificate, team).

## Known issues / notes for others

- Shared `ServedByList` (components/ui/Badge.tsx, web card) labels MediaPipe "CPU fallback";
  my pages use `features/learn/ServedBy.tsx` with the corrected rule.
- Shared `TwinViewer` keys objects by label, so two parts with the same label log React
  duplicate-key errors; `learn.spec.ts` ignores exactly that warning until the web card fixes it.
- Speech shares chip 1 with narration and music; while it is busy, tutor speech and
  transcription queue (the UI says so). The voice e2e test allows 150 s for the transcript.
- App chrome stays English in translated lessons; only lesson content and the tutor switch.
