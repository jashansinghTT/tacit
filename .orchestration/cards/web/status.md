# Status: web

State: running (merge gate met except the final real-mode evidence run, scheduled in the lead's freeze)
Updated: 2026-10-27T20:58:00+00:00

## Scope
Landing, design system and shared components, app shell, Studio, Skills, Skill detail
(overview, twin, SOP, verify, answer, audit), Box, tour, 404. Learn/Team → web-learn; Exchange
pages → web-exchange; Robot Lab → web-robot.

## Works (verified on the real backend via :5710 and in mock mode)
- Landing: 3D hero (ghost hands + Franka via IK) with hotspot detail panels, Watch→Earn beam
  pipeline, live box stats, use-case bento, moat over mesh video, Exchange preview, CTA, footer.
- Studio (F1): webcam, sample streamed live, or upload/offline; overlays; per-model latency HUD
  (HaMeR per hand); coach with captions and coach_audio; hands-free or push-to-talk answers;
  typed answers; Stop → processing view (recovers via the skill record if `saved` is slow);
  optional skill name (?title=).
- Skill: overview with overlays and steps; 3D twin from twin.camera (objects tracked across
  frames); SOP export; Verify vs the AI-made sample (/api/samples/{id}/verify); answers via
  /answer; Audit a run (use case 5).
- Box (F7): chip board map, p50 history, memory, speech_queue. Tour and landing links use live ids.
- typecheck, lint (0 warnings), build: pass; mock code absent from the real build.
- Playwright: mock 13/13; real stack 12 passed, 1 skipped (20:50, backend steady).
- Evidence: .orchestration/evidence/web/{mock,real}/ (real set being refreshed in the freeze).

## Next
Final real-mode screenshot run inside the lead's no-deploy freeze, then State: review.

## Notes
- web-exchange's session ended before I could reply. Their three points were all handled:
  the tour uses live listing ids (ac6a9e9), TwinViewer keys and tracks objects per slot (fbcc9ed),
  and port 5712 is free (my mock server is on 5719).
- Backend issues reported to the lead: restarts drop captures and audit jobs; PATCH during
  processing is overwritten; stop waited behind coach TTS (fixed ~20:37).

## Blockers
None.
