"""Policy observation and action encoding.

Observation (OBS_DIM floats), all in the robot base frame:
  tcp xyz (3), finger opening (1), yaw error to the current goal yaw (1),
  object - tcp (3), release point - object (3), object half height and grasp half width (2),
  last gripper command (1), phase one-hot pick/place/done (3), task index one-hot (MAX_TASKS).

Action per step (ACT_DIM): TCP target - current TCP (3), gripper yaw goal - current yaw (1,
wrapped to +-pi/2), gripper command (1, 1 = close). Policies predict a chunk of CHUNK steps, all
relative to the TCP and yaw at the time of the query.
"""

from __future__ import annotations

import numpy as np

from .env import HOME_TCP, SimEnv
from .expert import grasp_height, natural_yaw
from .ik import wrap_period

MAX_TASKS = 8
PHASES = ("pick", "place", "done")
OBS_DIM = 3 + 1 + 1 + 3 + 3 + 2 + 1 + len(PHASES) + MAX_TASKS
ACT_DIM = 5
CHUNK = 10


def goal_yaw(env: SimEnv) -> float:
    """The yaw the gripper should be heading for in the current phase (same rule as the expert)."""
    mon = env.monitor
    if mon.phase == "pick" and mon.task is not None:
        obj = env.object_state(mon.task.object)
        return env.grasp_yaw(mon.task.object, natural_yaw(obj.pos))
    return natural_yaw(env.tcp_pos())


def observe(env: SimEnv) -> np.ndarray:
    mon = env.monitor
    tcp = env.tcp_pos()
    yaw = env.gripper_yaw()
    obs = np.zeros(OBS_DIM, dtype=np.float32)
    obs[0:3] = tcp
    obs[3] = env.finger_width()
    obs[4] = wrap_period(goal_yaw(env) - yaw, np.pi)
    task = mon.task
    if mon.phase == "done" or task is None:
        obs[5:8] = HOME_TCP - tcp
    else:
        spec = env.spec(task.object)
        o = env.object_state(task.object).pos
        if mon.phase == "pick":
            # Point at the grasp, not the centre: the grasp height depends on the part.
            obs[5:8] = np.array([o[0], o[1], grasp_height(env, task.object)]) - tcp
        else:
            obs[5:8] = o - tcp
        obs[8:11] = env.target_point(task) - o
        obs[11] = spec.half_height
        obs[12] = spec.grasp_half_width
    obs[13] = env.grip_cmd
    obs[14 + PHASES.index(mon.phase)] = 1.0
    if task is not None and mon.phase != "done":
        obs[14 + len(PHASES) + min(task.index, MAX_TASKS - 1)] = 1.0
    return obs


def encode_action(target_pos, target_yaw, grip, tcp, yaw) -> np.ndarray:
    return np.array([*(np.asarray(target_pos) - tcp), wrap_period(target_yaw - yaw, np.pi), grip],
                    dtype=np.float32)


def chunk_labels(tcp: np.ndarray, yaw: np.ndarray, tgt_pos: np.ndarray, tgt_yaw: np.ndarray,
                 grip: np.ndarray, starts: np.ndarray, ends: np.ndarray, chunk: int = CHUNK) -> np.ndarray:
    """Per step t: the next `chunk` expert commands, relative to the TCP and yaw at t.

    Arrays are concatenated episodes; [starts[i], ends[i]) is episode i. Past an episode's end
    the last command repeats.
    """
    n = len(tcp)
    out = np.zeros((n, chunk, ACT_DIM), dtype=np.float32)
    for s, e in zip(starts, ends):
        for k in range(chunk):
            src = np.minimum(np.arange(s, e) + k, e - 1)
            out[s:e, k, 0:3] = tgt_pos[src] - tcp[s:e]
            dy = tgt_yaw[src] - yaw[s:e]
            out[s:e, k, 3] = (dy + np.pi / 2) % np.pi - np.pi / 2
            out[s:e, k, 4] = grip[src]
    return out
