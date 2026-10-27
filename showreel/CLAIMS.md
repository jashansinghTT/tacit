# Claims ledger

Every claim the showreel makes on screen, with its source. Paths are relative to `~/tacit`; data
snapshots are in `data/showreel/assets/` (taken 2026-10-27, 20:20 to 21:15 UTC). Section times are
for the first cut (`data/showreel/first-cut.mp4`). If a source changes, the claim must be rechecked.

## Words on screen

| # | On screen | Section | Claim | Source |
|---|---|---|---|---|
| 1 | **Experts retire.** | 1 cold open | Experienced workers are leaving | `docs/MOAT.md`: of 3.8 million US manufacturing jobs to fill through 2033, 2.8 million open up because people retire (Deloitte and the Manufacturing Institute, 2024) |
| 2 | **Their hands know things.** | 2 | Framing: the skill is in their hands | `docs/MOAT.md` ("the skill is in experienced people's hands and eyes, not in the manuals") |
| 3 | **tacit** + the mark | 3 title | The product's name and logo | `web/src/components/layout/Logo.tsx` (mark geometry copied exactly) |
| 4 | **Watch.** | 4 | Tacit watches the expert | SPEC F1 |
| 5 | `HaMeR 16 ms` | 4 | HaMeR's 3D hand per frame takes 16 ms | `.orchestration/evidence/vision/latency_one_at_a_time.jsonl`: co-hosted on chip 0, warm, one request at a time, n = 20, wall-clock p50 **15.56 ms** at the model server (standalone 15.24 ms). The docs' "15 ms" is the standalone figure; the reel uses the co-hosted one because that is how the box runs. Not the same measurement as the Box page, whose p50 is end to end through the backend and rises under load (126 ms for HaMeR in the 20:20 snapshot, while the QA suite was running) |
| 6 | `Gaze-LLE 10 ms` | 4 | Gaze target per frame takes 10 ms | same file: co-hosted p50 **9.94 ms** |
| 7 | `RF-DETR 12 ms` | 4 | Parts per frame take 12 ms | same file: co-hosted p50 **12.33 ms** (standalone 13.15 ms) |
| 8 | **Check.** | 5 | Each recording is checked | SPEC F3 |
| 9 | `Real camera` · **VERIFIED 0.90** | 5 | VGGT verifies the real clip | `data/samples/smp_vase.verify.json`: status `verified`, score **0.904** (VGGT-1B, chip 0, 3.6 s; 4 views, reprojection 1.3%, camera drift 0.0008) |
| 10 | `AI-made clip` · **SUSPECT 0.24** | 5 | VGGT flags the AI-made clip | `data/samples/smp_fake.verify.json`: status `suspect`, score **0.235** stored to 3 decimals. From the stored terms (`backend/tacit/pipeline/geometry.py` `consistency`: 0.6·max(0, 1 − 0.132/0.12) + 0.4·(1 − 0.0494/0.12)) the raw score is 0.2352 to 0.2355, so **0.24** is the correct 2-decimal value. (The app's details table shows "0.23" through `toFixed(2)` on 0.235, a float artefact; its score ring shows 24.) The clip is labelled AI-generated on Pixabay (`data/samples/samples.json`) |
| 11 | **Teach.** · English … 한국어 (one at a time) · *in nine languages.* | 6 | A lesson is made from the capture, in any of nine languages | `GET /api/learn/lessons/sk_c28f1461` lists 9 languages (en, es, fr, de, zh, ja, ko, pt, hi; translated by gpt-oss-20b in `backend/tacit/learn/i18n.py`); the names flashed are the Lesson page's own selector labels, in its order. (Only Spanish was already translated for this skill; requesting the others would also queue their narration on chip 1, so the reel shows the offered languages, not their text) |
| 12 | **Do.** | 7 | The skill drives a robot | SPEC F5; Robot Lab replay of the expert's wrist path |
| 13 | **20/20** `unseen scenes · simulation` | 7 | The skill-trained policy succeeded in all 20 evaluation trials, on scenes it was not trained on | `data/showreel/assets/robot_vase.json` (`GET /api/robot/sk_c28f1461`): policy trained on 200 sim demos, `success_rate` 1.0 over 20 trials (seeds 0 to 19, all `success: true`), evaluated 2026-10-27 21:12 UTC; the Robot Lab: "Each trial is a new randomised scene the policy has never seen (trial seeds are kept apart from training)". Simulation only (MuJoCo), as `docs/MOAT.md` says |
| 14 | (removed) GR00T beat in Do | 7 | The first cut's GR00T label is gone; GR00T N1.7 now appears only as chip 3's model in section 9 | `box.json`; the Robot Lab's own note that GR00T is the baseline and is not expected to finish this task in the sim |
| 15 | **Earn.** **70%** *to the expert.* · bar `expert 70` / `plant 30` | 8 | The expert gets 70% of each license by default, the plant 30% | `backend/tacit/exchange/market.py`: `DEFAULT_SPLIT = {"expert": 0.7, "plant": 0.3}`; Exchange page stat "Expert share 70% of every license fee". Licenses are demo licenses with no payment (SPEC section 1) |
| 16 | **9** models · **4** Tenstorrent chips · **1** box; model names per chip | 9 | Nine models on four chips in one box | `data/showreel/assets/box.json` (`GET /api/box`): chips 0 to 3 (two p300c boards), 4 + 3 + 1 + 1 models, all healthy, all `backend: tt` |
| 17 | `one box · no cloud` | 9 | Everything runs on the box | SPEC section 1 and F7 ("runs on one box"), `docs/DEMO.md` ("Nine models, four Blackhole chips, one box, no cloud"); every model port is local (`deploy/stack.yaml`) |
| 18 | **Teach a robot by showing it.** | 10 | The product's line | Landing page headline |
| — | Recap, 65.7–68.1 s: eight flash-cuts | 10 | Re-shows frames of sections 2, 4, 5, 6, 7, 8 and 9 (with their words: VERIFIED 0.90, SUSPECT 0.24, 20/20, 70%, the chip counts) | as rows 5 to 17; each cut is that section rendered at a fixed time |
| 19 | Nine models · four Tenstorrent chips · one box | 11 end card | as 16 | as 16 |
| 20 | Music: MiniMax-Music3, machine-generated on chip 1 of this box | 11 end card | The soundtrack was generated by MiniMax Music 3 on this box's chip 1 | `data/showreel/music/take_11.json`: model MiniMaxAI/MiniMax-Music3, cohost-speech on chip 1 (port 21012), seed 11, 433 s of chip time for 74 s. Credit and disclosure required by the MiniMax-Music3 Community License |
| 21 | Footage: Anastasia Shuraeva, Pexels; AI-made comparison clip: flutie8211, Pixabay | 11 end card | Credits | `data/samples/samples.json` (Pexels License; Pixabay Content License) |

## Pictures (what each image is, so none of them claims more than it is)

| Section | Picture | What it is |
|---|---|---|
| 1, 2, 4 | Her hands, the vase clip | The vase sample's original (Pexels 6608029, `data/samples/raw/pexels_6608029.mp4`), cropped exactly as the app's sample (centre 2560×1440), conformed to 30 and 60 fps with motion interpolation |
| 2, 4 | Hand skeletons | The vase skill's own tracks (`assets/tracks_vase.json`, `GET /api/skills/sk_c28f1461/tracks`): MediaPipe hand landmarks (CPU), which the app places in 3D with HaMeR's output, drawn as the app draws them; 10 fps, linearly interpolated to 30 fps. In Watch, the two hands are followed by continuity (the tracker's left/right label flips) and collapsed detections are dropped. Section 2's 3D hand is the left hand's MediaPipe world landmarks from 22.5 s, in slow motion |
| 4 | Gaze ray and target | Gaze-LLE's gaze point from the same tracks, drawn from the head box (MediaPipe face) |
| 4 | Vase boxes and scores | RF-DETR detections from the same tracks (scores as detected) |
| 5 | Point clouds | The VGGT clouds of the real and AI-made samples (`smp_vase` / `smp_fake.pointcloud.bin`, 60,000 points each). The frame-to-points transition is a visual morph: points start laid out over the frame and coloured from it, then fly to their real 3D positions. It is not a pixel-exact reprojection |
| 6 | The 3D twin | The Lesson page's 3D view, dollied in with its own controls and cropped to the scene (no page text, no names) |
| 7 | The Franka | Two Robot Lab runs recorded from the app (MuJoCo on the backend's CPU): a "replay the human" run (her wrist path, her hands as a ghost) for the zoom-out, then a "run policy" run (the skill-trained policy on a seeded scene; it reached, grasped, carried and placed the stem; 2026-10-27 about 22:40 UTC), played at 2.2x |
| 7 | Trial tiles | Drawn from the 20 trial results in `robot_vase.json` (one tile per trial) |
| 8 | Exchange page | A screenshot of the app, blurred to texture: no names, prices or earnings are legible. The first cut's Earnings pane (demo-license dollar amounts under the demo persona's name) was removed |
| 9 | Chip tiles | Drawn from `box.json` |
| 10 | Robot arm with ghost hands | The landing page's 3D hero, captured from the app: an illustrative scene, not a recorded run |

App pages were captured from the QA card's merged build of the four web branches (`:5790`, the real
backend on `:8710`) because Learn, Robot Lab and Exchange were not merged into `main` yet.

## Names and people

The woman in the footage is a Pexels model; the reel never names her. The app's demo persona ("Maria
Chen, senior assembler, 22 years") is not shown anywhere in the reel: panes that carried it were
removed or blurred after the first review (2026-10-27), as were demo-license dollar amounts.
