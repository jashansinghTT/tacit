"""VGGT-based verification (is this a real, rigid scene?) and the 3D digital twin of the expert."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np

from ..models import vision
from ..models.base import encode_jpeg
from .video import frame_at

V = 518  # VGGT's square working resolution


# --------------------------------------------------------------------------- helpers
def to_518(x: float, y: float, pp: dict) -> tuple[float, float]:
    return x * pp["scale_x"] + pp["pad_left"], y * pp["scale_y"] + pp["pad_top"]


def from_518(u: np.ndarray, v: np.ndarray, pp: dict) -> tuple[np.ndarray, np.ndarray]:
    return (u - pp["pad_left"]) / pp["scale_x"], (v - pp["pad_top"]) / pp["scale_y"]


def valid_mask(pp: dict) -> np.ndarray:
    m = np.zeros((V, V), dtype=bool)
    x0, y0 = int(pp["pad_left"]), int(pp["pad_top"])
    m[y0:y0 + int(pp["resized_h"]), x0:x0 + int(pp["resized_w"])] = True
    return m


def person_mask(frame: dict | None, pp: dict, dilate: float = 0.25) -> np.ndarray:
    """True where the person (pose landmarks and hand boxes) is, in 518 coordinates."""
    m = np.zeros((V, V), dtype=bool)
    if not frame:
        return m
    boxes = [hd["bbox"] for hd in frame.get("hands", [])]
    pose = frame.get("pose")
    if pose:
        pts = np.array([[p[0], p[1]] for p in pose["lm2d"] if p[2] > 0.3], dtype=np.float32)
        if len(pts):
            boxes.append([float(pts[:, 0].min()), float(pts[:, 1].min()), float(pts[:, 0].max()), float(pts[:, 1].max())])
    for x1, y1, x2, y2 in boxes:
        w, h = x2 - x1, y2 - y1
        x1, y1, x2, y2 = x1 - dilate * w, y1 - dilate * h, x2 + dilate * w, y2 + dilate * h
        u1, v1 = to_518(x1, y1, pp)
        u2, v2 = to_518(x2, y2, pp)
        m[max(0, int(v1)):min(V, int(v2) + 1), max(0, int(u1)):min(V, int(u2) + 1)] = True
    return m


def nearest_frame(frames: list[dict], t: float) -> dict | None:
    return min(frames, key=lambda f: abs(f["t"] - t)) if frames else None


# --------------------------------------------------------------------------- verification
async def reconstruct(video: Path, times: list[float]) -> tuple[dict, list[np.ndarray], dict]:
    imgs = [frame_at(video, t) for t in times]
    imgs = [im for im in imgs if im is not None]
    b64 = [encode_jpeg(im, max_width=640)[0] for im in imgs]
    res, sb = await vision.vggt(b64)
    return res, imgs, sb


def consistency(res: dict, frames: list[dict], times: list[float]) -> dict:
    """Cross-view checks on the static scene (person masked out).

    reproj: view-0 world points projected into each other view vs that view's own depth (median relative error).
    stability: per-pixel depth change between views after a median scale match (for a fixed camera).
    drift: camera centre spread relative to scene depth.
    """
    depth, dconf = res["depth"], res["depth_conf"]
    wp = res["world_points"]
    ext, intr = res["extrinsic"], res["intrinsic"]
    pps = res["preprocess"]["per_view"]
    S = depth.shape[0]
    masks = []
    for i in range(S):
        m = valid_mask(pps[i]) & ~person_mask(nearest_frame(frames, times[i]), pps[i])
        c = dconf[i]
        m &= c > np.percentile(c[m], 40) if m.any() else m
        masks.append(m)

    rng = np.random.default_rng(0)
    reproj = []
    ys, xs = np.nonzero(masks[0])
    if len(xs):
        pick = rng.choice(len(xs), size=min(6000, len(xs)), replace=False)
        P = wp[0][ys[pick], xs[pick]]                     # world (= camera 0) points
        for i in range(1, S):
            R, t = ext[i][:, :3], ext[i][:, 3]
            Pc = P @ R.T + t
            z = Pc[:, 2]
            ok = z > 1e-4
            u = intr[i][0, 0] * Pc[ok, 0] / z[ok] + intr[i][0, 2]
            v = intr[i][1, 1] * Pc[ok, 1] / z[ok] + intr[i][1, 2]
            ui, vi = np.round(u).astype(int), np.round(v).astype(int)
            inb = (ui >= 0) & (ui < V) & (vi >= 0) & (vi < V)
            ui, vi, zz = ui[inb], vi[inb], z[ok][inb]
            keep = masks[i][vi, ui]
            if keep.sum() > 50:
                d = depth[i][vi[keep], ui[keep]]
                reproj.append(float(np.median(np.abs(zz[keep] - d) / np.maximum(d, 1e-4))))
    stab = []
    for i in range(1, S):
        m = masks[0] & masks[i]
        if m.sum() > 200:
            a, b = depth[0][m], depth[i][m]
            b = b * (np.median(a) / max(np.median(b), 1e-6))
            stab.append(float(np.median(np.abs(a - b) / np.maximum(a, 1e-4))))
    centers = [-(e[:, :3].T @ e[:, 3]) for e in ext]
    scene_depth = float(np.median(depth[0][masks[0]])) if masks[0].any() else 1.0
    drift = float(max(np.linalg.norm(c - centers[0]) for c in centers) / max(scene_depth, 1e-6))
    r = float(np.median(reproj)) if reproj else 1.0
    s = float(np.median(stab)) if stab else 1.0
    score = 0.6 * max(0.0, 1 - r / 0.12) + 0.4 * max(0.0, 1 - s / 0.12)
    return {"views": int(S), "reproj_rel": round(r, 4), "depth_stability": round(1 - s, 4), "camera_drift": round(drift, 4),
            "static_pixels": int(masks[0].sum()), "score": round(score, 3)}


def verdict(score: float) -> str:
    return "verified" if score >= 0.6 else "suspect"


def pick_times(duration: float, n: int = 4) -> list[float]:
    lo, hi = 0.08 * duration, 0.92 * duration
    return [round(lo + (hi - lo) * k / (n - 1), 2) for k in range(n)] if n > 1 else [duration / 2]


# --------------------------------------------------------------------------- twin
POSE_SHOULDERS = (11, 12)
POSE_WRISTS = {"left": 15, "right": 16}


def _camera(res: dict | None, size: tuple[int, int]) -> tuple[float, float, float]:
    w, h = size
    if res is not None:
        pp = res["preprocess"]["per_view"][0]
        K = res["intrinsic"][0]
        f = float(K[0, 0]) / pp["scale_x"]
        cx = (float(K[0, 2]) - pp["pad_left"]) / pp["scale_x"]
        cy = (float(K[1, 2]) - pp["pad_top"]) / pp["scale_y"]
        return f, cx, cy
    return 1.1 * max(w, h), w / 2, h / 2


def _person_depth(frames: list[dict], f: float) -> float:
    zs = []
    for fr in frames:
        p = fr.get("pose")
        if not p:
            continue
        a, b = p["lm2d"][POSE_SHOULDERS[0]], p["lm2d"][POSE_SHOULDERS[1]]
        if min(a[2], b[2]) < 0.5:
            continue
        d = math.hypot(a[0] - b[0], a[1] - b[1])
        if d > 10:
            zs.append(f * 0.36 / d)
    return float(np.median(zs)) if zs else 1.2


def _scene_scale(res: dict, frames: list[dict], times: list[float], z_person: float) -> float:
    """Metres per VGGT unit, from the person's torso depth in view 0."""
    pp = res["preprocess"]["per_view"][0]
    fr = nearest_frame(frames, times[0])
    d0 = res["depth"][0]
    if fr and fr.get("pose"):
        lm = fr["pose"]["lm2d"]
        pts = [lm[i] for i in (11, 12, 23, 24) if lm[i][2] > 0.4]
        if pts:
            vals = []
            for x, y, _ in pts:
                u, v = to_518(x, y, pp)
                if 0 <= int(v) < V and 0 <= int(u) < V:
                    vals.append(d0[int(v), int(u)])
            if vals and np.median(vals) > 1e-4:
                return z_person / float(np.median(vals))
    m = valid_mask(pp)
    return z_person * 1.3 / max(float(np.median(d0[m])), 1e-4)


def _backproject(x: float, y: float, z: float, cam) -> list[float]:
    f, cx, cy = cam
    return [(x - cx) * z / f, (y - cy) * z / f, z]


def build_twin(frames: list[dict], res: dict | None, times: list[float], images: list[np.ndarray],
               size: tuple[int, int]) -> tuple[dict, bytes]:
    """Twin JSON (y up, metres, origin near the bench) and the packed point cloud."""
    cam = _camera(res, size)
    f = cam[0]
    z_person = _person_depth(frames, f)
    scale = _scene_scale(res, frames, times, z_person) if res is not None else 1.0
    pp0 = res["preprocess"]["per_view"][0] if res is not None else None
    d0 = res["depth"][0] * scale if res is not None else None

    def scene_depth(x: float, y: float, default: float) -> float:
        if d0 is None:
            return default
        u, v = to_518(x, y, pp0)
        ui, vi = int(round(u)), int(round(v))
        if 0 <= ui < V and 0 <= vi < V and d0[vi, ui] > 1e-3:
            return float(d0[vi, ui])
        return default

    out_frames = []
    all_pts = []
    for fr in frames:
        body = None
        pose = fr.get("pose")
        if pose:
            body = []
            for (x, y, vis), (wx, wy, wz) in zip(pose["lm2d"], pose["world"]):
                body.append(_backproject(x, y, max(0.2, z_person + wz), cam))
        hands = {"left": None, "right": None}
        for hd in fr.get("hands", []):
            lm = hd["lm2d"]
            world = hd["world"]
            zw = None
            if hd.get("cam_t") and hd.get("hamer_focal") and hd.get("hamer_scale"):
                zw = hd["cam_t"][2] * (f * hd["hamer_scale"]) / hd["hamer_focal"]
                if not (0.15 < zw < 4.0):
                    zw = None
            if zw is None and pose:
                k = POSE_WRISTS[hd["side"]]
                zw = max(0.2, z_person + pose["world"][k][2])
            if zw is None:
                zw = z_person * 0.85
            w0z = world[0][2]
            hands[hd["side"]] = [_backproject(x, y, max(0.15, zw + (wz - w0z)), cam) for (x, y), (_, _, wz) in zip(lm, world)]
        gaze = None
        g = fr.get("gaze")
        if g and body:
            head = np.mean([body[i] for i in range(11)], axis=0).tolist()
            gaze = {"origin": head, "target": _backproject(g["x"], g["y"], scene_depth(g["x"], g["y"], z_person * 1.1), cam),
                    "label": g.get("target")}
        objs = []
        for o in fr.get("objects", []):
            if o["label"] in ("person", "dining table", "chair"):
                continue
            cx, cy = (o["box"][0] + o["box"][2]) / 2, (o["box"][1] + o["box"][3]) / 2
            objs.append({"label": o["label"], "pos": _backproject(cx, cy, scene_depth(cx, cy, z_person * 1.1), cam),
                         "size": [(o["box"][2] - o["box"][0]) * z_person / f, (o["box"][3] - o["box"][1]) * z_person / f]})
        out_frames.append({"t": fr["t"], "body": body, "hands": hands, "gaze": gaze, "objects": objs})
        if body:
            all_pts.extend(body)

    cloud = np.zeros((0, 6), dtype=np.float32)
    if res is not None and images:
        wp = res["world_points"][0] * scale
        conf = res["world_points_conf"][0] if "world_points_conf" in res else res["depth_conf"][0]
        m = valid_mask(pp0) & (conf > np.percentile(conf[valid_mask(pp0)], 30))
        vs, us = np.nonzero(m)
        if len(us) > 60000:
            sel = np.random.default_rng(1).choice(len(us), 60000, replace=False)
            vs, us = vs[sel], us[sel]
        xo, yo = from_518(us.astype(np.float32), vs.astype(np.float32), pp0)
        img = images[0]
        xi = np.clip(np.round(xo).astype(int), 0, img.shape[1] - 1)
        yi = np.clip(np.round(yo).astype(int), 0, img.shape[0] - 1)
        rgb = img[yi, xi].astype(np.float32) / 255.0
        cloud = np.concatenate([wp[vs, us], rgb], axis=1).astype(np.float32)

    # OpenCV camera frame -> y up, z toward the viewer; centre on the hands' working area.
    def conv(p):
        return [p[0], -p[1], -p[2]]

    hand_pts = [h for fr in out_frames for side in ("left", "right") if fr["hands"][side] for h in fr["hands"][side]]
    ref = np.median(np.array(hand_pts or all_pts or [[0, 0, z_person]]), axis=0)
    origin = np.array(conv(ref))

    def tx(p):
        if p is None:
            return None
        c = np.array(conv(p)) - origin
        return [round(float(c[0]), 4), round(float(c[1]), 4), round(float(c[2]), 4)]

    for fr in out_frames:
        fr["body"] = [tx(p) for p in fr["body"]] if fr["body"] else None
        for side in ("left", "right"):
            if fr["hands"][side]:
                fr["hands"][side] = [tx(p) for p in fr["hands"][side]]
        if fr["gaze"]:
            fr["gaze"]["origin"], fr["gaze"]["target"] = tx(fr["gaze"]["origin"]), tx(fr["gaze"]["target"])
        for o in fr["objects"]:
            o["pos"] = tx(o["pos"])
    if len(cloud):
        cloud[:, 1] *= -1
        cloud[:, 2] *= -1
        cloud[:, :3] -= origin.astype(np.float32)
    pts = np.array([p for fr in out_frames for p in (fr["body"] or [])] + ([c for c in cloud[:, :3].tolist()] if len(cloud) else []))
    bounds = {"min": pts.min(axis=0).round(3).tolist(), "max": pts.max(axis=0).round(3).tolist()} if len(pts) else \
        {"min": [-1, -1, -1], "max": [1, 1, 1]}
    twin = {"fps": 10, "frames": out_frames, "bounds": bounds, "up": [0, 1, 0],
            "camera": {"f": round(f, 1), "cx": round(cam[1], 1), "cy": round(cam[2], 1), "person_depth_m": round(z_person, 3),
                       "position": tx([0.0, 0.0, 0.0])}}
    return twin, cloud.astype("<f4").tobytes()
