"""DROID conventions as GR00T N1.7 (embodiment `oxe_droid_relative_eef_relative_joint`) sees them.

Worked out against the model's shipped demo request (GET /demo on the GR00T server): the
request's `eef_9d` is reproduced exactly (position error 0, rot6d error 6e-8) from its
`joint_position` with the Menagerie Panda's forward kinematics as follows:

- xyz: the Panda hand frame origin (flange, 0.107 m past link 7) in the robot base frame.
- rot6d: the first two rows of a matrix built from link 7's orientation the way DROID's Euler
  angles reach GR00T: take R7 @ O (O permutes the axes), read intrinsic ZXY angles (a, b, c),
  rebuild with extrinsic yzx, i.e. Rx(c) Rz(b) Ry(a). GR00T itself reads rot6d as rows
  (Gram-Schmidt, `normalization.rot6d_to_matrix` in the port).

On the demo's predicted chunk the first steps of `eef_9d` agree with FK of the predicted
`joint_position` within a few millimetres (the two heads drift apart later in the chunk).
Gripper: 0 open, 1 closed.
"""

from __future__ import annotations

import math

import numpy as np

# The DROID reset posture (franka "home" used by the DROID platform).
DROID_HOME = np.array([0.0, -math.pi / 5, 0.0, -4 * math.pi / 5, 0.0, 3 * math.pi / 5, 0.0])

_O = np.array([[0.0, 1.0, 0.0], [0.0, 0.0, -1.0], [-1.0, 0.0, 0.0]])


def _rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def _ry(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def _rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def rot6d_from_link7(R7: np.ndarray) -> np.ndarray:
    F = np.asarray(R7) @ _O
    # Intrinsic ZXY: F = Rz(a) Rx(b) Ry(c).
    b = math.asin(float(np.clip(F[2, 1], -1.0, 1.0)))
    a = math.atan2(-F[0, 1], F[1, 1])
    c = math.atan2(-F[2, 0], F[2, 2])
    M = _rx(c) @ _rz(b) @ _ry(a)
    return np.concatenate([M[0], M[1]])


def eef_9d(hand_pos: np.ndarray, R7: np.ndarray) -> np.ndarray:
    return np.concatenate([np.asarray(hand_pos, dtype=float), rot6d_from_link7(R7)])


def gripper_position(finger_width: float) -> float:
    """Panda finger opening (0..0.08 m) to DROID's normalised gripper (0 open, 1 closed)."""
    return float(np.clip(1.0 - finger_width / 0.08, 0.0, 1.0))
