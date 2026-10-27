# Why Tacit matters, why it runs in the plant, and what is hard to copy

Source material for the landing page and the pitch. Numbers are sourced; keep them as written.

## Why it matters

- **Plants are losing their know-how.** Of 3.8 million US manufacturing jobs to fill through 2033,
  2.8 million open up because people retire (Deloitte and the Manufacturing Institute, 2024). The
  skill is in experienced people's hands and eyes, not in the manuals.
- **Robot makers are paying for exactly this data.** Figure alone is spending $1B on data and
  compute over the next year. The most useful footage, real work, sits inside plants that will not
  let it out.
- **One recording, two products.** The same capture becomes a lesson that teaches new hires this
  week, and a skill a robot can learn from later.

## Why it has to run in the plant

- **The video often cannot leave.** It shows the plant's process, often a trade secret, and its
  people. Hand geometry and voiceprints count as biometric data under laws like Illinois' BIPA.
  Tacit keeps the video on the box and only motion, gaze and text ever leave.
- **The robot cannot wait on the internet.** A policy that decides in tens of milliseconds next to
  the arm keeps working when the connection drops.
- **Factory networks are often walled off from the internet on purpose.**

## What is hard to copy

Running locally gets Tacit in the door; it is not the moat. Anyone can put a GPU in a plant.

1. **The supply.** Skill data from inside plants, given with consent, through a box that is
   already on the bench. Once a plant's lessons live in Tacit, switching means starting over.
2. **Royalties.** The expert is paid every time their skill is licensed, so they say yes instead
   of resisting being recorded. The ledger is part of the product.
3. **Provenance.** Every listed skill carries a consent record and a verification certificate: a 3D
   rebuild (VGGT) shows the recording is a real, rigid scene and not AI-made. That is what makes it
   safe for a robot maker to license.
4. **The library.** Every plant adds skills; more skills bring more robot makers; more royalties
   bring more experts.

## Why it runs best on Tenstorrent

- **Nine models, four chips, one box.** Vision (HaMeR, Gaze-LLE, RF-DETR, VGGT) shares one chip
  through co-hosting; speech (Whisper, S2 Pro, Music 3) shares another; gpt-oss-20b and GR00T N1.7
  have a chip each. Each group has its chip to itself, so the robot never waits behind the LLM.
- **Fast on the models that matter here** (one Blackhole chip, warm, measured on this box):
  HaMeR 15 ms, Gaze-LLE 10 ms, RF-DETR 13 ms per frame; gpt-oss-20b decodes about 106 tokens/s for
  one user; GR00T N1.7 plans 40 robot steps in about 63 ms (1.22× faster than an RTX 5090 running
  NVIDIA's own eager PyTorch policy, per its model card).
- **Open stack, tuned to the kernel.** Every model ships as a self-contained tt-model package,
  installed with one command each, pinned, and running offline once pulled.

## Honest limits (say them before someone else does)

- GPU comparisons use eager PyTorch, not TensorRT.
- Text to speech runs at about twice real time, so spoken answers trail the text by a few seconds.
- HaMeR's hand model (MANO) and VGGT are licensed for non-commercial use; a paid product needs a
  MANO commercial licence and a commercial 3D model.
- The robot runs in simulation. Moving a person's hand motion onto a robot is still research; the
  sim shows the path from skill to policy, not a finished deployment.
