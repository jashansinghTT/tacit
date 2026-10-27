# Tacit showreel

A 74-second showreel for Tacit, cut on a soundtrack made by MiniMax Music 3 on this box's chip 1.
Plan: [STORYBOARD.md](STORYBOARD.md). Every on-screen claim and its source: [CLAIMS.md](CLAIMS.md).
Renders, captures and music live in `~/tacit/data/showreel/` (gitignored; its README describes each
file and section).

## How it is made

1. **Music** (`tools/music.py`): takes from Music 3 through the speech co-host's jobs API (only inside
   a window from the lead: a take holds chip 1 for about 6 minutes). `tools/analyze_music.py` gives
   each take's beat grid, energy per bar and sections; `tools/master_audio.py` stops the chosen take on
   its last downbeat and adds a room tail.
2. **Plates** (`tools/plates.sh`): the vase sample's original footage at the app's exact crop, conformed
   to 30 and 60 fps, so the skill's tracks line up pixel for pixel.
3. **App captures** (`capture/app.mjs`): Playwright on Chromium at 2x on a virtual clock (rAF, timers
   and `performance.now` advance exactly 1/30 s per frame), cursorless. 3D scenes are software-rendered
   (no GPU access for this user), so the robot run is captured at 1x.
4. **The reel** (`reel/`): one page that renders the film as a pure function of time: DOM for type and
   app panes, Canvas 2D at device resolution for the real-data flashes (skeletons, gaze, boxes, point
   clouds). `reel/timeline.js` places sections on bars of the soundtrack.
5. **Render and encode** (`render.mjs`, `tools/encode.py`): 3840x2160 JPEG frames, motion-blur
   sub-frames where a section asks for them (averaged in linear light), Lanczos down to 1920x1080,
   x264 High yuv420p BT.709, AAC.

```bash
cd showreel && uv sync                 # numpy, pillow, scipy, librosa, soundfile, matplotlib
./make.sh previews                     # four preview clips
./make.sh cut                          # the full first cut
node render.mjs --still 23.2,35.9 --out /tmp/stills   # stills at any time, for review
```

Craft rules (from the user's standing preferences): huge sparse type, one technique per section, one
easing family (`reel/lib/ease.js`), 2x render and downsample, motion blur only where it helps,
permissive licences only (fonts are the app's own SIL OFL Geist, Geist Mono and Instrument Serif).
