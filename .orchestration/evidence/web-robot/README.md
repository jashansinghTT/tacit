# Evidence: web-robot (the Robot Lab)

Captured 2026-10-27 between 20:47 and 20:55 UTC from the page, in headless Chromium at 1440×900. The page ran on the
`work/web-robot` dev server (:5713), which proxies the real backend on :8710 (MuJoCo sim on the CPU,
GR00T N1.7 on chip 3). Skill: `sk_c28f1461` "Arrange Stems in Vase", a seeded skill recorded from real footage
(5 steps, 45 s). Its program is `pick stem → place vase`. Every action below was started by clicking in the page.

| File | What it shows |
|---|---|
| `01-robot-index.png` | `/robot`: each skill's program, readiness track, success rate and runs; GR00T healthy on chip 3 |
| `02-lab-at-rest.png` | The lab at rest: GLB Panda from the sim's kinematic tree, the table, the bin, the object, the explainer strip |
| `03-replay-live.png` | Replay the human, live: the arm follows the expert's retargeted wrist; her right hand (violet) and the wrist path are drawn in the workspace |
| `04-replay-done.png` | The replay finished: success, tracking error 0.7 cm, retarget scale ×0.61 |
| `05-train-live.png` | Training live: 200 demos done (scripted success 96%), behaviour cloning at epoch 2, with the explainer and tab bar following along |
| `06-train-done.png` | Trained: 30 epochs, final loss 0.028, log-scale loss curve |
| `07-evaluate-live.png` | Evaluation live: the trial grid filling in as trials finish |
| `08-evaluate-done.png` | 20/20 trials succeeded (100%, meets the 80% bar), in 44 s |
| `09-policy-live.png`, `10-policy-done.png` | The trained policy on scene seed 7: success, 9.4 s sim time, 1 task done |
| `11-gr00t-live.png`, `12-gr00t-live-full.png` | GR00T on chip 3, live. Both 320×180 camera inputs stream under the viewer, the camera frustums are drawn in the scene, the instruction is "Put the stem in the vase", and latency per call is shown (30 calls, p50 522 ms, on-chip 469 ms while the box was loaded) |
| `13-gr00t-done.png` | GR00T did not finish in 20 s. That is the expected baseline result: the model was trained on real DROID data and the sim is off its training distribution. It is shown in amber, not as a fault |
| `14-lab-1024.png` | The lab at 1024 px wide, stacked layout, full page |
| `robot-lab.mp4` | 118 s screen recording: index → lab → replay with the ghost hand → GR00T with both feeds → loss curve → evaluation filling 20/20 → watching trial seed 3 again live |

Numbers from `GET /api/robot/sk_c28f1461` after the capture: policy trained on 200 demos for 30 epochs
(final loss 0.0283), success rate 1.0 over 20 trials. Runs: replay ✓, replay ✓, policy ✓, GR00T (did not finish) ×2, policy ✓.
No console errors during the capture.
