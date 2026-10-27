"""From per-frame tracks to events and steps.

Offline (`segment_steps`): a pick-and-place step shows up as an object whose box moves while a hand
is on it, so carried objects are the primary signal; hand-activity valleys are the fallback.
Live (`LiveSegmenter`): grasp and release from hand closure near an object, plus pauses, so the coach
can ask its question right after a step ends.
"""
from __future__ import annotations

import math
from collections import Counter, deque
from dataclasses import dataclass, field

import numpy as np

IGNORE = {"person", "dining table", "chair", "bench", "couch", "bed", "tv", "refrigerator", "oven", "sink", "toilet"}
CONTAINERS = {"bowl", "cup", "vase", "suitcase", "handbag", "backpack", "sink", "toilet", "wine glass", "bottle"}
TIPS = (8, 12, 16, 20)


def diag(size) -> float:
    return math.hypot(size[0], size[1])


def hand_feats(hd: dict) -> dict:
    lm = np.asarray(hd["lm2d"], dtype=np.float32)
    size = float(np.linalg.norm(lm[9] - lm[0])) or 1.0
    closure = float(np.mean([np.linalg.norm(lm[i] - lm[0]) for i in TIPS]) / size)
    pinch = float(np.linalg.norm(lm[4] - lm[8]) / size)
    return {"wrist": lm[0], "center": lm.mean(axis=0), "size": size, "closure": closure, "pinch": pinch}


def near_object(center, size: float, objects: list[dict]) -> str | None:
    best, best_d = None, 1e9
    for o in objects:
        if o["label"] in IGNORE:
            continue
        x1, y1, x2, y2 = o["box"]
        pad = 0.6 * size
        if x1 - pad <= center[0] <= x2 + pad and y1 - pad <= center[1] <= y2 + pad:
            cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
            d = math.hypot(cx - center[0], cy - center[1])
            if d < best_d:
                best, best_d = o["label"], d
    return best


def activity(frames: list[dict]) -> np.ndarray:
    """Per-frame hand speed (fraction of the frame diagonal per second), smoothed."""
    if not frames:
        return np.zeros(0)
    dg = diag(frames[0].get("size", [1280, 720]))
    last: dict[str, tuple[float, np.ndarray]] = {}
    act = np.zeros(len(frames))
    for i, f in enumerate(frames):
        best = 0.0
        for hd in f.get("hands", []):
            w = np.asarray(hd["lm2d"][0], dtype=np.float32)
            if hd["side"] in last:
                t0, w0 = last[hd["side"]]
                dt = max(f["t"] - t0, 1e-3)
                if dt < 0.6:
                    best = max(best, float(np.linalg.norm(w - w0)) / dg / dt)
            last[hd["side"]] = (f["t"], w)
        act[i] = best
    k = 5
    return np.convolve(act, np.ones(k) / k, mode="same")


@dataclass
class _Track:
    label: str
    points: list = field(default_factory=list)   # (t, cx, cy, frame_index)

    def last(self):
        return self.points[-1]


def object_tracks(frames: list[dict], max_gap: float = 2.0) -> list[_Track]:
    dg = diag(frames[0].get("size", [1280, 720])) if frames else 1.0
    tracks: list[_Track] = []
    for i, f in enumerate(frames):
        for o in f.get("objects", []):
            if o["label"] in IGNORE or o["score"] < 0.4:
                continue
            cx, cy = (o["box"][0] + o["box"][2]) / 2, (o["box"][1] + o["box"][3]) / 2
            cands = [tr for tr in tracks if tr.label == o["label"] and f["t"] - tr.last()[0] <= max_gap
                     and tr.last()[3] != i]
            match = min(cands, key=lambda tr: math.hypot(tr.last()[1] - cx, tr.last()[2] - cy), default=None)
            if match is not None and math.hypot(match.last()[1] - cx, match.last()[2] - cy) < 0.35 * dg:
                match.points.append((f["t"], cx, cy, i))
            else:
                tracks.append(_Track(o["label"], [(f["t"], cx, cy, i)]))
    return [tr for tr in tracks if len(tr.points) >= 3]


def _region(x: float, y: float, size) -> str:
    w, h = size
    horiz = "left" if x < w / 3 else "right" if x > 2 * w / 3 else "middle"
    return f"{horiz} of the bench"


def _target_at(frames: list[dict], i: int, x: float, y: float, exclude: str) -> str:
    best, best_d = None, 1e9
    for o in frames[i].get("objects", []):
        if o["label"] in IGNORE or o["label"] == exclude:
            continue
        cx, cy = (o["box"][0] + o["box"][2]) / 2, (o["box"][1] + o["box"][3]) / 2
        d = math.hypot(cx - x, cy - y)
        bonus = 0.5 if o["label"] in CONTAINERS else 1.0
        if d * bonus < best_d:
            best, best_d = o["label"], d * bonus
    dg = diag(frames[i].get("size", [1280, 720]))
    if best is not None and best_d < 0.18 * dg:
        return best
    return _region(x, y, frames[i].get("size", [1280, 720]))


def _hand_near(frames: list[dict], i: int, x: float, y: float, radius: float) -> str | None:
    for hd in frames[i].get("hands", []):
        c = np.mean(np.asarray(hd["lm2d"], dtype=np.float32), axis=0)
        if math.hypot(c[0] - x, c[1] - y) < radius:
            return hd["side"]
    return None


def carried_intervals(frames: list[dict]) -> list[dict]:
    """Objects that moved while a hand was near them: (label, t_start, t_end, from, to, hand)."""
    if not frames:
        return []
    size = frames[0].get("size", [1280, 720])
    dg = diag(size)
    out = []
    for tr in object_tracks(frames):
        pts = tr.points
        moving = []
        for (t0, x0, y0, i0), (t1, x1, y1, i1) in zip(pts, pts[1:]):
            disp = math.hypot(x1 - x0, y1 - y0)
            if disp > 0.04 * dg and (_hand_near(frames, i0, x0, y0, 0.2 * dg) or _hand_near(frames, i1, x1, y1, 0.2 * dg)
                                     or t1 - t0 > 0.5):
                moving.append((t0, x0, y0, i0, t1, x1, y1, i1))
        if not moving:
            continue
        groups = [[moving[0]]]
        for m in moving[1:]:
            if m[0] - groups[-1][-1][4] <= 1.0:
                groups[-1].append(m)
            else:
                groups.append([m])
        for g in groups:
            ts, xs, ys, i_s = g[0][0], g[0][1], g[0][2], g[0][3]
            te, xe, ye, i_e = g[-1][4], g[-1][5], g[-1][6], g[-1][7]
            if math.hypot(xe - xs, ye - ys) < 0.08 * dg:
                continue
            hand = _hand_near(frames, i_s, xs, ys, 0.25 * dg) or _hand_near(frames, i_e, xe, ye, 0.25 * dg)
            out.append({"label": tr.label, "t_start": ts, "t_end": te, "from": [xs, ys], "to": [xe, ye],
                        "hand": hand, "i_start": i_s, "i_end": i_e,
                        "target": _target_at(frames, i_e, xe, ye, tr.label),
                        "source": _region(xs, ys, size)})
    out.sort(key=lambda c: c["t_start"])
    merged: list[dict] = []
    for c in out:
        if merged and c["label"] == merged[-1]["label"] and c["t_start"] - merged[-1]["t_end"] < 1.0:
            merged[-1].update(t_end=c["t_end"], to=c["to"], i_end=c["i_end"], target=c["target"])
        else:
            merged.append(c)
    return merged


def activity_segments(frames: list[dict], act: np.ndarray, min_len: float = 1.5) -> list[tuple[int, int]]:
    if len(frames) < 4:
        return [(0, len(frames) - 1)] if frames else []
    thr = max(0.02, float(np.percentile(act, 40)))
    active = act > thr
    segs, start = [], None
    for i, a in enumerate(active):
        if a and start is None:
            start = i
        elif not a and start is not None:
            segs.append((start, i - 1))
            start = None
    if start is not None:
        segs.append((start, len(frames) - 1))
    segs = [s for s in segs if frames[s[1]]["t"] - frames[s[0]]["t"] >= min_len * 0.5]
    merged: list[list[int]] = []
    for a, b in segs:
        if merged and frames[a]["t"] - frames[merged[-1][1]]["t"] < 0.6:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    return [(a, b) for a, b in merged if frames[b]["t"] - frames[a]["t"] >= min_len]


def _dominant(frames: list[dict], a: int, b: int, key) -> str | None:
    c = Counter(v for f in frames[a:b + 1] for v in key(f) if v)
    return c.most_common(1)[0][0] if c else None


def _objects_near_hands(f: dict) -> list[str]:
    out = []
    for hd in f.get("hands", []):
        ft = hand_feats(hd)
        lbl = near_object(ft["center"], ft["size"], f.get("objects", []))
        if lbl:
            out.append(lbl)
    return out


def segment_steps(frames: list[dict], max_steps: int = 8) -> list[dict]:
    """Steps with t_start, t_end, hand, objects, gaze_target, keyframe index and a draft title."""
    if not frames:
        return []
    act = activity(frames)
    steps = []
    carried = carried_intervals(frames)
    if len(carried) >= 2:
        for c in carried[:max_steps]:
            a = max(0, c["i_start"] - 4)
            b = min(len(frames) - 1, c["i_end"] + 3)
            steps.append({"i_start": a, "i_end": b, "objects": [c["label"]] + ([c["target"]] if " bench" not in c["target"] else []),
                          "hand": c["hand"], "draft": f"Move the {c['label']} to the {c['target']}",
                          "from": c["source"], "to": c["target"], "object": c["label"]})
    else:
        for a, b in activity_segments(frames, act)[:max_steps]:
            obj = _dominant(frames, a, b, _objects_near_hands)
            hand = _dominant(frames, a, b, lambda f: [h["side"] for h in f.get("hands", [])])
            steps.append({"i_start": a, "i_end": b, "objects": [obj] if obj else [], "hand": hand,
                          "draft": f"Work with the {obj}" if obj else "Hand movement", "object": obj})
    if len(steps) < 2 and len(frames) > 20:
        n = 3
        edges = np.linspace(0, len(frames) - 1, n + 1).astype(int)
        steps = []
        for a, b in zip(edges, edges[1:]):
            obj = _dominant(frames, a, b, _objects_near_hands)
            hand = _dominant(frames, a, b, lambda f: [h["side"] for h in f.get("hands", [])])
            steps.append({"i_start": int(a), "i_end": int(b), "objects": [obj] if obj else [], "hand": hand,
                          "draft": f"Work with the {obj}" if obj else "Continue the task", "object": obj})
    out = []
    for k, s in enumerate(steps):
        a, b = s["i_start"], s["i_end"]
        mid_window = act[a:b + 1]
        key_i = a + int(np.argmin(np.abs(mid_window - np.median(mid_window)))) if len(mid_window) else a
        gaze = _dominant(frames, a, b, lambda f: [f["gaze"]["target"]] if f.get("gaze") else [])
        out.append({"index": k + 1, "t_start": frames[a]["t"], "t_end": frames[b]["t"], "hand": s.get("hand"),
                    "objects": [o for o in s["objects"] if o], "gaze_target": gaze, "key_i": key_i,
                    "draft": s["draft"], "object": s.get("object"), "to": s.get("to"), "from": s.get("from")})
    return out


class LiveSegmenter:
    """Incremental events for live capture: grasp, release, look, pause, and step boundaries."""

    def __init__(self):
        self.state: dict[str, dict] = {}
        self.closures: dict[str, deque] = {}
        self.last_active_t: float | None = None
        self.active_since: float | None = None
        self.gaze_target: str | None = None
        self.gaze_since: float = 0.0
        self.step_start: float = 0.0
        self.step_objects: Counter = Counter()
        self.step_hand: Counter = Counter()
        self.last_wrist: dict[str, tuple[float, np.ndarray]] = {}
        self.steps_closed = 0
        self.last_step_end = 0.0

    def _close_step(self, t: float, why: str, target: str | None = None) -> dict | None:
        if t - self.step_start < 1.2:
            return None
        obj = self.step_objects.most_common(1)[0][0] if self.step_objects else None
        hand = self.step_hand.most_common(1)[0][0] if self.step_hand else None
        self.steps_closed += 1
        step = {"index": self.steps_closed, "t_start": round(self.step_start, 2), "t_end": round(t, 2), "hand": hand,
                "objects": [o for o in (obj, target) if o], "gaze_target": self.gaze_target, "why_closed": why,
                "draft": (f"Move the {obj} to the {target}" if obj and target else f"Work with the {obj}" if obj else "Hand movement")}
        self.step_start = t
        self.last_step_end = t
        self.step_objects.clear()
        self.step_hand.clear()
        return step

    def update(self, f: dict) -> list[dict]:
        t = f["t"]
        events: list[dict] = []
        dg = diag(f.get("size", [1280, 720]))
        moving = False
        for hd in f.get("hands", []):
            side = hd["side"]
            ft = hand_feats(hd)
            if side in self.last_wrist:
                t0, w0 = self.last_wrist[side]
                if 0 < t - t0 < 0.6 and float(np.linalg.norm(ft["wrist"] - w0)) / dg / (t - t0) > 0.06:
                    moving = True
            self.last_wrist[side] = (t, ft["wrist"])
            hist = self.closures.setdefault(side, deque(maxlen=60))
            hist.append(ft["closure"])
            lo, hi = (np.percentile(hist, 30), np.percentile(hist, 70)) if len(hist) >= 10 else (1.25, 1.6)
            st = self.state.setdefault(side, {"held": None, "count": 0})
            obj = near_object(ft["center"], ft["size"], f.get("objects", []))
            if obj:
                self.step_objects[obj] += 1
            self.step_hand[side] += 1
            if st["held"] is None and obj and ft["closure"] < min(lo, 1.45):
                st["count"] += 1
                if st["count"] >= 2:
                    st["held"], st["count"] = obj, 0
                    events.append({"type": "event", "t": t, "kind": "grasp", "hand": side, "object": obj})
            elif st["held"] is not None and ft["closure"] > max(hi, 1.5):
                st["count"] += 1
                if st["count"] >= 2:
                    held, st["held"], st["count"] = st["held"], None, 0
                    target = obj if obj and obj != held else None
                    events.append({"type": "event", "t": t, "kind": "release", "hand": side, "object": held, "target": target})
                    step = self._close_step(t, "release", target)
                    if step:
                        events.append({"type": "step", "step": step})
            else:
                st["count"] = 0
        if moving:
            self.last_active_t = t
            self.active_since = self.active_since or t
        elif self.last_active_t is not None and t - self.last_active_t > 1.2 and self.active_since is not None:
            if self.last_active_t - self.active_since > 1.5 and t - self.last_step_end > 2.0:
                events.append({"type": "event", "t": t, "kind": "pause"})
                step = self._close_step(t, "pause")
                if step:
                    events.append({"type": "step", "step": step})
            self.active_since = None
        g = (f.get("gaze") or {}).get("target")
        if g and g != self.gaze_target and t - self.gaze_since > 0.5:
            self.gaze_target, self.gaze_since = g, t
            events.append({"type": "event", "t": t, "kind": "look", "object": g})
        return events

    def finish(self, t: float) -> dict | None:
        return self._close_step(t, "stop")
