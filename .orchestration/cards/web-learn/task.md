# Card `web-learn`: the training use case (Learn, Lesson, Team) and the Reflex glove

Owner: `tacit-web-learn`. Worktree `~/tacit-wt/web-learn`, branch `work/web-learn` (branched from
`work/web`, which has the design system, app shell, mock layer and landing page). Dev server port
**5711** (`npm run dev -- --port 5711`). Read first: `docs/SPEC.md` (F4), `docs/API.md` (Learn,
tutor, speech, Reflex sections below), the web card `.orchestration/cards/web/task.md` (design bar,
rules) and the existing code in `web/src` (use its primitives: `components/ui`, `components/layout`,
`lib/api`, `lib/mock`). The UI is the most important part of this product.

## Pages you own
- `web/src/pages/Learn.tsx` (`/learn`): the trainee's lessons (`GET /api/learn/lessons`) with progress.
- `web/src/pages/Lesson.tsx` (`/learn/:skillId`): the lesson player:
  - Step rail; for the current step: keyframe, instruction, the expert's own "why" (styled as a quote
    from the expert, with `why_source` shown honestly: "in Maria's words" vs "inferred"), tips.
  - Step demo: the source video looped over `t_start..t_end` with the 2D overlay from
    `/api/skills/{id}/tracks`; when the web card's 3D `TwinViewer` lands in `work/web`
    (`web/src/components/skill/`), add it as a "3D" view (merge `work/web` to get it).
  - Narration (`narration_audio`, `intro_audio`) with captions; play/pause; auto-advance.
  - **Practise**: webcam → `WS /ws/learn/{session_id}` (create with `POST /api/learn/sessions`),
    JPEG frames at ~10 fps, overlay of the trainee's hands, live match score (ring), phase bar,
    one hint at a time, `step_done` advances. Show the score history per step.
  - **Ask the expert**: push-to-talk (MediaRecorder → upload as `audio`) or typed question →
    `POST /api/tutor/{skill_id}/ask` (SSE): stream the text, play `event: audio` parts back to back
    as they arrive, show the transcript of the spoken question. Language picker for answers.
  - Quiz → `POST /api/learn/sessions/{id}/complete` → certificate (an SVG URL) shown and downloadable.
  - **Reflex glove: "Guide my hand"**: Reflex (Hack the North 2026, github.com/ZechariahWang/Reflex)
    is a 5-finger exoskeleton that moves a trainee's fingers. `GET /api/reflex/status` says whether a
    glove backend is reachable. Connected: `POST /api/reflex/guide {skill_id, step_index}` plays the
    expert's finger motion on the glove; `POST /api/reflex/stop`. Not connected: a **virtual glove**
    (3D, react-three-fiber: a stylised five-finger hand, three segments per finger, each finger bent by
    its curl 0..1) plays `GET /api/skills/{id}/fingers?step=N` (rows `[t, thumb, index, middle, ring,
    pinky]`) in sync with the step video. Always offer "Download for Reflex"
    (`/api/skills/{id}/reflex.py?step=N`). Explain in one line what it is ("feel the expert's grip").
- `web/src/pages/Team.tsx` (`/team`): the manager view: `GET /api/learn/progress` (trainee × skill:
  steps done, best score, quiz, passed, certificate), skills captured (`GET /api/skills`), and robot
  readiness per skill (`GET /api/robot/{skill_id}`: policy status, success rate).

## Rules
- Own only: the three pages above, new folders `web/src/features/learn/**` and `web/src/features/reflex/**`,
  `web/src/lib/api/learn.ts`, `web/src/lib/mock/learn.ts`. Do not edit shared files (`components/ui`,
  `components/layout`, `styles`, `App.tsx`, `lib/api/client.ts|index.ts|types.ts`, `lib/mock/server.ts`);
  if you need a change there, write it in your status and message the lead (`tt-model-manager-4d`).
  New npm dependencies: allowed, list them in status (the lead resolves lockfile conflicts).
- Work against the real backend on 8710 (it is up; models are live on the chips). Use mocks only
  for data that does not exist yet.
- `npm run typecheck`, `npm run lint`, `npm run build` must pass; Playwright smoke test per page in
  `web/e2e/learn.spec.ts` (data-testid selectors); screenshots in `.orchestration/evidence/web-learn/`.
- Commits small and clear on `work/web-learn`, no AI attribution. Keep `status.md` current;
  `handoff.md` and "State: review" when the merge gate is met.

## Merge gate
The three pages work end to end against the real backend (a ready skill exists after the lead seeds
samples; until then use any skill processed from `/api/samples`), including practice with a webcam
(test with Chromium's fake camera) and the tutor with audio; the virtual glove plays a step;
checks pass; screenshots in evidence.
