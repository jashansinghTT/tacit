"""Damped least squares IK for the Panda TCP (the point between the fingertip pads)."""

from __future__ import annotations

import math

import mujoco
import numpy as np

from .scene import HOME_QPOS, SceneIds

# Hand orientation at yaw 0: hand z points down, the fingers close along world x.
# Columns are the hand's x, y, z axes in world coordinates.
R_TOP_DOWN = np.array([[0.0, 1.0, 0.0],
                       [1.0, 0.0, 0.0],
                       [0.0, 0.0, -1.0]])


def rot_z(a: float) -> np.ndarray:
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def top_down(yaw: float) -> np.ndarray:
    """Hand rotation for a top-down grasp whose fingers close along direction `yaw` in xy."""
    return rot_z(yaw) @ R_TOP_DOWN


def gripper_yaw(R: np.ndarray) -> float:
    """Direction the fingers close along (the hand's y axis) projected on the table, in (-pi/2, pi/2]."""
    y = R[:, 1]
    return wrap_period(math.atan2(y[1], y[0]), math.pi)


def wrap_period(a: float, period: float) -> float:
    """Wrap an angle into (-period/2, period/2]."""
    if period <= 0:
        return 0.0
    a = (a + period / 2) % period - period / 2
    return period / 2 if a == -period / 2 else a


class IK:
    """Iterative DLS on a private MjData so the simulation state is never touched."""

    def __init__(self, model: mujoco.MjModel, ids: SceneIds, damping: float = 0.015):
        self.m = model
        self.ids = ids
        self.d = mujoco.MjData(model)
        self.damping = damping
        self.jacp = np.zeros((3, model.nv))
        self.jacr = np.zeros((3, model.nv))
        jids = [model.joint(f"panda_joint{i}").id for i in range(1, 8)]
        rng = model.jnt_range[jids]
        margin = 0.03
        self.lo = rng[:, 0] + margin
        self.hi = rng[:, 1] - margin
        # Null-space pull toward a comfortable posture; joint 7 is left free (it sets the yaw).
        self.rest = HOME_QPOS.copy()
        self.null_w = np.array([0.6, 0.3, 0.6, 0.3, 0.6, 0.3, 0.0])

    def fk(self, q: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        self.d.qpos[self.ids.arm_qpos] = q
        mujoco.mj_kinematics(self.m, self.d)
        s = self.ids.tcp_site
        return self.d.site_xpos[s].copy(), self.d.site_xmat[s].reshape(3, 3).copy()

    def solve(self, q0: np.ndarray, pos: np.ndarray, rot: np.ndarray | None = None,
              iters: int = 6, max_dq: float = 0.12, tol: float = 1e-4) -> np.ndarray:
        q = np.clip(np.asarray(q0, dtype=float).copy(), self.lo, self.hi)
        dof = self.ids.arm_dof
        s = self.ids.tcp_site
        err = np.zeros(6)
        quat_des = np.zeros(4)
        quat_cur = np.zeros(4)
        quat_err = np.zeros(4)
        if rot is not None:
            mujoco.mju_mat2Quat(quat_des, np.ascontiguousarray(rot).ravel())
        for _ in range(iters):
            self.d.qpos[self.ids.arm_qpos] = q
            mujoco.mj_kinematics(self.m, self.d)
            mujoco.mj_comPos(self.m, self.d)
            err[:3] = pos - self.d.site_xpos[s]
            mujoco.mj_jacSite(self.m, self.d, self.jacp, self.jacr, s)
            if rot is not None:
                mujoco.mju_mat2Quat(quat_cur, self.d.site_xmat[s])
                mujoco.mju_negQuat(quat_cur, quat_cur)
                mujoco.mju_mulQuat(quat_err, quat_des, quat_cur)
                mujoco.mju_quat2Vel(err[3:], quat_err, 1.0)
                J = np.vstack([self.jacp[:, dof], self.jacr[:, dof]])
                e = err
            else:
                J = self.jacp[:, dof]
                e = err[:3]
            if np.linalg.norm(e) < tol:
                break
            JJt = J @ J.T + (self.damping ** 2) * np.eye(J.shape[0])
            dq = J.T @ np.linalg.solve(JJt, e)
            # Null-space posture term.
            J_pinv = J.T @ np.linalg.inv(JJt)
            N = np.eye(7) - J_pinv @ J
            dq += N @ (self.null_w * (self.rest - q)) * 0.1
            n = np.max(np.abs(dq))
            if n > max_dq:
                dq *= max_dq / n
            q = np.clip(q + dq, self.lo, self.hi)
        return q
