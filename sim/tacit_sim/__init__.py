"""Tacit Robot Lab simulation.

Public API (the backend codes against this; keep it stable):

    scene_description(program) -> dict                              GET /api/robot/scene
    generate_demos(program, n, seed, out_dir) -> DemoSet            {path, n, success_rate, ...}
    train_policy(demos_path, out_path, epochs, on_epoch=cb) -> dict {policy_path, loss_curve, ...}
    evaluate_policy(program, policy_path, trials, seed, on_trial=cb) -> dict {success_rate, trials}
    Runner(program, mode, seed, policy_path=None, human_path=None, gr00t_url=None)
        .frames(realtime=True)  -> iterator of WS /ws/robot messages
        .run_episode()          -> {success, steps, reason}
    retarget_wrist_path(points_xyz, times) -> workspace path (Runner's human_path)
"""

import os

os.environ.setdefault("MUJOCO_GL", "egl")

from .demos import DemoSet, generate_demos, instruction  # noqa: E402
from .describe import scene_description  # noqa: E402
from .policy import train_policy  # noqa: E402
from .program import parse_program  # noqa: E402
from .retarget import retarget_wrist_path  # noqa: E402
from .runner import MODES, Runner, evaluate_policy, run_episode  # noqa: E402

__version__ = "0.1.0"

__all__ = [
    "scene_description", "generate_demos", "train_policy", "evaluate_policy", "Runner",
    "run_episode", "retarget_wrist_path", "DemoSet", "parse_program", "instruction", "MODES",
]
