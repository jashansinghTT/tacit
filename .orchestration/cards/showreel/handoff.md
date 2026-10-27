# Handoff: showreel (first cut)

## What is done

- **First cut**: `~/tacit/data/showreel/first-cut.mp4`, 74.3 s, 1920x1080, 30 fps, H.264 High@4.2
  (yuv420p, BT.709, CRF 14 under a 40 Mbit/s VBV cap; 10.5 Mbit/s average, busiest second 60 Mbit/s,
  97 MB) with AAC 320 kb/s stereo. Rendered at 3840x2160 and downsampled. Not a final render: the user
  reviews this cut first.
- **Preview clips** (the review gates), encoded from the cut's own frames: `preview-1-title.mp4` (0–25 s),
  `preview-2-watch-to-check.mp4` (30.0–35.6 s), `preview-3-teach-to-do.mp4` (41.6–47.4 s),
  `preview-4-outro.mp4` (60.4–74.3 s). Copies of all five in `~/tacit/.orchestration/evidence/showreel/`
  (mp4 is gitignored); contact sheets and a README in `.orchestration/evidence/showreel/` in git.
- **Section README**: `~/tacit/data/showreel/README.md` describes every section (time, words, technique,
  picture) and every file.
- **Storyboard** `showreel/STORYBOARD.md` (plan plus as-built), **claims ledger** `showreel/CLAIMS.md`
  (every word on screen with its source file or measurement, and what each picture is and is not).
- **Soundtrack on TT hardware**: MiniMax Music 3 on chip 1, two takes inside the lead's window (seed 11,
  74 s, 433 s of chip time; seed 23, 56 s). Seed 11 is used, mastered with a stop on its last downbeat and
  a synthesized room tail. Credit and machine-generated disclosure are on the end card.

## How to rebuild

See `showreel/README.md`. In short: `cd showreel && uv sync && ./make.sh cut && ./make.sh previews-from-cut`
(about 12 minutes on this box when it is quiet). Captures (`capture/app.mjs`) and plates
(`tools/plates.sh`) are already in `~/tacit/data/showreel/`; rerun them only if the app changes.

## Decisions worth knowing

- The reel draws the product's real outputs itself (tracks, gaze, boxes, VGGT clouds, trial results,
  /api/box) so the iconic flashes are smooth at 30 fps; app UI comes from Playwright captures at 2x on a
  virtual clock. 3D app scenes are software-rendered (no GPU access for this user), so the robot replay is
  a 1x capture.
- "In her own words" was dropped from Teach: both showcase skills' why notes are still inferred from the
  video. GR00T is labelled the baseline (it does not finish this task in the sim; the trained policy
  does, 20/20). Latencies are the co-hosted p50s (16/10/12 ms), not the standalone 15/10/13.
- App pages were captured from QA's merged build (:5790) because Learn, Robot Lab and Exchange were not
  in main yet. Recapture from main after the merge if the pages change.
- After the first render, an independent review (a fresh agent with only the film, the user's
  preferences and the plan) found that two panes put the app's demo persona ("Maria Chen, senior
  assembler, 22 years") and demo-license payouts over the real, unnamed Pexels model. That would be
  a fake identity and fake earnings on a real person, so both were removed. The same pass drove
  several redesigns: Teach (the nine languages the lesson offers, over its twin), Earn (a 70/30 split
  on the beat), Do (the trained policy actually picking and placing, labelled simulation), the mark
  snapping on the riser's peak, a bigger title, and a stacked end card. The cut in this folder is the
  revised one.
- Teach shows the nine offered languages, not nine translations: requesting the eight missing ones
  would queue their narration on chip 1, which the lead keeps free for people.
- The same reviewer re-checked the revised render. Its remaining top three were then fixed:
  - Teach's twin is now drawn from the skill's own cloud and 3D hand, not an upscaled screenshot.
  - The vase-rim hand: the tracker had reported one hand twice; the reel now keeps one detection.
  - The hands section got a visible defocused plate and depth-driven line weight.
  - Smaller fixes: Earn's bar placement, and the policy run recaptured with the lab's labels off.
  Still open, and judged acceptable for a first cut:
  - The title holds centred for about 2 s.
  - Box is clean but slide-like.
  - Watch's latency chips are a row of pills.

## For the user's review (choices I left open)

- The opening is long: the title lands at 22.4 s on the drop. Trimming two intro bars of the music would
  bring it to about 17.6 s (cut about 69.5 s).
- Take 23 (143 BPM, louder from the start) is the alternative soundtrack; a third take can be generated
  in a chip-1 window from the lead.

## Known limits

- Software-rendered 3D (robot, hero) is softer than the 2D material.
- The listing page is not used (its API was returning 500 during capture; fixed since).
- The tagline's hero arm is the landing page's stylized Franka; the Robot Lab's is the detailed model.
