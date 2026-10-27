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

## Sections

Bars assume about 120 BPM (2 s a bar); the cut is fitted to the detected beat grid of the chosen take.

| # | Section | Bars | On screen (words) | Technique | Picture |
|---|---|---|---|---|---|
| 1 | Cold open | 2 | **Experts retire.** (2) | Masked word rise; "retire." then defocuses and drifts away | Black, faint grid, film breath |
| 2 | Hands | 2 | **Their hands *know* things.** (4) | Light draw-on: a 3D hand skeleton drawn bone by bone, joints popping on springs | Maria's real right hand from the vase skill's tracks, slow orbit |
| 3 | Title | 1 | **tacit** (1) | Scale settle with a specular light sweep; skeleton joints collapse into the mark | Wordmark on black, ion glow |
| 4 | Watch | 4 | **Watch.** then `HaMeR 15 ms` · `Gaze-LLE 10 ms` · `RF-DETR 13 ms` | Scanline reveal: a light beam sweeps the frame and lays the overlays on behind it; slow push-in on the hands | Real vase clip; both hand skeletons, the gaze ray, part boxes |
| 5 | Check | 4 | **Check.** then `VERIFIED 0.90` / `SUSPECT 0.24` | Particle dissolve into the VGGT point cloud, orbit, then split screen with stamp slams; RGB-split glitch on the fake | Real scene rebuilt by VGGT vs the AI-made clip's cloud |
| 6 | Teach | 4 | **Teach.** then *In her own words.* | Z-space: app panes float in 3D with parallax and depth fade | Lesson page, the 3D twin, the expert's "why" |
| 7 | Do | 4 | **Do.** then `GR00T N1.7 · chip 3` | Match cut (hand to gripper), then a mosaic of trial tiles flipping on the beat | Robot Lab: the Franka following her wrist path; trial grid |
| 8 | Earn | 3 | **Earn.** then **70%** *to the expert* | Whip pan with motion blur, counter roll | Exchange listing, royalty bar, ledger |
| 9 | Box | 2 | **Nine models. Four chips.** | Beat strobe: one chip lights per beat with its models | Chip map 0 to 3, model names in mono |
| 10 | Tagline | 3 | **Teach a robot by *showing* it.** (6) | Rack focus from the type to the scene | Landing hero: the Franka mirroring the ghost hands |
| 11 | End card | 3 | **tacit** · nine models · four Tenstorrent chips · one box | Lockup with tracking-in type; fine print fades in | Credits: MiniMax-Music3 (machine-generated on chip 1), footage credits |

Total about 32 to 35 bars, 64 to 72 s.

## Transitions

- 2→3: the skeleton's 21 joints fly to the centre and become the dot of the wordmark (hit on the downbeat).
- 3→4: hard cut on the downbeat to the vase clip, beam already moving.
- **4→5 (preview)**: the scan beam passes once more and the video frame breaks into its own VGGT
  point cloud (same scene, same colours), which tilts away into 3D.
- 5→6: the split screen's divider sweeps across and becomes the edge of the first floating pane.
- **6→7 (preview)**: match cut on the hand: the twin's hand skeleton in the lesson becomes the ghost
  hand in the Robot Lab, and the Franka's gripper takes its place.
- 7→8: whip pan right (motion blur) onto the Exchange.
- 8→9: the royalty bar fills and becomes the chip map's first lit chip.
- 9→10: the chip map recedes into the landing scene's grid floor.
- 10→11: the type stays, the scene falls away to black, the lockup builds.

## Review gates (this card)

1. Preview clips: title (sections 1 to 3), transition 4→5, transition 6→7, outro (10 to 11).
2. Full first cut, 1080p H.264, in `~/tacit/data/showreel/`. No final render: the user reviews the
   first cut.
