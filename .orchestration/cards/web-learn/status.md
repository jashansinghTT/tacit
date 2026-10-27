# Status: web-learn

State: running
Updated: 2026-10-27T19:24:34+00:00

## Now
Read SPEC (F4), API.md, the web card, the backend routes (learn, tutor, reflex in backend/tacit/app.py,
learn/practice.py, reflex.py) and the web design system. Building Learn, Lesson, Team pages.

## Decisions
- Types for the Learn endpoints live in `web/src/lib/api/learn.ts` and follow the real backend
  (`backend/tacit/app.py`), which returns more than the shared `types.ts` declares (lesson steps
  carry why_source, tips, narration_text; lesson summary `progress` is an object, not a number).
  Shared `types.ts` is left untouched.
- The tutor call is my own in `learn.ts` (sends `history`); `api.askTutor` in index.ts stays as is.

## Blockers / asks
- No ready skill on the backend yet (`/api/skills` and `/api/samples` are empty). Building against
  the API shapes meanwhile.
