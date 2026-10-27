# Tacit showreel: storyboard (first cut)

A 60 to 75 second showreel, not a demo: spectacle and rhythm, cut on the music, huge sparse type
(at most about six words on screen at once), one motion-design technique per section, and the
product's truth as iconic flashes. Every claim on screen is in [CLAIMS.md](CLAIMS.md).

Spine: *Experts retire. Their hands know things.* → Watch → Check → Teach → Do → Earn →
*Teach a robot by showing it.* → tacit · nine models · four Tenstorrent chips · one box.

## Format and craft rules

- 1920×1080, 30 fps, H.264 (High, yuv420p) with AAC stereo. Rendered at 3840×2160 and downsampled
  with Lanczos. Sub-frame motion blur (averaged sub-frames, 180° shutter) only where motion is fast:
  slams, whip pans, the particle dissolve.
- One easing family: entrances expo/quint out, 0.5 to 0.7 s; exits ease-in (quint in), 0.3 to 0.4 s;
  slams and stamps on a damped spring with light overshoot (about 6%). Nothing linear except
  camera drift and data playback.
- Palette from the app's tokens: ink-950 `#040506` base, fg `#eceef1`, ion `#3cd7ff` (accent, left
  hand), violet `#a78bfa` (right hand), gaze `#ffc857`, parts `#7cf5c4`, ok `#3ddc97`, fault
  `#ff5d5d`.
- Type: Geist (600, tracking −0.05em) for the huge words, Instrument Serif italic for the one accent
  word per line (as on the landing page), Geist Mono uppercase for micro labels. All three are SIL
  OFL, from the web app's own `@fontsource` packages.
- Real data only: hand skeletons, gaze rays, part boxes and point clouds are drawn from the vase
  skill's own tracks and VGGT output (snapshotted to `data/showreel/assets/`), interpolated to 30 fps.
  UI shots are captured from the running app with Playwright at 2× on a virtual clock.
- Cuts land on bar lines of the soundtrack (MiniMax Music 3 on chip 1); hits land on detected onsets.

## Sections (as built)

Soundtrack: Music 3 take seed 11 (99.85 BPM, 2.40 s a bar after the drop), chosen over seed 23 because
it opens sparse, falls silent for a bar before the drop and lifts again near the end. The cut follows
its bars; times below are in the first cut.

| # | Section | Time (bars) | On screen | Technique | Picture |
|---|---|---|---|---|---|
| 1 | Cold open | 0.0–8.0 (0–3) | **Experts retire.** | Masked word rise; "retire." comes apart letter by letter, defocusing | Her real hands at the bench, slowing into a freeze, graded low |
| 2 | Hands | 8.0–22.4 (3–9) | **Their hands *know* things.** | Light draw-on of the tracked skeletons on the frozen frame; lift into 3D and orbit; dissolve to the index finger, which becomes the mark in the silence | The skill's own tracks; the 3D hand is her left hand's world landmarks |
| 3 | Title | 22.4–24.8 (9–10) | **tacit** | On the drop: camera kick, spring settle, fingertip shockwave, wordmark wipe, specular sweep; push-out into the cut | The app's mark, large |
| 4 | Watch | 24.8–32.1 (10–13) | **Watch.** · `HaMeR 16 ms` `Gaze-LLE 10 ms` `RF-DETR 12 ms` | Scan beam reveal, slow push-in, chips on the beats with their subjects flaring | Original footage: she sets a stem in the vase, eyes on it; skeletons, gaze ray, vase boxes from the tracks |
| 5 | Check | 32.1–39.3 (13–16) | **Check.** · `VERIFIED 0.90` / `SUSPECT 0.24` | Particle dissolve into VGGT's rebuild, orbit; split screen, stamp slams, RGB-split glitch on the fake | VGGT clouds of the real and the AI-made clip |
| 6 | Teach | 39.3–44.1 (16–18) | **Teach.** · the nine language names, one per half-beat · *in nine languages.* | Beat-cut word flash over a slow push; zoom-through into the twin's hand | The lesson's 3D twin, cropped to the scene |
| 7 | Do | 44.1–51.3 (18–21) | **Do.** · **20/20** `unseen scenes · simulation` | Zoom-out match cut, hard cut on the beat to the policy run, mosaic of trial tiles flipping on the beat | Robot Lab: her ghost hands on the replay, then the trained policy picking and placing the stem; the 20 evaluated trials |
| 8 | Earn | 51.3–56.1 (21–23) | **Earn.** **70%** *to the expert.* · `expert 70` `plant 30` | Whip pan with motion blur, counter roll, a bar splitting on the beat | The Skill Exchange, blurred to texture |
| 9 | Box | 56.1–60.9 (23–25) | **9** models · **4** Tenstorrent chips · **1** box | One chip per beat with its models, counters stepping; one outline closes around all four on the breakdown | Drawn from `/api/box` |
| 10 | Tagline | 60.9–68.1 (25–28) | **Teach a robot by *showing* it.**, then a recap | Words on the beats, rack focus to the scene, slow push; on bar 27 eight flash-cuts of earlier sections on the half-beat | The landing page's 3D hero; frames of sections 2 to 9 |
| 11 | End card | 68.1–74.3 (28–end) | tacit · Nine models · four Tenstorrent chips · one box | Stacked lockup built on the downbeat (the chain draws on joint by joint), tracking-in line, a sweep on the last hit, credits, fade with the tail | Credits incl. MiniMax-Music3, machine-generated |

Changed from the plan: Teach no longer says "In her own words": both showcase skills' "why" notes are
still inferred from the video, not answered by the expert, so the line would not be true. GR00T is not
shown driving the robot (it is the baseline and does not finish this task in the sim; the trained
policy does); it appears as chip 3's model in section 9.

Changed after the first review (an independent pass over the first cut, 2026-10-27): no app pane may
show the demo persona or demo-license dollar amounts (they would put a fake name and payout on a real,
unnamed Pexels model), and readable UI is never the main picture. Teach and Earn were redesigned
around that; Do now shows the task actually done; the end card got its own composition.

## Transitions (as built)

- 1→2: the cold open slows into a freeze; the skeletons light up on exactly those hands.
- 2→3: the index finger's four joints become the mark and hold through the silence; the drop snaps
  it into the lockup.
- 3→4: push-out with motion blur into a cut on the downbeat; the beam is already moving.
- **4→5 (preview)**: the beam passes again and the frame turns into points (each with its pixel's
  colour) that fly into VGGT's rebuild of the same clip.
- 5→6: the split screen's divider sweeps off to the right.
- **6→7 (preview)**: zoom-through into the twin's hand, zoom-out from her ghost hands in the Robot Lab.
- 7→8: whip pan.
- 8→9, 9→10: cuts on the downbeat (the breakdown, then the final lift).
- 10→11: the scene falls to black, the lockup builds.

## Review gates (this card)

1. Preview clips: title (sections 1 to 3), transition 4→5, transition 6→7, outro (10 to 11).
2. Full first cut, 1080p H.264, in `~/tacit/data/showreel/`. No final render: the user reviews the
   first cut.
