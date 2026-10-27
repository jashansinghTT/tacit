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

## QA-4 backend: a restart during training leaves the policy "training" forever

- Owner: backend (lead). State: open. Found 2026-10-27 20:30Z.
- Seen: restarts at 20:15:18Z and 20:28:27Z failed the train jobs correctly ("interrupted by a backend restart":
  `job_7039138c` on `sk_5a57754d`, `job_ae282123` on the seeded `sk_3b7c613d` "Cup and Bottle Placement"), but
  `robot.policy` stays `{"status": "training"}` on both skills (`GET /api/robot/sk_3b7c613d`). Nothing will train
  them, and the Robot Lab shows the demo skill as training.
- Expected: `recover_interrupted_jobs()` also resets interrupted train jobs' policies (back to the previous
  policy, or `untrained`/`failed` with the reason), and evaluate jobs leave the policy usable.
- Repro: `POST /api/robot/{id}/train`, restart the backend mid-train, `GET /api/robot/{id}`.

## QA-5 backend + sim: policy training crawls (about 150x slower) when the box is busy

- Owner: backend (lead) for where training runs; sim for `train_policy` threading. State: open. Found 20:30Z.
- Seen: with load average 46 to 53 on 16 cores (backend 575% CPU in perception, other workers' Chromium and a sim
  batch run), a 200-demo / 30-epoch training on `sk_5a57754d` advanced one epoch per ~5 minutes (epoch 4 to 5
  from 20:22 to 20:27Z); the same training took 59 s for all 30 epochs at 19:35Z. At that rate the Robot Lab's
  "Train" takes about 2.5 hours.
- Likely cause: `train_policy` runs in a thread inside the uvicorn process (`asyncio.to_thread`) and sets
  `torch.set_num_threads(8)` process-wide; its Python loop competes for the GIL with the backend's perception
  threads, and 8 OpenMP threads oversubscribe a saturated CPU.
- Suggestions: run demos/train/evaluate in a separate process (a `ProcessPoolExecutor` or a subprocess, with
  `nice`), with 4 torch threads and `OMP_WAIT_POLICY=PASSIVE`; report progress back over a pipe as now.
- Note: the load came from development work (several workers testing at once), so it overstates a single demo;
  but a capture or processing job running beside a training is a normal demo moment.

## QA-6 backend: QA licenses land in the demo's earnings and library

- Owner: backend (lead). State: fixed (2026-10-27 20:40Z): `DELETE /api/exchange/listings/{id}` for test skills
  (cascades to licenses and ledger), `DELETE /api/skills/{id}` cascades to listings. Both suites now tear down
  what they make; deleting the two leftover QA listings took Maria's earnings from $2,095.80 back to $1,746.50.

## QA-7 stack (speech cohost): S2 Pro slows 3 to 4x when the host CPU is busy

- Owner: lead (stack, chip 1 cohost). State: open. Found 2026-10-27 20:47Z.
- Seen: S2 Pro's real-time factor (`seconds / audio_s` in `s2pro INFO tts done` lines), median per 10 minutes:
  19:20Z 2.4, 19:30Z 3.1, 19:40Z 3.9, 19:50Z 4.7, 20:00Z 3.7, 20:10Z 5.8, 20:30Z 5.0, **20:40Z 8.5** (max 18.0),
  while the host load average rose to 40 to 50 on 16 cores. At 20:45Z a 6.6 s narration line took 63.7 s and a
  1.8 s line 14 s (the same 1.8 s line took 5.2 s at 19:50Z). The speech cohost process runs at ~270% CPU: its
  per-frame host loop is CPU-bound, so every other CPU user (MediaPipe perception, policy training, Mesa software
  EGL for the sim, headless browsers) stretches every spoken line.
- Impact: at RTF 8, the coach's question (about 3 s of speech) is voiced 25 s after its text; narration of a
  6-step lesson takes minutes; a 20 s tutor answer takes almost 3 minutes to speak.
- Suggestions: give the model containers CPU priority over the backend's CPU work (`docker update --cpu-shares`
  or a higher systemd `CPUWeight=` for tacit-models, `nice` for training and sim rendering in the backend), or pin
  the speech cohost to dedicated cores (`--cpuset-cpus`).
- Caveat: much of the load today is development (several workers' tests at once, including QA's own headless
  Chromium rendering 3D pages in software). In the demo the browser runs on a laptop, but MediaPipe, training and
  sim rendering still share the host with the models.

## QA-8 web (Studio): the processing panel stays "Failed" after a restart although the job re-ran and finished

- Owner: web (tacit-web). State: open. Found 2026-10-27 20:55Z.
- Seen: browser F2 on the merged web branches. The backend restarted while the sample's process job was in
  `narrate`; the backend marked it failed ("interrupted by a backend restart") and re-ran it under a new job id,
  and the skill became `ready` (5 steps, verified). The Studio still showed the old job as **Failed** with the
  red "interrupted by a backend restart" banner 20 minutes later: screenshot
  `findings/QA-8-studio-stale-failed.png`.
- Expected: when a job fails with `interrupted by a backend restart`, the page follows the skill's new job
  (`GET /api/skills/{id}` returns `job_id` of the re-run) and keeps showing progress; or at least it says
  "restarted, continuing" and switches to "Open the skill" when the skill is ready.
- Repro: start processing in the Studio, restart the backend mid-job (`deploy/stack.sh restart-backend`), wait.

## QA-9 web (Studio): hands-free answering never opens while the coach's voice is slow

- Owner: web (tacit-web). State: open, sent to web-e2 (cc lead) 2026-10-27 21:16Z.
- Seen (browser F3, fake camera and microphone): with S2 Pro at RTF ~8 (21:00Z), coach questions arrived at
  18.5 s, 27.7 s, 51.2 s, ... and each new one was "voice coming" before the previous one's listening window
  opened; the mic never armed in 90 s, so the expert could not answer (`findings/QA-9-handsfree-never-armed.png`).
  `awaiting` requires the newest chat line to be a coach line with its voice ready and nothing playing.
  With quick TTS it works: 21:10Z run, question at 9.1 s, mic recording at 15.6 s, transcript at 21.1 s.
- Expected: the expert can answer whenever a question is open.
- Suggestion: open the listening window when the question text arrives, keep it open while the voice plays (or
  duck the playback when the expert speaks), and answer with that question's id even if a newer one arrived.
- Related (QA-3 follow-up, backend): STT still waits for the S2 Pro request in flight: transcripts took 7.6 s
  (API F3, 20:58Z) and 13.1 s (browser F3, 21:10Z, "Whisper 13147 ms") for a 5 s answer.

## Watch item: a live capture closed no step in 2 minutes

- 21:08Z browser F3 (fake camera, vase clip looping): "0 closed" after 2:04 with hands, gaze and parts tracked,
  while the API run processed a sample in parallel (live analysis 2.5 fps, round trip 405 ms). Runs before and
  after (21:00Z, 21:04Z, 21:10Z) got their first question at about 9 s. Not filed; QA watches the release runs.
