# Tacit backend API (v1 contract)

Base: `http://127.0.0.1:8710`. JSON unless noted. Times are seconds (floats) unless the field
ends in `_ms`. Image and audio payloads over WebSockets are base64 strings. Media files are served
under `/media/...` (URLs in responses are absolute paths on the same origin).

Every response that used a model includes `served_by`: a list of
`{model, chip, backend: "tt"|"cpu"|"cache"|"mock", ms}` so the UI can badge non-TT results.

The web client sends `X-Tacit-User: <user_id>` (demo persona). Seeded users:
`u_maria` (expert), `u_sam` (trainee), `u_priya` (manager), `u_atlas` (buyer).

## System

### `GET /api/health`
`{"ok": true, "version": "0.1.0"}`

### `GET /api/box`
```json
{"host": "tt-blackhole-01", "updated_at": "2026-10-27T18:40:00Z",
 "chips": [
  {"id": 0, "board": "p300c", "group": "tacit-vision", "status": "ok",
   "models": [
     {"name": "HaMeR", "role": "3D hands", "port": 21000, "healthy": true, "p50_ms": 4.9, "calls": 1204, "backend": "tt"},
     {"name": "Gaze-LLE", "role": "gaze", "port": 21001, "healthy": true, "p50_ms": 7.1, "calls": 1204, "backend": "tt"}],
   "memory": {"dram_gib": 9.8, "dram_total_gib": 32.0}}],
 "totals": {"models": 9, "healthy": 9, "chips": 4}}
```

### `GET /api/users` → `[{"id": "u_maria", "name": "Maria Chen", "role": "expert", "title": "Senior assembler", "avatar": "/media/avatars/maria.png"}]`

### `GET /api/samples`
`[{"id": "smp_sort", "title": "Sorting parts into a kit", "video": "/media/samples/sort.mp4", "thumb": "/media/samples/sort.jpg", "duration": 38.2, "kind": "real"}, {"id": "smp_fake", "kind": "ai-generated", ...}]`

## Skills

### `POST /api/skills`
Body (JSON) one of: `{"source": "sample", "sample_id": "smp_sort"}`, `{"source": "live"}`.
Or multipart with `file` (video) and optional `title`.
→ `{"skill_id": "sk_ab12cd", "status": "draft"}`

### `GET /api/skills?status=ready&expert_id=u_maria` → `[SkillSummary]`
`SkillSummary`: `{id, title, summary, status, created_at, expert {id, name}, thumb, duration, steps_count, verification_status, listed}`

### `GET /api/skills/{id}` → `Skill`
```json
{"id": "sk_ab12cd", "title": "Sort fasteners into the kit tray", "summary": "...",
 "status": "draft|processing|ready|failed", "created_at": "...",
 "expert": {"id": "u_maria", "name": "Maria Chen", "title": "Senior assembler"},
 "source": {"kind": "live|upload|sample", "video": "/media/skills/sk_ab12cd/source.mp4", "fps": 30, "duration": 38.2, "width": 1280, "height": 720},
 "consent": {"motion": true, "gaze": true, "voice_text": true, "raw_video": false, "signed_by": "u_maria", "signed_at": "..."},
 "steps": [{"id": "st1", "index": 1, "t_start": 0.0, "t_end": 6.2, "title": "Pick up the bracket",
            "instruction": "Take the bracket from the left bin with your right hand.",
            "why": "The left bin holds the pre-drilled ones, so they line up with the jig.",
            "why_source": "expert|inferred", "keyframe": "/media/skills/sk_ab12cd/kf_01.jpg",
            "objects": ["bracket"], "hand": "right", "gaze_target": "left bin", "tips": ["..."]}],
 "qa": [{"step_id": "st1", "t": 5.1, "question": "Why that bin first?", "question_audio": "/media/...wav", "answer": "...", "answer_audio": "/media/...wav"}],
 "sop_markdown": "# Sort fasteners\n...",
 "quiz": [{"q": "...", "choices": ["...", "..."], "answer": 1, "explain": "..."}],
 "safety": ["Check the gauge before opening the valve."],
 "verification": {"status": "pending|verified|suspect", "score": 0.93, "method": "VGGT multi-view consistency",
                  "details": {"views": 4, "reproj_px": 1.8, "depth_stability": 0.95}, "checked_at": "...",
                  "pointcloud": "/api/skills/sk_ab12cd/pointcloud"},
 "robot": {"program": [{"op": "pick", "object": "bracket"}, {"op": "place", "target": "left bin"}],
           "policy": {"status": "untrained|training|trained|failed", "success_rate": 0.95, "trials": 20, "trained_at": "..."},
           "gr00t": {"last_run": "..."}},
 "listing_id": null,
 "models_used": [{"model": "HaMeR", "chip": 0, "calls": 380, "p50_ms": 4.8, "backend": "tt"}]}
```

### `PATCH /api/skills/{id}` with any of `title`, `summary`, `steps` (edited text), `qa` answers → `Skill`
### `DELETE /api/skills/{id}` → `{"ok": true}`

### `GET /api/skills/{id}/tracks` → `Tracks`
```json
{"fps": 10, "width": 1280, "height": 720,
 "frames": [{"t": 0.0,
   "hands": [{"side": "right", "bbox": [x1, y1, x2, y2], "lm2d": [[x, y] × 21], "world": [[x, y, z] × 21],
              "cam_t": [x, y, z], "score": 0.97, "source": "hamer+mediapipe"}],
   "pose": {"lm2d": [[x, y, vis] × 33], "world": [[x, y, z] × 33]},
   "head": {"bbox": [x1, y1, x2, y2]},
   "gaze": {"x": 640.0, "y": 410.0, "inout": 0.91, "target": "left bin"},
   "objects": [{"label": "cup", "score": 0.92, "box": [x1, y1, x2, y2]}]}]}
```
Pixel coordinates are in source-video pixels. `world` landmarks are metres (MediaPipe world
coordinates for the hand, origin at the hand's centre); `cam_t` is HaMeR's hand translation in
camera space (metres, camera looking down +z).

### `GET /api/skills/{id}/twin` → `Twin`
```json
{"fps": 10, "frames": [{"t": 0.0, "body": [[x, y, z] × 33], "hands": {"left": [[x, y, z] × 21] | null, "right": [...]},
  "gaze": {"origin": [x, y, z], "target": [x, y, z]} | null, "objects": [{"label": "cup", "pos": [x, y, z]}]}],
 "bounds": {"min": [x, y, z], "max": [x, y, z]}, "up": [0, 1, 0]}
```
3D frame: metres, y up, the table near y = 0, the expert facing -z.

### `GET /api/skills/{id}/pointcloud` → binary `application/octet-stream`
Little-endian float32 `[x, y, z, r, g, b] × N` (rgb in 0..1), N ≤ 60000. Header `X-Points: N`.

### `POST /api/skills/{id}/process` → `{"job_id": "job_9f..."}` (runs F2)
### `POST /api/skills/{id}/verify` → `{"job_id": "..."}` (runs F3 alone)

## Jobs

### `GET /api/jobs/{id}`
```json
{"id": "job_9f", "kind": "process|verify|train|evaluate", "skill_id": "sk_ab12cd",
 "status": "queued|running|done|failed", "progress": 0.42, "stage": "perceive",
 "stages": [{"name": "decode", "status": "done", "ms": 812, "detail": "380 frames at 10 fps"},
            {"name": "perceive", "status": "running", "progress": 0.6, "models": ["HaMeR@0", "Gaze-LLE@0", "RF-DETR@0", "MediaPipe@cpu"]}],
 "error": null, "result": {}}
```
### `WS /ws/jobs/{id}` → the same object, pushed on every change, then closed when done or failed.

## Live capture

### `WS /ws/capture/{skill_id}`
Client → server:
- `{"type": "frame", "t": 1.23, "jpeg": "<b64>"}` about 10 per second, 960×540 or smaller.
- `{"type": "answer", "t": 12.0, "wav": "<b64 16 kHz mono wav>"}`: one spoken answer (cut by VAD in the browser).
- `{"type": "say", "text": "..."}`: typed answer instead of voice.
- `{"type": "stop"}`.

Server → client:
- `{"type": "analysis", "t": 1.23, "hands": [...], "pose": {...}, "head": {...}, "gaze": {...}, "objects": [...], "timing_ms": {"mediapipe": 9.1, "hamer": 5.0, "gaze": 7.2, "rfdetr": 4.4, "total": 31.0}, "served_by": [...]}` (same shapes as Tracks frames).
- `{"type": "event", "t": 4.9, "kind": "grasp|release|move|look|pause", "hand": "right", "object": "bracket"}`
- `{"type": "step", "step": {...partial step...}}` when a step boundary closes.
- `{"type": "coach", "id": "q3", "t": 5.1, "text": "Why did you take the bracket from the left bin?", "audio": "/media/...wav" | null, "pending_audio": true|false}`: the text arrives first; when `pending_audio` is true the voice follows as
  `{"type": "coach_audio", "id": "q3", "audio": "/media/tts/....wav", "duration": 1.8}` (S2 Pro takes ~2x real time).
- Answers may also be sent with `"question_id": "q3"` to attach them to a specific question.
- `{"type": "transcript", "question_id": "q3", "text": "Because the left ones are pre-drilled.", "ms": 410}`
- `{"type": "saved", "skill_id": "sk_ab12cd", "job_id": "job_..."}` after `stop` (processing starts).
- `{"type": "error", "message": "..."}`

## Speech

### `POST /api/speech/tts` `{"text": "...", "voice": "default", "lang": "en"}` → `{"audio": "/media/tts/<hash>.wav", "duration": 2.3, "served_by": [...]}` (cached by text hash)
### `POST /api/speech/stt` multipart `file` (wav/webm) → `{"text": "...", "served_by": [...]}`
### `POST /api/skills/{id}/answer` multipart `file` (voice) or `text`, plus `step_index` or `question` → `{"text", "skill"}`: the expert answers a pending why-question after capture; the step's `why` becomes theirs.

## Learn (training use case)

### `GET /api/learn/lessons` → `[{skill_id, title, steps_count, duration, expert, thumb, progress}]` for the current user
### `GET /api/learn/lessons/{skill_id}` → `{skill_id, title, steps: [{index, title, instruction, why, keyframe, t_start, t_end, narration_audio}], quiz, intro_audio}`
### `POST /api/learn/sessions` `{"skill_id": "...", "lang": "en"}` → `{"session_id": "ls_..."}`
### `WS /ws/learn/{session_id}`
Client: `{"type": "frame", "t": .., "jpeg": ".."}`, `{"type": "step", "index": 2}`, `{"type": "stop"}`.
Server: `{"type": "analysis", ...}` (hands only), `{"type": "feedback", "step_index": 2, "score": 0.78, "phase": 0.55, "hint": "Turn your wrist a quarter turn before you place it.", "done": false}`, `{"type": "step_done", "step_index": 2, "score": 0.86}`.
### `POST /api/learn/sessions/{id}/complete` `{"quiz_answers": [1, 0, 2]}` → `{"score": 0.9, "passed": true, "certificate": "/media/certs/....png"}`
### `GET /api/learn/progress` (manager) → `[{"trainee": {...}, "skill_id": "...", "steps_done": 4, "steps_total": 5, "best_score": 0.86, "passed": true, "updated_at": "..."}]`

### `POST /api/tutor/{skill_id}/ask` `{"question": "...", "lang": "en"}` or multipart `audio`
→ `text/event-stream`: `event: transcript` `{"text"}` (if audio was sent), `event: delta` `{"text": ".."}` × n,
`event: audio` `{"index": 0, "audio": "/media/tts/...wav", "duration": 2.1}` × n (one per sentence, in order; play them
back to back as they arrive), `event: done` `{"text": "...", "audio_parts": 2, "sources": ["st2"], "question": "..."}` as soon as the text is final (audio events for the remaining sentences may follow it), then `event: end` closes the stream.
Multipart form fields: `audio` (wav/webm), `question`, `lang`, `history` (JSON list of `{role, content}`).

## Robot Lab

### `GET /api/robot/scene` → `{"bodies": [{"name": "table", "mesh": "/sim/table.glb", ...}], "robot": {"urdf_glb": "/sim/panda.glb", "joints": [...]}, "objects": [...], "targets": [...], "cameras": {...}}`
### `GET /api/robot/{skill_id}` → `{"program": [...], "policy": {...}, "runs": [{"id", "mode", "success", "at"}]}`
### `POST /api/robot/{skill_id}/train` `{"demos": 200, "epochs": 30}` → `{"job_id"}` (job result: `{"loss_curve": [[epoch, loss]], "policy_path": "..."}`)
### `POST /api/robot/{skill_id}/evaluate` `{"trials": 20, "seed": 0}` → `{"job_id"}` (job result: `{"success_rate": 0.95, "trials": [{"seed": 0, "success": true, "steps": 412, "reason": null}]}`)
### `POST /api/robot/{skill_id}/run` `{"mode": "replay|policy|gr00t|scripted", "seed": 3, "realtime": true}` → `{"run_id": "rr_..."}`
### `WS /ws/robot/{run_id}`
Server: `{"type": "meta", "joints": ["panda_joint1", ...], "objects": ["bracket", ...], "dt": 0.0333}` then
`{"type": "state", "t": 1.2, "qpos": [9 floats: 7 arm + 2 fingers], "objects": [{"name": "bracket", "pos": [x, y, z], "quat": [w, x, y, z]}], "ee": [x, y, z], "gripper": 0.04, "phase": "pick bracket"}` at 30 Hz,
`{"type": "camera", "name": "exterior|wrist", "jpeg": ".."}` at 5 Hz (only in gr00t mode), `{"type": "gr00t", "ms": 66.1, "instruction": "..."}`,
`{"type": "done", "success": true, "reason": null}`.
The sim frame is MuJoCo's: metres, z up. The web viewer converts to three.js y-up.

## Skill Exchange (selling use case)

### `GET /api/exchange/listings?q=&industry=&robot=&verified=true` → `[Listing]`
`Listing`: `{id, skill_id, title, summary, thumb, preview_video, expert {id, name}, plant, industry, robot_types: ["franka", "ur5"], verified, consent, price: {training: 49, robot_deploy: 499, exclusive: 9900}, currency: "USD", royalty_split: {expert: 0.7, plant: 0.3}, licenses_sold, rating, created_at, demo: false}`
### `GET /api/exchange/listings/{id}` → `Listing` plus `{"skill": Skill (no raw video), "contents": {"episodes": 200, "hours_of_motion": 0.4, "formats": ["tacit-json", "lerobot"]}, "terms": "..."}`
### `POST /api/exchange/listings` `{"skill_id", "price": {...}, "royalty_split": {...}, "industry", "robot_types", "consent": {...}}` → `Listing`
### `POST /api/exchange/listings/{id}/license` `{"license_type": "training|robot_deploy|exclusive"}` (buyer from `X-Tacit-User`) → `{"license_id": "lic_...", "receipt": {"amount": 499, "currency": "USD", "royalties": [{"to": "u_maria", "amount": 349.3}, {"to": "plant", "amount": 149.7}]}, "download": "/api/exchange/licenses/lic_.../pack.zip"}`
### `GET /api/exchange/library` (buyer) → `[{"license": {...}, "listing": {...}}]`
### `GET /api/exchange/licenses/{id}/pack.zip` → `application/zip`
### `GET /api/earnings` (expert) → `{"total": 1234.5, "currency": "USD", "by_month": [["2026-10", 349.3]], "entries": [{"at", "listing_id", "skill_title", "buyer", "license_type", "amount"}]}`

## Errors
`{"error": {"code": "not_found|bad_request|model_unavailable|internal", "message": "...", "detail": {}}}` with a
matching HTTP status. `model_unavailable` (503) names the model and chip.

## Added after v1 (all live on 8710)

### Samples, music
- `GET /api/samples/{id}/verify[?refresh=1]` → VGGT verification of a sample clip (cached): `{sample_id, kind, status, score, details {views, reproj_rel, depth_stability, camera_drift, static_pixels}, times, pointcloud, points}`. `smp_fake` (AI-made) is `suspect` (0.24); the real samples are `verified` (0.90, 0.97). Point cloud format as `/api/skills/{id}/pointcloud`.
- `GET /api/music/intro` → `{audio, duration, model: "MiniMax Music 3", chip: 1, credit}`: an 8 s instrumental lesson intro (made once; credit line must be shown where it plays).

### Skills
- Skills carry `motion_thumb`: a motion-only preview (skeleton, hands, parts, gaze on a dark grid; no video pixels). Listings use it as `thumb`; never show `thumb` (a video frame) to buyers.
- `test: true` on skills titled "QA ..."; hidden from `/api/skills`, `/api/learn/lessons` and `/api/exchange/listings` unless `include_test=1`.

### Quality and safety audit (use case 5)
- `POST /api/skills/{id}/audit` multipart `file` (a worker's recorded run), `worker` (name) → `{job_id, audit_id}`; the job's stages are `decode, perceive, align, report`.
- `GET /api/skills/{id}/audits` → `[{id, worker, created_at, summary, narrative, video}]`.
- `GET /api/skills/{id}/audits/{audit_id}` → `{id, skill_id, worker, video, created_at, narrative, summary {steps_total, done, out_of_order, missing, gaze_checks_ok, score}, steps: [{index, title, status: "done"|"missing"|"out_of_order", score, expert_seconds, run_t, run_seconds, gaze_check {expert_looked_at, worker_looked_at, ok}}]}`.

### Multilingual lessons (use case 6)
- `GET /api/learn/lessons/{skill_id}?lang=es|fr|de|zh|ja|ko|pt|hi` → the same lesson with translated title, summary, steps, quiz and safety (gpt-oss-20b, cached). Narration in that language is spoken in the background: `narration_audio` is null until it is ready (poll, or play `POST /api/speech/tts` meanwhile). The response lists `languages`.

### Reflex glove
- `GET /api/reflex/status` → `{connected, url, mock, state, command, movement, fingers}`.
- `GET /api/skills/{id}/fingers[?step=N&hand=left|right]` → `{fingers, hand, frames: [[t, thumb, index, middle, ring, pinky]], fps}` (curls 0 open .. 1 closed).
- `GET /api/skills/{id}/reflex.py[?step=N&speed=1]` → a Reflex movement file (download).
- `POST /api/reflex/guide {skill_id, step_index?, speed?, url?}` → teaches and plays the movement on a Reflex backend, or `{connected: false, steps, seconds}` for the virtual glove. `POST /api/reflex/stop`.

### Box
- `GET /api/box` also returns `speech_queue: {listen, interactive, batch, busy}` (the chip-1 voice gate).
