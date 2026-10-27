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

from .interactions import (CONTACT, CONTAINERS, IGNORE, ObjectTracker, best_contact, body_center, body_scale, box_dist,
                           center, contact_distance, faces_camera, fix_sides, hand_point)
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
            speed = math.hypot(x1 - x0, y1 - y0) / max(t1 - t0, 1e-3)   # px per second
            if speed > 0.08 * dg and (_hand_near(frames, i0, x0, y0, 0.2 * dg) or _hand_near(frames, i1, x1, y1, 0.2 * dg)
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


def _wrist_regions(frames: list[dict], a: int, b: int, side: str | None) -> tuple[str | None, str | None]:
    """Where the working hand starts and ends a segment, as bench regions."""
    pts = []
    for f in frames[a:b + 1]:
        h = next((h for h in f.get("hands", []) if side is None or h["side"] == side), None)
        if h:
            pts.append((h["lm2d"][0], f.get("size", [1280, 720])))
    if len(pts) < 2:
        return None, None
    (s, size), (e, _) = pts[0], pts[-1]
    return _region(s[0], s[1], size), _region(e[0], e[1], size)


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


def legacy_steps(frames: list[dict], max_steps: int = 8) -> list[dict]:
    """Steps from carried objects, else hand-activity valleys, else thirds: the fallback when no hand-object
    interaction is seen."""
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
            src, dst = _wrist_regions(frames, a, b, hand)
            draft = (f"Work with the {obj}" if obj else f"Move the {hand or 'working'} hand") + \
                    (f" from the {src} to the {dst}" if src and dst and src != dst else f" at the {src}" if src else "")
            steps.append({"i_start": a, "i_end": b, "objects": [obj] if obj else [], "hand": hand,
                          "draft": draft, "object": obj, "from": src, "to": dst})
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


# --------------------------------------------------------------------------------------------------------
# Steps as hand-object interactions
# --------------------------------------------------------------------------------------------------------
GAP = 0.8            # seconds a hand may leave an object and still be in the same interaction
MIN_EPISODE = 0.6    # shortest contact that counts as an interaction
FLICKER = 0.4        # a contact this short with another object, inside an interaction, is noise
REST = 0.25          # a hand that stays within this many shoulder widths and never approached is resting
MOVED = 0.25         # an object whose box centre moves this many shoulder widths was carried
SHIFTED = 0.15       # an object this far (shoulder widths) from where it rests is being handled
LIFTED = 0.3         # an object whose bottom is this far above the work surface is held up
WALK = 0.4           # the body moving faster than this (shoulder widths per second) is walking, not working
SITE = 0.6           # contacts of one hand within this distance of each other are one work site
ABSORB = 1.5         # seconds: touching things right before or after handling an object is part of that step
SETTLE = 1.5         # seconds: setting a handled object down and working on it this long is a step of its own


@dataclass
class Episode:
    """One hand working with one object: from the first to the last frame of contact."""

    side: str
    track: object
    i0: int
    i1: int
    t0: float
    t1: float
    n: int = 0          # frames in contact
    mouth: int = 0      # of them, at the container's opening
    engaged: int = 0    # of them, with the object off its resting place (moved or held up)
    resting: bool = False
    held: list = field(default_factory=list)   # frames where the object was off its resting place


def _runs(seq: list, times: list[float]) -> list[list]:
    """[id, i_first, i_last, n, n_mouth, n_engaged] runs of equal ids in ``seq`` of (id, mouth, engaged) | None,
    bridging gaps of up to GAP seconds."""
    runs: list[list] = []
    for i, c in enumerate(seq):
        if c is None:
            continue
        cid, mouth, eng = c
        if runs and runs[-1][0] == cid and times[i] - times[runs[-1][2]] <= GAP:
            r = runs[-1]
            r[2], r[3], r[4], r[5] = i, r[3] + 1, r[4] + int(mouth), r[5] + int(eng)
        else:
            runs.append([cid, i, i, 1, int(mouth), int(eng)])
    # a short contact with another object between two runs on the same object is noise
    changed = True
    while changed:
        changed = False
        for k in range(1, len(runs) - 1):
            a, b, c = runs[k - 1], runs[k], runs[k + 1]
            if (a[0] == c[0] != b[0] and times[b[2]] - times[b[1]] < FLICKER and times[c[1]] - times[a[2]] <= 2 * GAP):
                runs[k - 1:k + 2] = [[a[0], a[1], c[2], a[3] + c[3], a[4] + c[4], a[5] + c[5]]]
                changed = True
                break
    return runs


def walking(frames: list[dict], scale: float) -> np.ndarray:
    """Per frame: is the expert walking (the shoulders moving faster than WALK over one second)?"""
    t = np.array([f["t"] for f in frames], dtype=np.float64)
    c = np.array([bc if (bc := body_center(f)) is not None else (np.nan, np.nan) for f in frames], dtype=np.float64)
    out = np.zeros(len(frames), dtype=bool)
    for i in range(len(frames)):
        j, k = int(np.searchsorted(t, t[i] - 0.5)), min(len(frames) - 1, int(np.searchsorted(t, t[i] + 0.5)))
        if k > j and not (np.isnan(c[j, 0]) or np.isnan(c[k, 0])):
            out[i] = float(np.linalg.norm(c[k] - c[j])) / scale / max(t[k] - t[j], 1e-3) > WALK
    return out


def _support_y(tracks: list, n_frames: int) -> float | None:
    """The work surface's height in the image: the median bottom of the objects that stay put for most of the clip."""
    ys = [tr.rest_box()[3] for tr in tracks if len(tr.boxes) >= max(10, 0.3 * n_frames)]
    return float(np.median(ys)) if ys else None


def contact_episodes(frames: list[dict], scale: float | None = None) -> tuple[list[Episode], dict]:
    """Every hand-object interaction in ``frames`` (sides already fixed), and the context they were found in.

    Per frame, each hand works with the object it touches (or whose opening it is over). When it touches
    several, an object off its resting place (moved, or held up above the work surface) wins: in a
    cluttered scene the object being handled is the one that moves. Otherwise the smallest wins: a hand
    inside a big background box (a plant behind the bench) is about the small thing it holds.
    """
    scale = scale or body_scale(frames)
    tracker = ObjectTracker(scale)
    times = [f["t"] for f in frames]
    n = len(frames)
    present, points = [], {"left": np.full((n, 2), np.nan, dtype=np.float32), "right": np.full((n, 2), np.nan, dtype=np.float32)}
    for i, f in enumerate(frames):
        hands = [hand_point(hd) for hd in f.get("hands", [])]
        for hd, p in zip(f.get("hands", []), hands):
            if hd.get("side") in points:
                points[hd["side"]][i] = p
        present.append(tracker.update(i, f["t"], f.get("objects", []), hands))
    support = _support_y(tracker.tracks, n)
    rest = {tr.id: center(tr.rest_box()) for tr in tracker.tracks}
    fixture = {tr.id for tr in tracker.tracks if len(tr.boxes) >= 0.5 * n}

    def engaged(tr, box) -> bool:
        """Off its resting place: shifted by more than half its own size (boxes of big things jitter as hands pass),
        or, for something not in view all along, held up above the work surface (picked up)."""
        diag = math.hypot(box[2] - box[0], box[3] - box[1])
        if float(np.linalg.norm(center(box) - rest[tr.id])) >= max(SHIFTED * scale, 0.5 * diag):
            return True
        return tr.id not in fixture and support is not None and (support - box[3]) / scale >= LIFTED

    walk = walking(frames, scale)
    contacts = {"left": [None] * n, "right": [None] * n}
    for side in contacts:
        for i in range(n):
            p = points[side][i]
            if np.isnan(p[0]) or walk[i]:
                continue
            cands = []
            for tr, box in present[i]:
                d, mouth = contact_distance(p, box, tr.label, scale)
                if d <= CONTACT:
                    eng = engaged(tr, box)
                    rank = d if eng else (box[2] - box[0]) * (box[3] - box[1])
                    cands.append((not eng, rank, tr.id, mouth, eng))
            if cands:
                _, _, tid, mouth, eng = min(cands)
                contacts[side][i] = (tid, mouth, eng)
    by_id = {tr.id: tr for tr in tracker.tracks}
    episodes = []
    for side in ("left", "right"):
        for cid, i0, i1, cnt, mouth, eng in _runs(contacts[side], times):
            if times[i1] - times[i0] < MIN_EPISODE:
                continue
            ep = Episode(side, by_id[cid], i0, i1, times[i0], times[i1], cnt, mouth, eng)
            ep.held = [i for i in range(i0, i1 + 1) if contacts[side][i] is not None
                       and contacts[side][i][0] == cid and contacts[side][i][2]]
            ep.resting = _resting(ep, points[side], times, scale)
            episodes.append(ep)
    return sorted(episodes, key=lambda e: e.t0), {"scale": scale, "tracks": tracker.tracks, "points": points,
                                                   "times": times, "walking": walk}


def _resting(ep: Episode, pts: np.ndarray, times: list[float], scale: float) -> bool:
    """A hand that sat on the object without moving and without having reached for it (leaning, holding still)."""
    seg = pts[ep.i0:ep.i1 + 1]
    seg = seg[~np.isnan(seg[:, 0])]
    if len(seg) < 2:
        return True
    spread = float(np.max(np.linalg.norm(seg - np.median(seg, axis=0), axis=1))) / scale
    before = [i for i in range(ep.i0 - 1, -1, -1) if times[ep.i0] - times[i] <= 1.5 and not np.isnan(pts[i, 0])]
    approached = any(float(np.linalg.norm(pts[i] - pts[ep.i0])) / scale > REST for i in before)
    return spread < REST and not approached


def _object_motion(track, i0: int, i1: int, scale: float) -> dict:
    """How the object moved during [i0, i1]: displacement at the end, furthest excursion, and lift, in shoulder widths."""
    rest = track.box_near(i0, span=10) or track.rest_box()
    c0 = center(rest)
    cs = [(i, center(b)) for i, b in sorted(track.boxes.items()) if i0 <= i <= i1]
    if not cs:
        return {"end": 0.0, "max": 0.0, "lift": 0.0, "end_c": c0}
    d = [float(np.linalg.norm(c - c0)) / scale for _, c in cs]
    lift = max(0.0, float(max(c0[1] - c[1] for _, c in cs))) / scale
    return {"end": d[-1], "max": max(d), "lift": lift, "end_c": cs[-1][1]}


def _side_word(x: float, body_x: float | None, facing: bool, frame_w: float) -> str:
    """'your left' / 'your right' as the expert sees it."""
    ref = body_x if body_x is not None else frame_w / 2
    image_left = x < ref
    return "your right" if image_left == facing else "your left"


def _names(tracks: list, frames: list[dict], facing: bool) -> dict[int, str]:
    """A name per object: its label, plus which side of the expert it is on when two share a label."""
    counts = Counter(tr.label for tr in tracks if len(tr.boxes) >= 3)
    bx = [c[0] for f in frames for c in [body_center(f)] if c is not None]
    body_x = float(np.median(bx)) if bx else None
    w = (frames[0].get("size") or [1280, 720])[0] if frames else 1280
    out = {}
    for tr in tracks:
        name = tr.label
        if counts[tr.label] > 1:
            name = f"{tr.label} on {_side_word(center(tr.rest_box())[0], body_x, facing, w)}"
        out[tr.id] = name
    return out


def _target_near(point, tracks: list, i: int, exclude_id: int, names: dict, scale: float) -> str | None:
    best, best_d = None, 0.6 * scale
    for tr in tracks:
        if tr.id == exclude_id:
            continue
        b = tr.box_near(i, span=5)
        if b is None:
            continue
        d = box_dist(point, b)
        if d < best_d:
            best, best_d = names[tr.id], d
    return best


def _describe(kind: str, hand: str | None, obj: str | None, target: str | None) -> str:
    who = {"left": "the left hand", "right": "the right hand", "both": "both hands"}.get(hand or "", "one hand")
    if kind == "insert":
        return f"Push the item held in {who} into the {obj}"
    if kind == "move":
        return f"Pick up the {obj} with {who} and set it down " + (f"by the {target}" if target else "in a new place")
    if kind == "lift_return":
        return f"Lift the {obj} with {who}, hold it up to check it, and set it back"
    if kind in ("lift", "pick"):
        return f"Pick up the {obj} with {who} and hold it up"
    if kind == "place":
        return f"Set the {obj} down with {who}" + (f" by the {target}" if target else "") + " and straighten it"
    return f"Handle the {obj} with {who}"


def _born_in_hand(g: list[Episode], pts: dict, times: list[float], scale: float) -> float | None:
    """When the group's main object was first seen, if it was first seen in a hand (it had just been picked up)."""
    weight = Counter()
    for x in g:
        weight[x.track.id] += len(x.held) + 1
    tr = next(x.track for x in g if x.track.id == weight.most_common(1)[0][0])
    i = min(tr.boxes)
    hands = [pts[s][i] for s in pts if not np.isnan(pts[s][i][0])]
    return times[i] if any(box_dist(p, tr.boxes[i]) / scale <= CONTACT for p in hands) else None


def _group(active: list[Episode], pts: dict, times: list[float], scale: float) -> list[list[Episode]]:
    """Episodes that make one action: the two hands at once, the same object again soon, or one hand moving
    between neighbouring objects; then touches right before or after handling an object join that action."""
    def same_site(a: Episode, b: Episode) -> bool:
        if a.side != b.side or b.t0 - a.t1 > GAP:
            return False
        pa, pb = pts[a.side][a.i1], pts[b.side][b.i0]
        return not (np.isnan(pa[0]) or np.isnan(pb[0])) and float(np.linalg.norm(pa - pb)) / scale <= SITE

    groups: list[list[Episode]] = []
    for e in active:
        g = groups[-1] if groups else None
        if g is not None:
            g0, g1 = min(x.t0 for x in g), max(x.t1 for x in g)
            overlap = min(g1, e.t1) - max(g0, e.t0)
            same_obj = any(x.track.id == e.track.id for x in g) and e.t0 - g1 <= 2 * GAP
            if overlap >= 0.3 * min(e.t1 - e.t0, g1 - g0) or same_obj or same_site(g[-1], e):
                g.append(e)
                continue
        groups.append([e])

    def span(g):
        return min(x.t0 for x in g), max(x.t1 for x in g)

    def handled(g):
        return any(x.engaged for x in g)
    merged = True
    while merged:
        merged = False
        for k, g in enumerate(groups):
            if handled(g):
                continue
            g0, g1 = span(g)
            for nb in (k - 1, k + 1):
                if 0 <= nb < len(groups) and handled(groups[nb]):
                    h0, h1 = span(groups[nb])
                    if max(h0 - g1, g0 - h1) <= ABSORB:
                        groups[nb].extend(g)
                        del groups[k]
                        merged = True
                        break
            if merged:
                break
    # an object first seen already in a hand was picked up just before: the reach for it is the same step
    k = 1
    while k < len(groups):
        a, b = groups[k - 1], groups[k]
        born = _born_in_hand(b, pts, times, scale)
        if span(b)[0] - span(a)[1] <= ABSORB and born is not None and born >= span(a)[0]:
            a.extend(b)
            del groups[k]
            continue
        k += 1
    # a brief touch of something that stays put, without handling it, is not a step
    return [g for g in groups if span(g)[1] - span(g)[0] >= 1.0 or handled(g)]


def _split_set_down(g: list[Episode], times: list[float]) -> list[tuple[int, int, str | None]]:
    """(i0, i1, phase) parts of a group: a handled object set down, then worked on for SETTLE seconds or more,
    makes two steps (pick it up ...; set it down ...)."""
    i0, i1 = min(e.i0 for e in g), max(e.i1 for e in g)
    held = sorted(i for e in g for i in e.held)
    if not held:
        return [(i0, i1, None)]
    last = held[-1]
    if times[i1] - times[last] >= SETTLE and times[last] - times[i0] >= 1.0:
        return [(i0, last, "pick"), (min(last + 1, i1), i1, "place")]
    return [(i0, i1, None)]


def interaction_steps(frames: list[dict], max_steps: int = 12) -> list[dict]:
    """Steps from hand-object interactions (sides fixed from the pose). Empty when no interaction is seen."""
    frames = [fix_sides(f) for f in frames]
    scale = body_scale(frames)
    episodes, ctx = contact_episodes(frames, scale)
    active = [e for e in episodes if not e.resting]
    if not active:
        return []
    times = ctx["times"]
    facing = faces_camera(frames)
    names = _names(ctx["tracks"], frames, facing)
    steps = []
    for g in _group(active, ctx["points"], times, scale):
        for i0, i1, phase in _split_set_down(g, times):
            part = [e for e in g if e.i1 >= i0 and e.i0 <= i1]
            steps.append(_step(part, i0, i1, phase, frames, ctx, names, scale))
    # the same action on the same object, again: number the repeats
    k = 0
    while k < len(steps):
        j = k
        while j + 1 < len(steps) and (steps[j + 1]["kind"], steps[j + 1]["track"]) == (steps[k]["kind"], steps[k]["track"]):
            j += 1
        for r, s in enumerate(steps[k:j + 1], 1):
            s["repeat"], s["repeats"] = r, j - k + 1
        k = j + 1
    for s in steps:
        s["draft"] = _describe(s["kind"], s["hand"], s["object"], s.get("target"))
        if s["repeats"] > 1:
            s["draft"] += f" (time {s['repeat']} of {s['repeats']})"
    return steps[:max_steps]


def _step(part: list[Episode], i0: int, i1: int, phase: str | None, frames: list[dict], ctx: dict, names: dict,
          scale: float) -> dict:
    """One step from the episodes that cover frames [i0, i1]: who, with what, and which kind of action."""
    times = ctx["times"]
    dur = max(times[i1] - times[i0], 1e-3)

    def inside(e: Episode) -> float:
        return max(0.0, min(e.t1, times[i1]) - max(e.t0, times[i0]))
    per_side = Counter()
    for e in part:
        per_side[e.side] += inside(e)
    both = all(sum(inside(x) for x in part if x.side == s) >= 0.4 * dur for s in ("left", "right"))
    hand = "both" if both else per_side.most_common(1)[0][0]
    per_obj = Counter()
    for e in part:   # the object handled (moved, held up) is the step's object, then the one touched longest
        per_obj[e.track.id] += inside(e) + 4 * sum(1 for i in e.held if i0 <= i <= i1) / 10
    main = next(e.track for e in part if e.track.id == per_obj.most_common(1)[0][0])
    mouth = sum(e.mouth for e in part if e.track.id == main.id) / max(1, sum(e.n for e in part if e.track.id == main.id))
    mv = _object_motion(main, i0, i1, scale)
    if phase == "place":
        kind = "place"
    elif phase == "pick":
        kind = "pick"
    elif main.label in CONTAINERS and mouth >= 0.5 and mv["max"] < MOVED:
        kind = "insert"
    elif mv["end"] >= MOVED:
        kind = "move"
    elif mv["max"] >= MOVED:
        kind = "lift_return"
    elif mv["lift"] >= MOVED:
        kind = "lift"
    else:
        kind = "handle"
    target = None
    if kind in ("move", "place"):
        last = main.box_near(i1, span=10) or main.rest_box()
        target = _target_near(center(last), ctx["tracks"], i1, main.id, names, scale)
    others = [names[t] for t, _ in per_obj.most_common() if t != main.id]
    return {"i_start": i0, "i_end": i1, "hand": hand, "kind": kind, "object": names[main.id], "label": main.label,
            "track": main.id, "target": target,
            "objects": [names[main.id]] + [o for o in dict.fromkeys([target] + others) if o and o != names[main.id]]}


def segment_steps(frames: list[dict], max_steps: int = 12) -> list[dict]:
    """Steps with t_start, t_end, hand, objects, gaze_target, keyframe index and a draft for the writer.

    A step is a hand-object interaction (see ``interaction_steps``); without any, the legacy carried-object
    and hand-activity segmentation is used.
    """
    if not frames:
        return []
    raw = interaction_steps(frames, max_steps)
    if len(raw) < 2:
        return legacy_steps(frames)
    act = activity(frames)
    out = []
    for k, s in enumerate(raw):
        a, b = s["i_start"], s["i_end"]
        window = act[a:b + 1]
        key_i = a + int(np.argmin(np.abs(window - np.median(window)))) if len(window) else a
        gaze = _dominant(frames, a, b, lambda f: [f["gaze"]["target"]] if f.get("gaze") else [])
        out.append({"index": k + 1, "t_start": frames[a]["t"], "t_end": frames[b]["t"], "hand": s["hand"],
                    "objects": s["objects"], "gaze_target": gaze, "key_i": key_i, "draft": s["draft"],
                    "object": s["object"], "to": s.get("target"), "from": None, "action": s["kind"],
                    "repeat": s["repeat"], "repeats": s["repeats"]})
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
            hist = self.closures.setdefault(side, deque(maxlen=90))
            hist.append(ft["closure"])
            # Thresholds sit between this hand's own open and closed poses once both have been seen.
            open_ref, closed_ref = (np.percentile(hist, 90), np.percentile(hist, 10)) if len(hist) >= 10 else (1.8, 1.0)
            span = open_ref - closed_ref
            if span > 0.3:
                mid = (open_ref + closed_ref) / 2
                grasp_thr, release_thr = mid - 0.1 * span, mid + 0.1 * span
            else:
                grasp_thr, release_thr = 1.3, 1.5
            st = self.state.setdefault(side, {"held": None, "count": 0})
            obj = near_object(ft["center"], ft["size"], f.get("objects", []))
            if obj:
                self.step_objects[obj] += 1
            self.step_hand[side] += 1
            if st["held"] is None and obj and ft["closure"] < grasp_thr:
                st["count"] += 1
                if st["count"] >= 2:
                    st["held"], st["count"] = obj, 0
                    events.append({"type": "event", "t": t, "kind": "grasp", "hand": side, "object": obj})
            elif st["held"] is not None and ft["closure"] > release_thr:
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
