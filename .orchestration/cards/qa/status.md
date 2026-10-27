# Status: qa

State: running
Updated: 2026-10-27T19:35Z

## Now
Building the API-level E2E suite (`tests/e2e/`, pytest + httpx + websockets against 127.0.0.1:8710).

## Stack seen at start (19:30Z)
- Backend up on 8710. Speech (chip 1), LLM (chip 2), GR00T (chip 3) healthy.
- Vision cohost (chip 0) booting: status port 21004 answers, members not ready yet.
- `/api/samples` is empty: `~/tacit/data/samples/samples.json` does not exist yet (raw videos only).
- No web branch has pages yet (web: scaffolding; web-learn/-exchange/-robot not started).

## Next
1. API E2E for the 7 flows, timings per step, evidence under `.orchestration/evidence/qa/`.
2. `scripts/e2e/make_media.sh` (y4m + wav under `~/tacit/data/e2e/`).
3. Playwright `web/e2e/flows.spec.ts` once pages land.

## Blockers
None yet (flows 2-5 need samples.json and the vision cohost).
