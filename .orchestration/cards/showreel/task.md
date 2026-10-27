# Card `showreel`: a 60 to 75 second Tacit showreel (first cut only)

Owner: `tacit-showreel`. Worktree `~/tacit-wt/showreel`, branch `work/showreel` (from main). Work files and
renders go in `~/tacit/data/showreel/` (gitignored); scripts and the storyboard go in `showreel/` in your branch.

## What the user wants (their standing preferences, follow them exactly)
- A **showreel**, not a demo or a technical walkthrough: spectacle and rhythm, cut on the music, huge sparse
  type (at most about 6 words on screen at a time), a different motion-design technique per section, the
  product's truth as iconic flashes (a glowing hand skeleton, the gaze ray, the point cloud, the robot arm,
  the "verified 0.90 / suspect 0.24" stamp, nine models on four chips) rather than readable tutorial output.
- Craft bar: one easing family (quint/expo out 0.5 to 0.7 s, ease-in exits 0.3 to 0.4 s, light-overshoot
  springs), render at 2x and downsample, sub-frame motion blur where it helps. Permissive licences only.
- **Review gates**: make short preview clips (the title, two transitions, the outro) and then a full first
  cut. Do NOT make a final render; the user reviews the first cut when back.
- Keep every on-screen claim true: keep a claims ledger (`showreel/CLAIMS.md`: each claim, its source file
  or measurement on this box).

## Material
- The live app at http://127.0.0.1:8710 (landing hero, Studio overlays on the real vase clip, the 3D twin,
  Verify real vs AI-made, Learn with practice and the tutor, the Robot Lab with the Franka and GR00T, the
  Skill Exchange, the Box page). Capture with Playwright (Chromium; `web/node_modules/playwright`), at 2x
  device scale, with scripted camera moves and cursorless interaction. Three.js scenes can be driven
  deterministically (fixed time step) for smooth capture.
- Story spine: "Experts retire. Their hands know things." → Watch → Check → Teach → Do → Earn → "Teach a
  robot by showing it." → Tacit · nine models · four Tenstorrent chips · one box.
- **Soundtrack on TT hardware** (dogfooding matters to the user): MiniMax Music 3 runs on chip 1 inside the
  speech co-host at http://127.0.0.1:21012 (`POST /v1/audio/speech` with `input` lyrics or "[instrumental]",
  `instructions` style, `seed`, `audio_duration`; about 3 s of chip time per second of music). A long
  request holds chip 1 and silences the coach's voice and transcription for minutes, so **message the lead
  (`tt-model-manager-4d`) before any Music 3 request and wait for a window**. Plan for 2 or 3 takes of 70 s.
  Music 3's licence requires the credit "MiniMax-Music3" and a machine-generated disclosure in the end card.

## Rules
- Do not edit product code (`backend/`, `web/src`, `sim/`); use the app as it is. Ask the owners
  (ListAgents) for a stable demo state if you need one.
- Never stop or restart models or the backend.
- Small commits on `work/showreel`, no AI attribution. Keep `status.md` current.

## Merge gate
Storyboard and claims ledger committed; three preview clips and a full first cut (1080p, H.264) in
`~/tacit/data/showreel/` with a README describing each section; nothing claimed that is not in the ledger.
