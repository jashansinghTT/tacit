import numpy as np
import pytest

from tacit_sim.retarget import WORKSPACE_X, WORKSPACE_Y, Z_MAX, Z_MIN, retarget_wrist_path


def _camera_path(tilt_deg=30.0, n=60):
    """Wrist moving on a table seen by a camera tilted down by `tilt_deg` (OpenCV frame)."""
    t = np.linspace(0, 6, n)
    # Table coordinates: a (right), b (away from camera), h (up).
    a = 0.3 * np.cos(t)
    b = 0.15 * np.sin(t)
    h = 0.05 + 0.05 * (np.sin(2 * t) > 0)
    tilt = np.radians(tilt_deg)
    up = np.array([0, -np.cos(tilt), -np.sin(tilt)])       # table normal in camera frame
    away = np.array([0, -np.sin(tilt), np.cos(tilt)])
    right = np.array([1.0, 0, 0])
    origin = np.array([0.0, 0.4, 0.8])
    pts = origin + a[:, None] * right + b[:, None] * away + h[:, None] * up
    return pts, t, (a, b, h)


def test_retarget_fits_the_workspace():
    pts, t, (a, b, h) = _camera_path()
    out = retarget_wrist_path(pts, t)
    P = np.array(out["points"])
    assert P[:, 0].min() >= WORKSPACE_X[0] - 1e-6 and P[:, 0].max() <= WORKSPACE_X[1] + 1e-6
    assert P[:, 1].min() >= WORKSPACE_Y[0] - 1e-6 and P[:, 1].max() <= WORKSPACE_Y[1] + 1e-6
    assert P[:, 2].min() >= Z_MIN - 1e-9 and P[:, 2].max() <= Z_MAX + 1e-9
    assert out["times"][0] == 0.0 and len(out["times"]) == len(P)


def test_retarget_recovers_the_table_plane():
    pts, t, (a, b, h) = _camera_path(tilt_deg=40.0)
    out = retarget_wrist_path(pts, t)
    P = np.array(out["points"])
    s = out["scale"]
    # Image right maps to robot -y, away from the camera to +x, table height to z (same scale).
    assert np.corrcoef(P[:, 1], -a)[0, 1] > 0.98
    assert np.corrcoef(P[:, 0], b)[0, 1] > 0.98
    lifted = h > 0.075
    assert P[lifted, 2].mean() - P[~lifted, 2].mean() == pytest.approx(0.05 * s, rel=0.35)
    n = np.array(out["plane"]["normal_cam"])
    assert n @ np.array([0, -np.cos(np.radians(40)), -np.sin(np.radians(40))]) > 0.97


def test_retarget_drops_missing_frames():
    pts, t, _ = _camera_path()
    pts[5] = np.nan
    out = retarget_wrist_path(pts, t, grip=np.zeros(len(t)))
    assert len(out["points"]) == len(t) - 1 and len(out["grip"]) == len(t) - 1
    with pytest.raises(ValueError):
        retarget_wrist_path(pts[:1], t[:1])


def test_transform_maps_any_camera_point():
    pts, t, _ = _camera_path(tilt_deg=25.0)
    out = retarget_wrist_path(pts, t)
    tf = out["transform"]
    M = np.array(tf["matrix"])
    # The path is the smoothed wrist mapped by this affine: raw points land within the smoothing.
    mapped = np.c_[pts, np.ones(len(pts))] @ M.T
    mapped[:, 2] = np.clip(mapped[:, 2], *tf["z_clip"])
    assert np.abs(mapped - np.array(out["points"]))[3:-3].max() < 0.02
    # The component form agrees with the matrix.
    p = pts[10]
    X = p - np.array(tf["origin_cam"])
    comp = [tf["x_mid"] + (X @ tf["v"] - tf["v_mid"]) * tf["scale"],
            tf["y_mid"] - (X @ tf["u"] - tf["u_mid"]) * tf["scale"],
            tf["z_lift"] + (X @ tf["n"] - tf["h_min"]) * tf["scale"]]
    assert np.allclose(comp, M @ np.r_[p, 1.0], atol=1e-5)
