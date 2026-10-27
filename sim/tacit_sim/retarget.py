"""Map an expert's wrist path from the camera frame into the robot's workspace.

Input: wrist positions in metres in the camera frame (OpenCV: x right, y down, z forward), as
HaMeR's `cam_t_full` gives them, with timestamps. The hands move over a table, so the path is
mostly spread across the table plane with smaller vertical motion:

1. Fit the table plane: the path's two main directions (PCA) span it; the normal is the third,
   flipped to point up (toward the camera's -y).
2. Express the path in plane coordinates: u (image-right direction projected on the plane),
   v (away from the camera, on the plane) and h (height above the path's lowest point).
3. Scale u and v uniformly to fit the robot's workspace rectangle and centre it; scale height
   by the same factor and clamp it between a safe minimum and maximum TCP height.

Image right maps to the robot's -y (the camera faces the expert as the robot faces the table),
and away from the camera maps to +x. A light smoothing removes tracking jitter.
"""

from __future__ import annotations

import numpy as np

WORKSPACE_X = (0.32, 0.62)
WORKSPACE_Y = (-0.26, 0.26)
Z_MIN, Z_MAX = 0.03, 0.40
Z_LIFT = 0.04          # the path's lowest point sits this far above the table


def _smooth(p: np.ndarray, k: int = 5) -> np.ndarray:
    if len(p) < k:
        return p
    pad = k // 2
    q = np.pad(p, ((pad, pad), (0, 0)), mode="edge")
    kern = np.ones(k) / k
    return np.stack([np.convolve(q[:, i], kern, mode="valid") for i in range(p.shape[1])], axis=1)


def retarget_wrist_path(points_xyz, times, grip=None) -> dict:
    """Return {"times", "points" (robot frame, metres, z up), "grip" (or None), "scale", "plane"}.

    `points_xyz` (N x 3) and `times` (N) may contain NaN rows for frames without a hand; those
    are dropped. `grip` (optional, N values in 0..1) passes through, e.g. from grasp events.
    """
    P = np.asarray(points_xyz, dtype=float).reshape(-1, 3)
    T = np.asarray(times, dtype=float).reshape(-1)
    if len(P) != len(T):
        raise ValueError("points_xyz and times must have the same length")
    G = None if grip is None else np.asarray(grip, dtype=float).reshape(-1)
    ok = np.all(np.isfinite(P), axis=1) & np.isfinite(T)
    P, T = P[ok], T[ok]
    G = G[ok] if G is not None else None
    if len(P) < 2:
        raise ValueError("need at least two valid wrist points")
    order = np.argsort(T)
    P, T = P[order], T[order]
    G = G[order] if G is not None else None
    P = _smooth(P)

    c = P.mean(0)
    X = P - c
    if len(P) >= 3 and np.linalg.matrix_rank(X) >= 2:
        _, _, vt = np.linalg.svd(X, full_matrices=False)
        normal = vt[-1] if vt.shape[0] == 3 else np.cross(vt[0], vt[1])
    else:
        normal = np.array([0.0, -1.0, 0.0])
    normal /= np.linalg.norm(normal)
    if normal[1] > 0:          # point up: toward the camera's -y
        normal = -normal
    # In-plane axes: u from the camera's x, v from its z (away from the camera).
    u = np.array([1.0, 0.0, 0.0]) - normal * normal[0]
    if np.linalg.norm(u) < 1e-6:
        u = np.array([0.0, 0.0, 1.0]) - normal * normal[2]
    u /= np.linalg.norm(u)
    v = np.cross(normal, u)
    if v[2] < 0:
        v = -v
    pu, pv, ph = X @ u, X @ v, X @ normal
    ph = ph - ph.min()

    span_u = max(np.ptp(pu), 1e-6)
    span_v = max(np.ptp(pv), 1e-6)
    s = min((WORKSPACE_Y[1] - WORKSPACE_Y[0]) / span_u, (WORKSPACE_X[1] - WORKSPACE_X[0]) / span_v, 1.5)
    x = (WORKSPACE_X[0] + WORKSPACE_X[1]) / 2 + (pv - (pv.max() + pv.min()) / 2) * s
    y = -((pu - (pu.max() + pu.min()) / 2) * s)
    z = np.clip(Z_LIFT + ph * s, Z_MIN, Z_MAX)
    pts = np.stack([x, y, z], axis=1)
    return {
        "times": (T - T[0]).round(4).tolist(),
        "points": pts.round(4).tolist(),
        "grip": None if G is None else np.clip(G, 0, 1).round(3).tolist(),
        "scale": round(float(s), 4),
        "plane": {"normal_cam": normal.round(4).tolist(), "origin_cam": c.round(4).tolist()},
    }


class PathFollower:
    """Follow a retargeted path with the TCP (top-down hand) at the path's own timing."""

    def __init__(self, path: dict):
        self.t = np.asarray(path["times"], dtype=float)
        self.p = np.asarray(path["points"], dtype=float)
        g = path.get("grip")
        self.g = None if g is None else np.asarray(g, dtype=float)
        self.duration = float(self.t[-1])
        self.errors: list[float] = []

    def target(self, t: float) -> tuple[np.ndarray, float]:
        t = min(max(t, 0.0), self.duration)
        pos = np.array([np.interp(t, self.t, self.p[:, i]) for i in range(3)])
        grip = 0.0 if self.g is None else float(np.interp(t, self.t, self.g) > 0.5)
        return pos, grip
