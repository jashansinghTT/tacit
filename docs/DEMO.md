# Tacit demo script (about 6 minutes)

For the Oct 30 dogfooding demo, or any audience. Every number below was measured on this box.

## Before you start (2 minutes, once)

1. Open **http://127.0.0.1:8710** (from a laptop: `ssh -L 8710:localhost:8710 <box>` or Cursor's port
   forward).
2. Top bar: the pill should read **9/9 models · 4 chips**. If not: `~/tacit/deploy/stack.sh status`, then
   `~/tacit/deploy/stack.sh up` (a cold model boot takes 4 to 10 minutes, a warm one under a minute).
3. Persona switcher (top right): start as **Maria Chen, Expert**.
4. Have a second tab on **/box**.

## 1. The idea (30 s): landing page

> "Factories are losing their experts: of 3.8 million US manufacturing jobs to fill by 2033, 2.8
> million open up because people retire. Robot makers are paying a billion dollars for exactly the
> data those experts carry in their hands. Tacit captures it once, inside the plant, and turns it into
> two things: a lesson for the next hire, and a skill a robot can run."

Point at the hero: the glowing hands are an expert's motion; the arm is a Franka retargeting it live.
Click a hotspot (Watch, Check, Teach, Do, Earn) to show the five steps.

## 2. Watch (90 s): Studio

- **Studio → Live** (webcam) or **Use a sample → Arranging dried stems in a vase**.
- Call out the overlays and the latency strip: hands in 3D (**HaMeR, 15 ms**), where she looks
  (**Gaze-LLE, 10 ms**), the parts (**RF-DETR, 13 ms**), all on **chip 0**, sharing the chip through
  co-hosting.
- Live: when you finish a step, the **coach asks why out loud** (gpt-oss-20b on chip 2 writes the
  question in about a second; S2 Pro on chip 1 speaks it). Answer out loud; Whisper (chip 1) puts your
  words on the step.
- **Stop** → the pipeline stepper: decode, perceive, steps, write, verify, twin, narrate, each stage
  with the model and chip that ran it.

## 3. Check (30 s): Skill → Verify

> "Robot makers will only pay for data they can trust. Every skill gets a 3D rebuild: a real camera
> gives one rigid scene; an AI-made video does not."

Show the comparison: **real recording 0.90 (verified)** vs **AI-made clip 0.24 (suspect)** (VGGT-1B,
chip 0, about 1 to 3 s).

## 4. Teach (75 s): Learn

- Switch persona to **Sam Okafor, Trainee** → **Learn** → open the lesson.
- The step demo replays the expert as a 3D twin (body, hands, gaze, parts, the rebuilt scene).
- **Practise**: Sam's camera, live match score and one hint at a time ("Move your hand to your
  right, toward the vase").
- **Ask the expert** by voice: the tutor answers from Maria's own explanations, spoken sentence by
  sentence. Ask "Why does the first step matter?" or "What should I check before I start?": their
  answers on the vase lesson are already voiced, so the reply plays in about a second. A new question
  shows its text in about a second, and the voice follows 8 to 18 s later. S2 Pro speaks at 2 to 4×
  real time, depending on how busy the box is.
- Language picker → **Español**: the lesson is translated (about 5 s) and re-narrated.
- **Reflex glove** (the Hack the North 2026 project): "feel the expert's grip". With a glove connected
  the expert's finger motion plays on Sam's hand; without one the virtual glove shows it, and the skill
  downloads as a Reflex movement file.

## 5. Do (75 s): Robot Lab

- **Replay the human**: the Franka follows Maria's wrist path.
- **Train**: 200 simulated variations of the task, behaviour cloning on CPU, live loss curve (about a
  minute).
- **Evaluate**: 20 randomised trials fill the grid (the one-object sample program scores 19 to 20 of 20).
- **Run GR00T N1.7** on **chip 3**: NVIDIA's foundation policy drives the simulated arm from two
  rendered cameras at about 70 ms per decision, 58 ms of it on the chip (quiet box; it rises when the
  box is busy). Say it plainly: GR00T is the baseline; the
  skill-trained policy is what does the task.

## 6. Earn (45 s): Skill Exchange

- As **Maria**: open the skill you made in step 2 → **List on Exchange** → consent (motion, gaze and text
  are shared; raw video and faces never are) → prices → royalty split 70/30 → publish. The two seeded
  skills are already listed; if you skipped step 2, go straight to Atlas below and license one of those.
- Switch to **Atlas Robotics, Buyer** → find the listing (the preview is motion only) → **License
  (robot deploy)** → demo checkout (no payment taken) → download the pack (motion, twin, SOP, robot
  program and policy, consent and verification certificates; no video).
- Switch back to **Maria** → **Earnings**: the royalty is there.

## 7. The box (15 s)

> "Nine models, four Blackhole chips, one box, no cloud." Show /box: each chip, its models, live p50
> latency and device memory.

## If something goes wrong

| Symptom | Do this |
|---|---|
| A model shows down on /box | `~/tacit/deploy/stack.sh up` (the watchdog also restarts it within 5 minutes) |
| The coach is slow to speak | The text appears first; S2 Pro speaks at about half real time. Keep talking. |
| Webcam not available | Use **Use a sample** in Studio; every flow works from the samples |
| Backend down | `systemctl --user restart tacit-backend` (5 s) |

## Talking points

- **Why local**: the video shows the plant's process and its people (hand geometry and voiceprints
  are biometric data); robots cannot wait on the internet; many plant networks are offline by design.
- **Why it is hard to copy**: consented supply from inside plants, royalties that make experts say yes,
  verification that makes the data licensable, and a library that grows with every plant.
- **Honest limits**: GPU comparisons are against eager PyTorch; S2 Pro runs at about half real time;
  HaMeR (MANO) and VGGT are licensed for non-commercial use; the robot runs in simulation.
