# Tacit: system design (SDD v1)

> Teach a robot by showing it.

Tacit watches an expert do a hands-on task, turns it into a lesson that teaches new hires,
and into a skill a robot can run. Everything runs on one Tenstorrent box inside the plant.
Verified, consented skill data can be licensed to robot makers, and the expert earns a
royalty every time it is.

This document is the contract every workstream builds against. The API shapes are in
[API.md](API.md). The board is in [`.orchestration/board.json`](../.orchestration/board.json).

## 1. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Hardware | This host: 4 Blackhole chips (two p300c boards), ids 0 to 3 | What we have; the demo must run on it |
| Model serving | `tt-model` from branch `feat/cohost-kind`, installed at `~/tacit/.tools/ttm` | The cohost kind is how several small models share one chip |
| Chip plan | chip 0: tacit-vision cohost (HaMeR, Gaze-LLE, RF-DETR, VGGT); chip 1: cohost-speech (Whisper, S2 Pro, Music 3); chip 2: gpt-oss-20b-blackhole-fast `p150`; chip 3: GR00T N1.7 | 4 chips, 9 models |
| CPU perception | MediaPipe Tasks: hand landmarker, pose landmarker, face detector | HaMeR needs hand boxes and Gaze-LLE needs head boxes; MediaPipe gives both plus 2D/3D landmarks in a few ms on CPU |
| Backend | Python 3.12, FastAPI, uvicorn, SQLite (SQLModel), httpx; on `127.0.0.1:8710` | One process, local first, easy to host later |
| Frontend | Vite, React 18, TypeScript, Tailwind, framer-motion, react-three-fiber + drei, zustand, react-router | Fast to build, strong 3D |
| Sim | MuJoCo 3 (Python) with the MuJoCo Menagerie Franka Panda; EGL offscreen rendering on the AMD iGPU | GR00T N1.7 is trained on DROID (Franka); real physics; renders camera frames for GR00T |
| Training | PyTorch on CPU: behaviour-cloning policy from sim variations of the expert's demo | Trains in minutes, no GPU |
| Storage | `~/tacit/data/` (gitignored): `tacit.db`, `skills/<id>/…`, `media/…` | Local only for now |
| Auth | None. Demo personas (expert, trainee, manager, buyer) picked in the UI and sent as `X-Tacit-User` | Local demo |
| Payments | None. "License" creates a license record and a receipt; no card form, no payment data | Demo only, and honest about it |
| Ports | backend 8710, web dev server 5710; models 21000 to 21039 (table in section 4) | Clear of tt-studio (8001) and other services on this box |

## 2. Personas and use cases

- **Expert** (for example Maria, senior assembler): records a skill, answers the coach's "why"
  questions by voice, approves the lesson, lists the skill, earns royalties.
- **Trainee** (Sam, new hire): learns the skill from the AI tutor, practises on camera with
  live feedback, asks questions by voice.
- **Plant manager** (Priya): sees captured skills, trainee progress and robot readiness.
- **Robot maker** (Atlas Robotics, buyer): browses the Skill Exchange, previews skills in sim,
  licenses skill packs.

Use cases the product shows (each one is a page or a seeded example):

1. **Onboarding and training** (primary): an expert's skill becomes a lesson with a 3D twin,
   narration and live practice feedback.
2. **Selling skill data** (primary): verified, consented skills listed on the Skill Exchange and
   licensed to robot makers, with royalties to the expert.
3. **Robot teaching**: the same skill trains a robot policy in simulation; GR00T N1.7 on the box
   runs as the foundation-model baseline.
4. **Work instructions (SOP)**: written, illustrated standard work generated from the capture.
5. **Quality and safety**: compare any run against the expert's, flag skipped steps and missed
   checks (gaze: "looked at the gauge before opening the valve").
6. **Multilingual training**: the tutor narrates in the trainee's language.
7. **Retirement knowledge capture**: record a retiring expert's skills before they leave.

## 3. End-to-end flows

Every flow below must work end to end on the real stack, and is covered by an E2E test (section 9).

### F1 Capture (Watch)
1. Expert opens **Studio**, picks a source: live webcam, upload a video, or a sample.
2. Frames stream to the backend over `WS /ws/capture/{skill_id}` (JPEG, about 10 fps).
3. Per frame: MediaPipe (CPU) finds hands, pose and face; HaMeR (chip 0) recovers each hand in
   3D; Gaze-LLE (chip 0) finds where the expert looks; RF-DETR (chip 0) finds the parts.
4. The overlay shows 3D hand skeletons, the gaze ray and target, and part boxes, with live
   per-model latency.
5. The event detector marks grasps, releases, moves and gaze shifts. At a step boundary, the
   coach (gpt-oss-20b, chip 2) writes one short "why" question; S2 Pro (chip 1) speaks it.
6. The expert answers out loud; the browser cuts the answer with voice-activity detection and
   sends it; Whisper (chip 1) transcribes it; the answer is attached to that step.
7. Stop. The capture becomes a skill draft, and F2 runs on it.

Upload and sample sources run the same per-frame analysis offline (no coach questions; the LLM
drafts the "why" notes from what it saw, marked `why_source: "inferred"`, and the expert can
answer them later in the skill page).

### F2 Process
Pipeline stages, each reported with model, chip and time (`GET /api/jobs/{id}`):
`decode` → `perceive` (MediaPipe + HaMeR + Gaze-LLE + RF-DETR) → `events` → `steps` →
`write` (LLM: step titles and instructions, "why" notes, SOP, quiz, safety notes, robot program)
→ `verify` (F3) → `twin` (3D human, hands, parts, scene point cloud) → `narrate` (TTS per step)
→ `ready`.

### F3 Verify (Check)
VGGT (chip 0) rebuilds the scene from several frames of the clip. A real camera recording gives
one rigid, consistent scene: low reprojection error and stable depth for static background
across views. An AI-made fake drifts. Output: a score in [0, 1], a verdict (`verified` or
`suspect`), the per-view numbers, and a downsampled coloured point cloud for the 3D view.
The Check page compares a real sample with an AI-made fake.

### F4 Learn (training use case)
1. Trainee opens a lesson. Each step shows the keyframe, the instruction, the expert's "why"
   in their own words, and the 3D twin performing the step (orbit, slow down, loop).
2. Narration plays (S2 Pro); the trainee can pick a language.
3. **Practise**: the trainee's camera streams over `WS /ws/learn/{session_id}`; their hands are
   tracked and aligned (dynamic time warping) to the expert's motion for the current step; the
   UI shows a live match score and one concrete hint.
4. **Ask the expert**: by voice or text; Whisper → gpt-oss-20b grounded in this skill's record and
   the expert's answers → streamed text and speech.
5. Quiz, then a completion certificate. The manager dashboard shows each trainee's progress.

### F5 Robot Lab (Do)
1. The skill's robot program (from F2 `write`: an ordered list of pick and place actions over
   named objects and targets) drives a MuJoCo scene: Franka Panda, table, parts, bins.
2. **Replay**: the robot follows the expert's retargeted wrist path; a ghost of the expert's
   hands plays alongside.
3. **Train**: generate N randomised sim demonstrations of the program, train a behaviour-cloning
   policy (live loss curve), store it with the skill.
4. **Evaluate**: K randomised trials; success rate and failure reasons.
5. **GR00T**: GR00T N1.7 (chip 3) drives the sim from rendered exterior and wrist cameras and the
   step's instruction, as the foundation-model baseline.
6. The browser renders the sim from streamed state (`WS /ws/robot/{run_id}`, 30 Hz).

### F6 Skill Exchange (selling use case)
1. From a ready, verified skill: **List skill** wizard: consent (the expert confirms what is
   shared: motion, gaze, text; never raw video or face), license types and prices, royalty split
   (default expert 70%, plant 30%), publish.
2. Buyers browse and filter listings; a listing shows the twin replay, the robot sim preview,
   the verification certificate, data contents and terms.
3. **License**: creates a license and a receipt (demo, no payment), adds the pack to the buyer's
   library, and writes royalty ledger entries.
4. **Download skill pack** (zip): `skill.json`, motion tracks (no video, no face), a LeRobot-style
   episode dataset from the sim demonstrations, the trained policy, the SOP, the verification
   certificate, the license terms.
5. **Earnings**: the expert sees royalties per license and over time.

### F7 Box
Live status of the 4 chips, the model groups on each, health, p50 latency, calls, and the
cohost status (device memory and L1 per member). This is the "runs on one box" proof.

## 4. Models, chips and ports

| Chip | Package | Member | Port | Use |
|---|---|---|---|---|
| 0 | tacit-vision (cohost, built in `models/cohost-vision/`) | HaMeR | 21000 | 3D hand per box |
| 0 | | Gaze-LLE | 21001 | gaze target per head box |
| 0 | | RF-DETR | 21002 | parts and objects |
| 0 | | VGGT-1B | 21003 | 3D rebuild, verification |
| 0 | | status | 21004 | cohost status |
| 1 | `jashansinghTT/cohost-speech-blackhole` | Whisper large-v3 | 21010 | speech to text |
| 1 | | S2 Pro | 21011 | text to speech |
| 1 | | MiniMax Music 3 | 21012 | lesson intro music (optional) |
| 1 | | status | 21013 | cohost status |
| 2 | `jashansinghTT/gpt-oss-20b-blackhole-fast`, profile `p150` | gpt-oss-20b | 21020 | coach, writer, tutor (OpenAI API) |
| 3 | `changh95/GR00T-N1.7-3B-p150` | GR00T N1.7 | 21030 | robot foundation policy |

Until the vision cohost passes its gate, the standalone packages run instead (one per chip,
whatever chips are free) on the same member ports, so the backend does not change.
The ports live in one place: `deploy/stack.yaml`. The backend reads the same file.

Model APIs (from the model cards; fixtures of real responses go in `backend/tests/fixtures/`):

- HaMeR `POST /predict` `{image: b64, bbox: [x1,y1,x2,y2], is_right}` → `rotmats` (16×3×3),
  `betas` (10), `cam`, `cam_t_full` (hand translation in camera space), `timing_ms`. No vertices
  without the licence-bound `MANO_RIGHT.pkl`; articulation for display comes from MediaPipe
  landmarks, placed in 3D with HaMeR's `cam_t_full`.
- Gaze-LLE `POST /predict` `{image, bboxes: [[x1,y1,x2,y2]…] (head boxes), heatmap_format: "none"}`
  → per head `inout`, `gaze_target {x, y, x_norm, y_norm, score}`.
- RF-DETR `POST /predict` `{image, threshold}` → `detections [{label, score, box}]` (COCO classes).
- VGGT `POST /predict` `{images: [b64 × 1..4], output_format: "npz"|"json", outputs: [...]}` →
  `extrinsic`, `intrinsic`, `pose_enc`, `dense.data` (depth, world points, confidences).
- Whisper `POST /v1/audio/transcriptions` multipart `file`.
- S2 Pro `POST /v1/tts` `{text, seed, format: "wav"}` (also `/v1/audio/speech`).
- gpt-oss-20b OpenAI `POST /v1/chat/completions` (streaming, tool calling, `reasoning_effort`).
- GR00T `POST /predict` `{images: {exterior_image_1_left: [b64 t-15, b64 t], wrist_image_left: [...]},
  state: {eef_9d: [9], gripper_position: [1], joint_position: [7]}, instruction}` → 40-step chunks
  of `eef_9d`, `gripper_position`, `joint_position`. Frames must be 16:9 (320×180).

Every model client in the backend: typed request and response, a timeout, one retry, timing, a
health check, and a clearly labelled fallback (CPU or cached) so the UI can say which path served
each result. No silent fallbacks: the UI shows a badge whenever a result did not come from the
Tenstorrent chip.

## 5. Repository layout

```
tacit/
  docs/            SPEC.md (this), API.md, DEMO.md (demo script), MOAT.md
  .orchestration/  board.json, cards/<id>/{task,handoff,status}.md, evidence/, heartbeat
  deploy/          stack.yaml, stack.sh (up|down|status|logs), systemd/, watchdog.py, pull-models.sh
  models/cohost-vision/   tt-model.yaml, adapters, build scripts, fixtures, README.md
  backend/         pyproject.toml, tacit/ (app.py, api/, pipeline/, models/, perception/, llm/,
                   speech/, verify/, learn/, exchange/, robot/ glue, db.py, jobs.py), tests/
  sim/             pyproject.toml, tacit_sim/ (scene, assets, ik, program, demos, policy, train,
                   evaluate, gr00t_loop, stream), tests/
  web/             Vite app (src/pages, src/components, src/three, src/lib/api.ts), e2e/
  data/            runtime data (gitignored)
  logs/            runtime logs (gitignored)
  STATUS.md        live status, rewritten by the watchdog and the lead
```

## 6. Data model

`skill.json` (served by `GET /api/skills/{id}`; full schema in API.md):
`id, title, summary, status, created_at, expert, source, consent, steps[], qa[], sop_markdown,
quiz[], safety[], verification, robot {program, policy, gr00t}, listing, models_used[]`.

Each step: `id, index, t_start, t_end, title, instruction, why, why_source (expert|inferred),
keyframe, objects[], hand, gaze_target, tips[]`.

Tracks (`GET /api/skills/{id}/tracks`): per analysed frame, `t`, `hands[] {side, bbox, lm2d[21],
world[21], cam_t, source}`, `pose {lm2d[33], world[33]}`, `head {bbox}`, `gaze {x, y, inout, target}`,
`objects[] {label, score, box}`.

Twin (`GET /api/skills/{id}/twin`): per frame 3D body joints, 3D hand joints placed at the
wrists, gaze ray, object positions, plus a static coloured scene point cloud from VGGT.

SQLite tables: `users`, `skills` (id, title, status, expert_id, json path), `jobs`, `trainees`,
`lesson_progress`, `listings`, `licenses`, `ledger`.

## 7. Moat (what the product must make visible)

Running locally is the entry ticket, not the moat. What is hard to copy:

1. **The supply**: skill data from inside plants, given with consent. Raw video never leaves the
   box; only motion, gaze and text do. The box is the only way in.
2. **Royalties**: experts are paid per license, so they opt in. The ledger is in the product.
3. **Provenance**: every listed skill carries a consent record and a VGGT verification
   certificate (real camera, not AI-made). That is what makes it licensable.
4. **The library effect**: every plant adds skills; more skills attract more robot makers.
5. **The box**: nine models on four Tenstorrent chips, with measured latency on the Box page.

`docs/MOAT.md` expands this for the landing page and the pitch.

## 8. Design direction (the UI is the most important part)

- A "control room for skills": near-black base, graphite panels, hairline borders, one electric
  accent plus signal colours (healthy, warning, fault). Dense, legible, real data, no filler.
- Typography: a sharp grotesque for UI, a mono for telemetry and numbers.
- Motion with purpose: live telemetry, scanning overlays on video, glowing 3D skeletons, smooth
  page transitions. Respect `prefers-reduced-motion`.
- 3D everywhere it explains something: the expert's digital twin, the robot sim, the VGGT point
  cloud, the chip map on the Box page.
- Landing page: a hero that shows the idea in five seconds (a robot arm mirroring a pair of
  ghost hands), the Watch → Check → Teach → Do → Earn flow, live box stats, use cases, the moat,
  and a Skill Exchange preview.
- Guided: first-run tour and a "demo mode" button that walks a visitor through every flow with
  the seeded sample.
- Works at 1280 to 1920 wide (primary) and stays usable on a tablet; no horizontal scroll.
- Accessible: keyboard navigation, focus rings, captions for all generated speech.
- Design sources: MotionSites (free plan: 3 prompt retrievals in total; free backgrounds only) and
  21st.dev (search is free; component code retrieval has a daily quota). Spend both on the
  landing hero and the most visible sections.

## 9. Testing

- `backend/tests`: unit tests with fixtures of real model responses; integration tests that hit
  the live model ports when `TACIT_LIVE=1`.
- `sim/tests`: scene loads, IK reaches, program executes, policy trains on a tiny set.
- `web/e2e` (Playwright, Chromium): runs against the real stack. The live-camera path uses
  Chromium's fake capture devices fed from sample media (`--use-file-for-fake-video-capture`,
  `--use-file-for-fake-audio-capture`).
- E2E suite (all must pass before a release tag):
  1. Landing and navigation render; no console errors.
  2. Sample video → process → ready skill with at least 3 steps, verification, SOP.
  3. Live capture with the fake camera → coach question with audio → fake spoken answer →
     transcript attached to a step.
  4. Learn: lesson narration plays; practice gives a score and a hint; tutor answers by text and
     by voice.
  5. Robot Lab: train → evaluate (success rate at least 80% over 20 trials) → GR00T run streams frames.
  6. Exchange: list → license as buyer → download the pack zip → earnings ledger shows the royalty.
  7. Box page shows all models healthy on 4 chips.
- `scripts/smoke_models.py`: one real request per model, prints latency; run by the watchdog.

## 10. Deployment and operations

- `deploy/stack.sh up` starts the model groups (pinned chips and ports from `stack.yaml`), waits for
  health, then the backend (which serves the built web app at `/`).
- systemd user units (`deploy/systemd/`): `tacit-models.service`, `tacit-backend.service`,
  `tacit-watchdog.timer`. Linger is on, so they survive logout.
- The watchdog checks every model and the backend every 5 minutes, restarts what is down (at most
  3 times an hour per service), runs the smoke test, and rewrites `STATUS.md`.
- Access from a laptop: forward port 8710 (Cursor or `ssh -L 8710:localhost:8710`).

## 11. Out of scope for v1

Real payments, user accounts, multi-tenant hosting, face blurring in exported video (exports
contain no video at all), real robot hardware.
