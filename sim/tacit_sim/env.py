"""Simulation environment: reset, 30 Hz control, state accessors and the task monitor.

The task monitor turns the program into phases the way a planner would: `pick <object>` until the
object is held and lifted, `place <target>` until it is released inside the target, then the
next task, then `done`. If a held object is dropped, the monitor goes back to `pick` (so policies
get a chance to recover). Policies see the current phase; they never see the scripted expert's
internal state.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import mujoco
import numpy as np

from .ik import IK, gripper_yaw, top_down, wrap_period
from .program import Layout, ObjectSpec, Task
from .scene import (CONTROL_HZ, FINGER_OPEN, HOME_QPOS, SPAWN_X, SPAWN_Y, SUBSTEPS,
                    build_model)

DT = 1.0 / CONTROL_HZ
BIN_FLOOR = 0.008          # top of a bin's floor slab
MIN_SEPARATION = 0.11      # between spawned object centres
LIFT_DETECT = 0.015        # a held object this far above its resting height counts as picked
HOME_TCP = np.array([0.42, 0.0, 0.32])
MAX_DQ = 2.4 * DT          # rad per control step
MAX_DYAW = 3.0 * DT        # rad per control step


@dataclass
class GraspInfo:
    """How to grasp an object as it lies now (upright, or knocked over)."""

    half_z: float          # centre to top (and to bottom), vertical
    half_width: float      # half the size the fingers close across
    yaw: float | None      # direction the fingers close along; None = any
    period: float          # yaw symmetry of the grasp (pi, pi/2), 0 = any yaw


@dataclass
class ObjectState:
    pos: np.ndarray
    quat: np.ndarray       # w, x, y, z
    yaw: float
    upright: bool


class TaskMonitor:
    def __init__(self, env: "SimEnv"):
        self.env = env
        self.reset()

    def reset(self) -> None:
        self.index = 0
        self.phase = "pick" if self.env.layout.tasks else "done"
        self.lost_steps = 0
        self.completed: list[int] = []
        self.regrasps = 0
        self.dropped: str | None = None

    @property
    def task(self) -> Task | None:
        tasks = self.env.layout.tasks
        return tasks[self.index] if self.index < len(tasks) else None

    @property
    def label(self) -> str:
        t = self.task
        if self.phase == "done" or t is None:
            return "done"
        if self.phase == "pick":
            return f"pick {t.object}"
        return f"place {t.target}" if t.target else f"put down {t.object}"

    def update(self) -> None:
        env, t = self.env, self.task
        if t is None:
            self.phase = "done"
            return
        o = env.object_state(t.object)
        held = env.is_grasped(t.object)
        if o.pos[2] < -0.1:
            self.dropped = t.object
        if self.phase == "pick":
            if held and o.pos[2] > env.rest_height(t.object) + LIFT_DETECT:
                self.phase = "place"
                self.lost_steps = 0
        elif self.phase == "place":
            g = env.grasp_info(t.object)
            clear = (env.finger_width() > 2 * g.half_width + 0.006
                     or env.tcp_pos()[2] > o.pos[2] + g.half_z + 0.015)
            if not held and env.in_target(t) and env.grip_cmd < 0.5 and clear:
                self.completed.append(t.index)
                self.index += 1
                self.phase = "pick" if self.task is not None else "done"
                self.lost_steps = 0
            elif not held and not env.in_target(t):
                # Dropped (or slipped) on the way: once it has come to rest, pick it up again.
                self.lost_steps += 1
                if self.lost_steps > 6 and np.linalg.norm(env.object_velocity(t.object)) < 0.05:
                    self.phase = "pick"
                    self.regrasps += 1
                    self.lost_steps = 0
            else:
                self.lost_steps = 0


class SimEnv:
    def __init__(self, program, seed: int = 0):
        self.model, self.layout, self.ids = build_model(program)
        self.data = mujoco.MjData(self.model)
        self.ik = IK(self.model, self.ids)
        self.monitor = TaskMonitor(self)
        self.rng = np.random.default_rng(seed)
        self.release_xy = self._release_slots()
        self._specs = {o.name: o for o in self.layout.objects}
        self.q_cmd = HOME_QPOS.copy()
        self.grip_cmd = 0.0
        self.t = 0.0
        self.steps = 0
        self._rest_z = {}
        self._start_xy = {}
        self.reset(seed)

    # ------------------------------------------------------------------ setup

    def _release_slots(self) -> dict[int, np.ndarray]:
        """Where each task drops its object: spread within a bin when several objects share it."""
        by_target: dict[str, list[Task]] = {}
        for t in self.layout.tasks:
            if t.target:
                by_target.setdefault(t.target, []).append(t)
        slots = {}
        for name, tasks in by_target.items():
            tgt = self.layout.target(name)
            n = len(tasks)
            r = tgt.inner_half
            if n <= 3:
                # In a row across the bin (long parts are released lengthwise along x).
                offs = [(0.0, 0.0)] if n == 1 else [(0.0, 0.6 * r * (1 - 2 * k / (n - 1))) for k in range(n)]
            else:
                offs = [(0.5 * r * sx, 0.5 * r * sy) for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1))]
                offs = [offs[k % 4] for k in range(n)]
            for t, (dx, dy) in zip(tasks, offs):
                slots[t.index] = np.array([tgt.pos[0] + dx, tgt.pos[1] + dy])
        return slots

    def reset(self, seed: int | None = None, arm_noise: float = 0.05) -> None:
        if seed is not None:
            self.rng = np.random.default_rng(seed)
        m, d, ids = self.model, self.data, self.ids
        mujoco.mj_resetData(m, d)
        q = HOME_QPOS + self.rng.uniform(-arm_noise, arm_noise, 7)
        d.qpos[ids.arm_qpos] = q
        d.qpos[ids.finger_qpos] = FINGER_OPEN
        placed: list[np.ndarray] = []
        for o in self.layout.objects:
            for _ in range(500):
                xy = np.array([self.rng.uniform(*SPAWN_X), self.rng.uniform(*SPAWN_Y)])
                if all(np.linalg.norm(xy - p) > MIN_SEPARATION for p in placed):
                    break
            placed.append(xy)
            yaw = self.rng.uniform(-math.pi, math.pi)
            a = ids.object_qpos[o.name]
            d.qpos[a:a + 3] = [xy[0], xy[1], o.half_height + 0.0005]
            d.qpos[a + 3:a + 7] = [math.cos(yaw / 2), 0, 0, math.sin(yaw / 2)]
            self._start_xy[o.name] = xy.copy()
        self.q_cmd = q.copy()
        self.grip_cmd = 0.0
        self._apply_ctrl()
        mujoco.mj_forward(m, d)
        # Let contacts settle.
        for _ in range(SUBSTEPS * 3):
            mujoco.mj_step(m, d)
        for o in self.layout.objects:
            self._rest_z[o.name] = float(d.xpos[ids.object_body[o.name]][2])
        self.t = 0.0
        self.steps = 0
        self.monitor.reset()

    # ------------------------------------------------------------------ state

    def spec(self, name: str) -> ObjectSpec:
        return self._specs[name]

    def tcp_pos(self) -> np.ndarray:
        return self.data.site_xpos[self.ids.tcp_site].copy()

    def tcp_rot(self) -> np.ndarray:
        return self.data.site_xmat[self.ids.tcp_site].reshape(3, 3).copy()

    def gripper_yaw(self) -> float:
        return gripper_yaw(self.tcp_rot())

    def finger_width(self) -> float:
        """Distance between the fingers (0 closed, 0.08 fully open)."""
        return float(np.sum(self.data.qpos[self.ids.finger_qpos]))

    def arm_qpos(self) -> np.ndarray:
        return self.data.qpos[self.ids.arm_qpos].copy()

    def qpos9(self) -> np.ndarray:
        return np.concatenate([self.arm_qpos(), self.data.qpos[self.ids.finger_qpos]])

    def object_state(self, name: str) -> ObjectState:
        b = self.ids.object_body[name]
        pos = self.data.xpos[b].copy()
        quat = self.data.xquat[b].copy()
        R = self.data.xmat[b].reshape(3, 3)
        upright = R[2, 2] > 0.9
        yaw = math.atan2(R[1, 0], R[0, 0])
        return ObjectState(pos, quat, yaw, upright)

    def object_velocity(self, name: str) -> np.ndarray:
        a = self.model.jnt_dofadr[self.model.body_jntadr[self.ids.object_body[name]]]
        return self.data.qvel[a:a + 3].copy()

    def rest_height(self, name: str) -> float:
        return self._rest_z.get(name, self.spec(name).half_height)

    def grasp_info(self, name: str) -> GraspInfo:
        o = self.spec(name)
        R = self.data.xmat[self.ids.object_body[name]].reshape(3, 3)
        if o.kind == "box":
            h = np.asarray(o.size)
            half_z = float(np.abs(R[2]) @ h)
            # Of the two most horizontal local axes, close across the shorter one.
            horiz = sorted(range(3), key=lambda i: abs(R[2, i]))[:2]
            i = min(horiz, key=lambda k: h[k])
            other = horiz[1] if horiz[0] == i else horiz[0]
            period = math.pi / 2 if abs(h[i] - h[other]) < 1e-6 else math.pi
            return GraspInfo(half_z, float(h[i]), math.atan2(R[1, i], R[0, i]), period)
        r, hz = o.size
        c = abs(R[2, 2])
        half_z = float(c * hz + math.sqrt(max(0.0, 1.0 - c * c)) * r)
        if c > 0.7:
            return GraspInfo(half_z, r, None, 0.0)
        # Lying down: close across the diameter, perpendicular to the axis.
        return GraspInfo(half_z, r, math.atan2(R[1, 2], R[0, 2]) + math.pi / 2, math.pi)

    def grasp_yaw(self, name: str, current: float | None = None) -> float:
        """Gripper yaw that closes the fingers across the object's grasp axis, nearest `current`."""
        current = self.gripper_yaw() if current is None else current
        g = self.grasp_info(name)
        if g.yaw is None:
            return current
        return current + wrap_period(g.yaw - current, g.period)

    def contacts_with(self, name: str) -> tuple[bool, bool]:
        geoms = self.ids.object_geoms[name]
        left, right = self.ids.finger_geoms["left"], self.ids.finger_geoms["right"]
        hit_l = hit_r = False
        for i in range(self.data.ncon):
            c = self.data.contact[i]
            g1, g2 = c.geom1, c.geom2
            if g1 in geoms:
                other = g2
            elif g2 in geoms:
                other = g1
            else:
                continue
            hit_l |= other in left
            hit_r |= other in right
        return hit_l, hit_r

    def is_grasped(self, name: str) -> bool:
        l, r = self.contacts_with(name)
        return l and r and self.grip_cmd > 0.5

    def target_point(self, task: Task) -> np.ndarray:
        """Where the task wants the object's centre when it is released."""
        half_z = self.grasp_info(task.object).half_z
        if task.target is None:
            xy = self._start_xy[task.object]
            return np.array([xy[0], xy[1], half_z + 0.012])
        xy = self.release_xy[task.index]
        return np.array([xy[0], xy[1], BIN_FLOOR + half_z + 0.012])

    def in_target(self, task: Task, name: str | None = None) -> bool:
        name = name or task.object
        p = self.object_state(name).pos
        if task.target is None:
            xy = self._start_xy[task.object]
            return np.linalg.norm(p[:2] - xy) < 0.04 and p[2] < self.rest_height(name) + 0.01
        tgt = self.layout.target(task.target)
        inside = np.all(np.abs(p[:2] - np.array(tgt.pos)) < tgt.inner_half - 0.005)
        # Bottom below the wall top: in the bin, even when resting on another part.
        return bool(inside and p[2] - self.grasp_info(name).half_z < BIN_FLOOR + tgt.wall_height)

    def final_tasks(self) -> list[Task]:
        """The last task for each object (where it should end up)."""
        last: dict[str, Task] = {}
        for t in self.layout.tasks:
            last[t.object] = t
        return list(last.values())

    def success(self) -> bool:
        return self.monitor.phase == "done" and all(self.in_target(t) for t in self.final_tasks())

    # ------------------------------------------------------------------ control

    def _apply_ctrl(self) -> None:
        self.data.ctrl[self.ids.arm_act] = self.q_cmd
        self.data.ctrl[self.ids.grip_act] = 255.0 * (1.0 - float(np.clip(self.grip_cmd, 0.0, 1.0)))

    def _advance(self) -> None:
        self._apply_ctrl()
        for _ in range(SUBSTEPS):
            mujoco.mj_step(self.model, self.data)
        self.t += DT
        self.steps += 1
        self.monitor.update()

    def step_ee(self, pos, yaw: float, grip: float) -> None:
        """Move the TCP toward `pos` with a top-down hand at `yaw`; grip 1 closes, 0 opens."""
        pos = np.asarray(pos, dtype=float)
        pos = np.array([np.clip(pos[0], 0.18, 0.78), np.clip(pos[1], -0.5, 0.5), np.clip(pos[2], 0.005, 0.6)])
        q = self.ik.solve(self.q_cmd, pos, top_down(self._resolve_yaw(yaw, pos)))
        # Joint speed limit (the real Panda's are 2.2 to 2.6 rad/s).
        self.q_cmd = self.q_cmd + np.clip(q - self.q_cmd, -MAX_DQ, MAX_DQ)
        self.grip_cmd = float(grip)
        self._advance()

    def step_joints(self, q, grip: float, max_step: float = 0.08) -> None:
        """Servo the arm to joint targets `q` (rate-limited per step); grip 1 closes."""
        q = np.clip(np.asarray(q, dtype=float), self.ik.lo, self.ik.hi)
        dq = np.clip(q - self.q_cmd, -max_step, max_step)
        self.q_cmd = self.q_cmd + dq
        self.grip_cmd = float(grip)
        self._advance()

    def _resolve_yaw(self, yaw: float, pos: np.ndarray) -> float:
        """Pick the hand yaw for a gripper yaw command at TCP position `pos`.

        The two fingers make yaw and yaw + pi the same grasp, but they are hand orientations
        half a turn apart and only one may be reachable within joint 7's range. Joint 7 sits
        mid-range when the hand yaw is about atan2(y, x) - pi/4 (measured over the workspace,
        within 0.2 rad). Keep the hand's current choice while it stays within pi/2 + 0.5 of that
        centre (hysteresis, so it never flips back and forth); otherwise take the centred one.
        """
        R = self.ik.fk(self.q_cmd)[1] @ top_down(0.0).T   # = Rz(full yaw)
        full = math.atan2(R[1, 0], R[0, 0])
        centre = math.atan2(pos[1], pos[0]) - math.pi / 4
        a = centre + wrap_period(yaw - centre, math.pi)
        b = a - math.pi if a > centre else a + math.pi
        near = min((a, b), key=lambda f: abs(wrap_period(f - full, 2 * math.pi)))
        pick = near if abs(wrap_period(near - centre, 2 * math.pi)) <= math.pi / 2 + 0.5 else a
        # Turn the hand at a bounded rate (a half-turn takes about a second).
        return full + float(np.clip(wrap_period(pick - full, 2 * math.pi), -MAX_DYAW, MAX_DYAW))

    def object_poses(self) -> list[dict]:
        out = []
        for o in self.layout.objects:
            s = self.object_state(o.name)
            out.append({"name": o.name, "pos": [round(float(v), 4) for v in s.pos],
                        "quat": [round(float(v), 4) for v in s.quat]})
        return out
