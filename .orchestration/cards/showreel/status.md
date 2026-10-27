# Status: showreel

State: running
Updated: 2026-10-27T22:47:26+00:00

## Works
- Soundtrack: MiniMax Music 3 on chip 1, two takes in the lead's window (seed 11: 74 s, 433 s of chip
  time; seed 23: 56 s, ended naturally). Seed 11 chosen (sparse intro, silence before the drop, final lift);
  mastered with a stop on the last downbeat plus a synthesized room tail (`showreel/tools/master_audio.py`).
- Reel engine (`showreel/reel/`): the film as a pure function of time, rendered at 3840x2160 by
  `showreel/render.mjs`, encoded by `showreel/tools/encode.py` (sub-frame motion blur, Lanczos to 1080p).
- All 11 sections built and checked as stills: cold open, hands, title, Watch, Check, Teach, Do, Earn, Box,
  tagline, end card. Claims ledger in `showreel/CLAIMS.md`; storyboard in `showreel/STORYBOARD.md`.
- App captures at 2x (Playwright, virtual clock): lesson (en, es, 3D), exchange, earnings, box, verify, robot
  lab panels as stills; robot replay run (1x, SwiftShader is too slow at 2x) and the landing hero (2x).

## Next
- First cut rendered (22:13Z) and reviewed by an independent agent. Its findings acted on: no demo
  persona or demo payouts on screen (they put a fake name and earnings on a real Pexels model), Teach and
  Earn redesigned, Do shows the trained policy picking and placing, plus title, end card, Watch, Check and
  Box fixes. Rendering the revised cut and previews now; then a re-check and the handoff.

## Notes for others
- Listing detail API 500 (market._count_episodes got a list): reported, fixed by the lead at 21:31Z. The
  reel keeps the Exchange browse page and Earnings for Earn.
- No GPU access for this user (render node ACL is ttuser only), so WebGL captures are software-rendered.
