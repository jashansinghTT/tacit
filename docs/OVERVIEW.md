# Tacit: overview

What each part does, how the box is laid out, how to run and develop it.
Back to the [README](../README.md).

## What it does

| Step | What happens | Models (chip) |
|---|---|---|
| **Watch** | Live capture: 3D hands, gaze, parts; the coach asks "why?" out loud and transcribes the answer | HaMeR, Gaze-LLE, RF-DETR (0) · gpt-oss-20b (2) · S2 Pro, Whisper (1) · MediaPipe (CPU) |
| **Check** | A 3D rebuild proves the recording is a real, rigid scene and not AI-made | VGGT-1B (0) |
| **Teach** | A lesson with a 3D twin of the expert, narration in nine languages, live practice scoring, a voice tutor, a quiz and a certificate; the Reflex glove plays the expert's grip | gpt-oss-20b (2) · S2 Pro, Whisper, Music 3 (1) |
| **Do** | The skill becomes a robot program; 200 simulated variations train a policy that runs a Franka in MuJoCo; GR00T N1.7 drives the same sim as a baseline | GR00T N1.7 (3) · MuJoCo, PyTorch (CPU) |
| **Earn** | List with consent, license to a robot maker, download a skill pack (no video), royalties to the expert | |
| **Audit** | Compare any worker's run with the expert's: steps done, skipped, out of order, gaze checks | the vision models (0) · gpt-oss-20b (2) |

## The box

```
chip 0  tacit-vision co-host: HaMeR :21000, Gaze-LLE :21001, RF-DETR :21002, VGGT-1B :21003 (one process)
chip 1  cohost-speech:        Whisper :21010, S2 Pro :21011, MiniMax Music 3 :21012 (one process)
chip 2  gpt-oss-20b-blackhole-fast (p150): OpenAI API :21020
chip 3  GR00T N1.7 (DROID layout): :21030
CPU     backend (FastAPI :8710, serves the web app), MediaPipe, MuJoCo sim, policy training
```

Co-hosting (several models in one process on one chip) is tt-model-manager's `kind: cohost`
(branch `feat/cohost-kind`), installed at `.tools/ttm`.

## Run it

```bash
~/tacit/deploy/stack.sh status          # every model and the backend
~/tacit/deploy/stack.sh up              # start whatever is not answering
systemctl --user status tacit-backend   # the backend (systemd user unit, survives logout)
```

systemd user units in `deploy/systemd/`: `tacit-backend`, `tacit-models`, `tacit-watchdog.timer`
(restarts what is down, rewrites STATUS.md every 5 minutes) and `tacit-lead-takeover.timer`.

## Develop

```bash
cd ~/tacit && .venv/bin/python -m pytest backend/tests      # backend (mocked models)
cd ~/tacit/sim && ../.venv/bin/python -m pytest tests       # sim
cd ~/tacit/web && npm run dev -- --port 5710                 # web, proxies to :8710
cd ~/tacit/web && npm run build                              # served by the backend at /
```

Layout: `backend/` (API, perception, pipeline, capture, learn, exchange, robot glue), `sim/`
(`tacit_sim`: MuJoCo scene, IK, demos, BC policy, GR00T loop), `web/` (Vite, React, three.js),
`models/cohost-vision/` (the vision co-host package), `deploy/`, `.orchestration/` (team board).

## How it was built

A team of headless Claude Code sessions (tmux `tacit-team`), one per card on
`.orchestration/board.json`, each in its own git worktree, with a lead that integrates, following the
ECC team-orchestration pattern. See [.orchestration/LEAD.md](../.orchestration/LEAD.md).

## Licences and limits

Sample videos: "Arranging dried stems in a vase" by Anastasia Shuraeva and "Checking candle jars" by Anna
Shvets (Pexels License); the AI-made clip by flutie8211 (Pixabay Content License, labelled AI generated). HaMeR's hand model
(MANO) and VGGT are non-commercial; S2 Pro is under the Fish Audio Research License; MiniMax Music 3
requires the credit "MiniMax-Music3". Reflex is integrated through its HTTP API only. The robot runs
in simulation. Payments are a demo: no payment data is collected.
