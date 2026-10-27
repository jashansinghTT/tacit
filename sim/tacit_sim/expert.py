"""Scripted pick and place expert.

It is a pure state-feedback controller: every action is computed from the current state and
the monitor's phase, with no internal timers. That matters for demonstration collection with
noise injection (DART): wherever the noise pushes the arm, the expert's label is the right
correction from there, so the policy learns recoveries.

Shape of the motion: a funnel. The hover height above the goal shrinks with the horizontal
error, so the TCP travels high, aligns, then descends straight down. Grasps are top-down with
the fingers closing across the object's short side.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .env import DT, HOME_TCP, SimEnv
from .ik import wrap_period

V_MAX = 0.40          # m/s, free-space travel
V_FINE = 0.12         # m/s, final approach and descent
HOVER = 0.10          # m above the grasp point while travelling to an object
CARRY_CLEARANCE = 0.10  # m, held object's bottom above the table while carrying
OPEN_W = 0.08


@dataclass
class Action:
    pos: np.ndarray     # TCP target, world frame
    yaw: float          # gripper yaw goal (SimEnv.step_ee turns the hand toward it at a bounded rate)
    grip: float         # 1 close, 0 open

    def as_delta(self, tcp: np.ndarray, yaw_now: float) -> np.ndarray:
        return np.array([*(self.pos - tcp), wrap_period(self.yaw - yaw_now, np.pi), self.grip])


def grasp_height(env: SimEnv, name: str) -> float:
    """TCP height for a grasp: about 2 cm below the object's top, fingertips clear of the table."""
    o = env.spec(name)
    top = env.object_state(name).pos[2] + o.half_height
    return max(0.018, top - 0.022)


def _step_toward(cur: np.ndarray, goal: np.ndarray, vmax: float, gain: float = 0.35) -> np.ndarray:
    d = goal - cur
    n = np.linalg.norm(d)
    if n < 1e-9:
        return goal.copy()
    step = min(vmax * DT, gain * n + 0.0015)
    return cur + d * min(1.0, step / n)


def _funnel(tcp: np.ndarray, goal: np.ndarray, hover: float, xy_tol: float, yaw_err: float) -> np.ndarray:
    """Intermediate goal: above `goal` by an amount that grows with horizontal and yaw error."""
    xy_err = np.linalg.norm(goal[:2] - tcp[:2])
    lift = min(hover, max(0.0, xy_err - xy_tol) * 2.0 + abs(yaw_err) * 0.25)
    z_goal = goal[2] + lift
    if tcp[2] < z_goal - 0.02 and xy_err > 0.03:
        # Too low to travel: rise first, mostly vertically, so nothing on the table gets swept.
        return np.array([tcp[0] + 0.15 * (goal[0] - tcp[0]), tcp[1] + 0.15 * (goal[1] - tcp[1]), z_goal])
    return np.array([goal[0], goal[1], z_goal])


class ScriptedExpert:
    def __init__(self, env: SimEnv):
        self.env = env

    def act(self) -> Action:
        env = self.env
        mon = env.monitor
        tcp = env.tcp_pos()
        yaw = env.gripper_yaw()
        width = env.finger_width()
        task = mon.task

        if mon.phase == "done" or task is None:
            return Action(_step_toward(tcp, HOME_TCP, V_MAX), natural_yaw(tcp), 0.0)

        name = task.object
        spec = env.spec(name)
        obj = env.object_state(name)

        if mon.phase == "pick":
            g = np.array([obj.pos[0], obj.pos[1], grasp_height(env, name)])
            # Of the grasp's symmetric yaws, aim for the one nearest a relaxed wrist at the part.
            yaw_goal = env.grasp_yaw(name, natural_yaw(obj.pos))
            yaw_err = wrap_period(yaw_goal - yaw, np.pi)
            xy_err = np.linalg.norm(g[:2] - tcp[:2])
            z_err = tcp[2] - g[2]
            obj_w = 2 * spec.grasp_half_width
            between = xy_err < 0.018 and abs(z_err) < 0.02
            if between and width < obj_w + 0.005 and env.grip_cmd > 0.5:
                # Closed on the object: lift straight up.
                return Action(tcp + np.array([0.0, 0.0, V_FINE * DT * 1.5]), yaw, 1.0)
            if between and env.grip_cmd > 0.5 and width < OPEN_W - 0.004:
                # Fingers are closing: hold still.
                return Action(tcp.copy(), yaw, 1.0)
            if xy_err < 0.006 and abs(z_err) < 0.006 and abs(yaw_err) < 0.08:
                return Action(tcp.copy(), yaw, 1.0)
            # Approach with the gripper open (a missed grasp opens it again).
            sub = _funnel(tcp, g, HOVER, 0.008, yaw_err)
            near = xy_err < 0.03 and tcp[2] < g[2] + 0.05
            nxt = _step_toward(tcp, sub, V_FINE if near else V_MAX)
            return Action(nxt, yaw_goal, 0.0)

        # place: carry the held object over its release point, lower it and open.
        goal_c = env.target_point(task)                 # object centre at release
        offset = tcp - obj.pos                          # held object relative to the TCP
        g = goal_c + offset                             # TCP at release
        bottom = obj.pos[2] - spec.half_height
        carry = max(0.0, CARRY_CLEARANCE - (goal_c[2] - spec.half_height))
        xy_err = np.linalg.norm(goal_c[:2] - obj.pos[:2])
        z_err = bottom - (goal_c[2] - spec.half_height)
        if env.grip_cmd < 0.5 or (xy_err < 0.012 and z_err < 0.008):
            # Release (and keep it released while the fingers open).
            return Action(tcp.copy(), yaw, 0.0)
        sub = _funnel(tcp - offset, goal_c, carry, 0.01, 0.0) + offset
        near = xy_err < 0.03
        nxt = _step_toward(tcp, sub, V_FINE * 1.5 if near else V_MAX)
        # The part's yaw does not matter in a bin: turn the hand toward a relaxed wrist instead.
        return Action(nxt, natural_yaw(tcp), 1.0)


def natural_yaw(p: np.ndarray) -> float:
    """Gripper yaw that keeps the Panda's wrist (joint 7) mid-range at TCP position p."""
    return float(np.arctan2(p[1], p[0]) - np.pi / 4)

