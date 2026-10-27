# QA findings

Each finding: id, owner card, state (open, fixed, verified, wontfix), what was seen, what was expected, how to
reproduce, evidence. Owners are told by SendMessage; this file (on `work/qa`, also readable at
`~/tacit-wt/qa/.orchestration/evidence/qa/FINDINGS.md`) is the record. QA re-runs the flow when the owner says
it is fixed.

## QA-1 backend: a backend restart leaves skills stuck in "processing" forever

- Owner: backend (lead). State: fixed by the lead in 2618b9a (interrupted jobs are failed and re-run on startup);
  QA saw `process job ... failed: interrupted by a backend restart` in dev-iter2. Found 2026-10-27 19:35Z.
- Seen: the backend restarted at 19:29:58Z (systemd) while `job_d78c0842` (process, `sk_0f3b0232`) was in
  `narrate`. Afterwards `GET /api/skills/sk_0f3b0232` says `status: processing, job_id: null`, and the persisted
  job row still says `running` at stage `narrate`. Nothing will finish it; the UI shows a spinner forever.
- Expected: on startup, jobs persisted as queued/running are marked failed ("interrupted by a restart") and their
  skills go back to draft (or failed) so they can be processed again, or the job is re-run.
- Repro: start a process job, `deploy/stack.sh restart-backend` mid-job, then `GET /api/skills/{id}` and
  `GET /api/jobs/{id}`.
- Evidence: `~/tacit/data/tacit.db` table `jobrow` (`job_d78c0842`); dev run `dev-iter1` (test_2 lost its job).

## QA-2 backend (+ sim): a policy trained on one program is evaluated on another (0/20)

- Owner: backend (lead) for program consistency and the writer; sim added a guard. State: root cause found by
  sim (2026-10-27 20:20Z); sim fix on work/sim 87fc566; backend part open. Found 2026-10-27 19:45Z.
- Seen: Robot Lab train (200 demos, 30 epochs) then evaluate (20 trials) on `sk_5a57754d`: policy 0/20, every
  trial `timed out during pick knife`. A one-object skill (`sk_63c489a7`) scored 19/20.
- Root cause (sim, from `~/tacit/data/skills/sk_5a57754d`): training ran while the skill had no `robot.program`
  yet, so `program_for()` supplied its fallback `[pick knife, place tray, pick cup, place tray]`
  (robot/demos/meta.json); the writer then stored `[pick knife, pick cup]` and evaluation used that. Same
  checkpoint: 90% on the training program, 0% on the current one. (QA's dev run trained before processing had
  finished; the suite now refuses to run F4 to F6 on a skill that is not ready.)
- Product issues that remain: (1) the backend lets train/evaluate/run use different programs; store the training
  program with the policy and invalidate the policy when `robot.program` changes. (2) The writer emitted picks
  with no places; if each pick should go somewhere, the write stage must emit the place ops. (3) Training on a
  skill that is still processing should be refused or use the final program.
- Sim side: `evaluate_policy` and `Runner(mode="policy")` now raise `ProgramMismatch` naming both programs instead
  of scoring 0% silently; failed scripted demos were already excluded from training; `[knife -> tray, cup -> tray]`
  trains to 20/20 on current sim code.

## QA-3 backend (+ speech): interactive TTS waits minutes behind batch narration, then times out

- Owner: backend (lead); S2 Pro speed is the speech cohost's. State: fixed by the lead (one S2 Pro slot,
  interactive first, `speech_queue` in `/api/box`), QA to verify in the next full run. Found 2026-10-27 19:52Z.
- Seen (19:44 to 19:52Z): `POST /api/speech/tts` for one short sentence took 94 s; the next two calls failed
  after 120 s with `model_unavailable` ("S2 Pro (chip 1) is unavailable: "). A direct `POST :21011/v1/tts` for
  "Pick up the bracket with your right hand." (1.8 s of audio) returned after **118 s**, although S2 Pro itself
  took 5.2 s for it: the rest was queue. The speech container logged 59 S2 Pro jobs in 30 minutes (batch
  narration from processing, `narrate_rest` in the background, and the jobs re-run after each of the 4 backend
  restarts), one at a time, at 5 to 12 frames/s (a 7 s clip took 32 to 37 s; RTF up to 5 while Music 3 also ran).
  The Box page showed S2 Pro p50 = 50.3 s.
- Impact: the coach's spoken question (F1), the tutor's spoken answer (F4) and narration all share one FIFO.
  While any skill is narrating, a live expert waits minutes for the coach's voice and the tutor goes silent;
  past 120 s the backend reports the model as unavailable.
- Expected: interactive speech (coach, tutor, `/api/speech/tts`) goes first; batch narration yields to it.
- Suggestions: a priority gate in the backend's TTS client (at most one batch narration request in flight, and
  none while an interactive request waits); do not re-run the narration of every interrupted job at once after
  a restart; a timeout for interactive calls that leaves the text on screen (the UI already shows captions).
- Evidence: `docker logs tt-model-cohost-speech-blackhole-p150` around 19:49 to 19:52Z (`s2pro INFO tts done`
  lines with `seconds`, `audio_s`, `frames_per_s`); `/api/box` S2 Pro p50 50.3 s at 19:40Z.
