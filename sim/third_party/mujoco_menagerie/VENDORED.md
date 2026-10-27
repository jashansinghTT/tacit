# Vendored: MuJoCo Menagerie, franka_emika_panda

Source: https://github.com/google-deepmind/mujoco_menagerie (commit f3b6013629c7b94f8ee93fd977b161fa8350f9bc),
folder `franka_emika_panda/`, unmodified. Only `panda.xml`, `assets/`, `LICENSE` (Apache-2.0),
`README.md` and `CHANGELOG.md` are copied. Vendored so the sim runs offline on the box.
tacit_sim loads `panda.xml` through MjSpec and adjusts it at load time (see tacit_sim/scene.py).
