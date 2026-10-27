"""Hands, objects and contacts: what a step is made of.

A step is a hand-object interaction: a hand reaches an object, or the opening of a container, stays
with it and leaves. These are the primitives both the offline segmentation and the live segmenter
build steps from. Distances are in units of the expert's shoulder width (``scale``), so the same
thresholds hold at any camera distance.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

IGNORE = {"person", "dining table", "chair", "bench", "couch", "bed", "tv", "refrigerator", "oven", "sink", "toilet"}
CONTAINERS = {"bowl", "cup", "vase", "suitcase", "handbag", "backpack", "sink", "toilet", "wine glass", "bottle"}

L_SHOULDER, R_SHOULDER, L_WRIST, R_WRIST, NOSE = 11, 12, 15, 16, 0
CONTACT = 0.3        # a hand within this many shoulder widths of an object's box works with it
MOUTH = 1.5          # a hand above a container's opening, up to this many container heights, works with it too
MOUTH_MIN = 0.5      # ... when the container is at least this tall (shoulder widths): a hand puts things into a vase
                     # from above, but over a small cup it is just passing by
HAND_TO_SCALE = 1.7  # shoulder width / hand box width (median over the sample clips), when no pose is seen


def box_dist(p, box) -> float:
    """Pixels from point ``p`` to ``box`` (0 inside)."""
    dx = max(box[0] - p[0], 0.0, p[0] - box[2])
    dy = max(box[1] - p[1], 0.0, p[1] - box[3])
    return math.hypot(dx, dy)


def iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def center(box) -> np.ndarray:
    return np.array([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], dtype=np.float32)


def hand_point(hd: dict) -> np.ndarray:
    """Where a hand works: the mean of its landmarks (palm and fingers)."""
    return np.asarray(hd["lm2d"], dtype=np.float32).mean(axis=0)


def _pose_xy(f: dict, k: int) -> np.ndarray | None:
    lm = (f.get("pose") or {}).get("lm2d")
    if not lm or len(lm) <= k:
        return None
    return np.asarray(lm[k][:2], dtype=np.float32)


def fix_sides(f: dict) -> dict:
    """The frame with each hand's side taken from the body pose: the hand belongs to the nearer pose wrist.

    MediaPipe's handedness label is unreliable on camera footage (on the sample clips it named the
    other hand nearly every time); the pose model's wrists say which arm a hand is on.
    """
    hands = f.get("hands") or []
    lw, rw = _pose_xy(f, L_WRIST), _pose_xy(f, R_WRIST)
    if not hands or lw is None or rw is None:
        return f
    wrists = [np.asarray(h["lm2d"][0], dtype=np.float32) for h in hands[:2]]

    def d(i, w):
        return float(np.linalg.norm(wrists[i] - w))
    if len(wrists) == 1:
        sides = ["left" if d(0, lw) <= d(0, rw) else "right"]
    else:
        keep = d(0, lw) + d(1, rw) <= d(0, rw) + d(1, lw)
        sides = ["left", "right"] if keep else ["right", "left"]
    return {**f, "hands": [{**h, "side": s} for h, s in zip(hands, sides)] + list(hands[2:])}


def body_scale(frames: list[dict]) -> float:
    """The expert's shoulder width in pixels (median over the clip); from hand boxes when no pose is seen."""
    sw = [float(np.linalg.norm(a - b)) for f in frames
          for a, b in [(_pose_xy(f, L_SHOULDER), _pose_xy(f, R_SHOULDER))] if a is not None and b is not None]
    if len(sw) >= 3:
        return max(float(np.median(sw)), 1.0)
    bw = [h["bbox"][2] - h["bbox"][0] for f in frames for h in f.get("hands", []) if h.get("bbox")]
    if bw:
        return max(HAND_TO_SCALE * float(np.median(bw)), 1.0)
    size = frames[0].get("size", [1280, 720]) if frames else [1280, 720]
    return 0.18 * size[0]


def body_center(f: dict) -> np.ndarray | None:
    a, b = _pose_xy(f, L_SHOULDER), _pose_xy(f, R_SHOULDER)
    return None if a is None or b is None else (a + b) / 2


def faces_camera(frames: list[dict]) -> bool:
    """True when the expert faces the camera (their right hand is on the image's left)."""
    seen = [(f["pose"]["lm2d"][NOSE][2] if len(f["pose"]["lm2d"][NOSE]) > 2 else 1.0)
            for f in frames if (f.get("pose") or {}).get("lm2d")]
    vis = float(np.median(seen)) if seen else 1.0
    if vis < 0.5:
        return False
    # facing the camera, the expert's left shoulder is on the image's right
    xs = [(_pose_xy(f, L_SHOULDER)[0] - _pose_xy(f, R_SHOULDER)[0]) for f in frames if (f.get("pose") or {}).get("lm2d")]
    return float(np.median(xs)) > 0 if xs else True


@dataclass
class ObjectTrack:
    """One physical object across frames (detections of one label, linked by position)."""

    id: int
    label: str
    boxes: dict = field(default_factory=dict)   # frame index -> box
    last_i: int = -1
    last_t: float = -1e9
    score: float = 0.0

    @property
    def last_box(self):
        return self.boxes[self.last_i]

    def rest_box(self):
        """Where the object sits: the median of its boxes."""
        return list(np.median(np.asarray(list(self.boxes.values()), dtype=np.float32), axis=0))

    def box_near(self, i: int, span: int = 3):
        """Its box at frame ``i``, or at the nearest frame within ``span`` (occluded by the hand, say)."""
        for k in range(span + 1):
            for j in (i - k, i + k):
                if j in self.boxes:
                    return self.boxes[j]
        return None


class ObjectTracker:
    """Links detections into ObjectTracks frame by frame (incremental, so the live segmenter can use it).

    A handled object keeps its identity: a detection that appears where a recently lost object of the same
    label used to rest is that object put back (``revive`` seconds), and one that appears at a hand right
    after the hand's object vanished is that object being carried (detections drop out while it moves).
    """

    def __init__(self, scale: float, max_gap: float = 2.0, hold: float = 0.8, min_score: float = 0.35,
                 revive: float = 6.0, carry: float = 1.5):
        self.scale, self.max_gap, self.hold, self.min_score = scale, max_gap, hold, min_score
        self.revive, self.carry = revive, carry
        self.tracks: list[ObjectTrack] = []
        self._home: dict[int, np.ndarray] = {}   # where each track was first seen (its resting place)

    def _link(self, o: dict, c: np.ndarray, reach: float, t: float, taken: set, hands: list) -> ObjectTrack | None:
        """An unmatched detection: a lost object put back at its place, or one being carried by a hand."""
        lost = [tr for tr in self.tracks if tr.label == o["label"] and tr.id not in taken and tr.last_t < t]
        put_back = max(reach, math.hypot(o["box"][2] - o["box"][0], o["box"][3] - o["box"][1]), 0.3 * self.scale)
        home = [(float(np.linalg.norm(self._home[tr.id] - c)), tr) for tr in lost
                if t - tr.last_t <= self.revive and float(np.linalg.norm(self._home[tr.id] - c)) < put_back]
        if home:
            return min(home, key=lambda x: x[0])[1]
        for p in hands:
            if box_dist(p, o["box"]) / self.scale > CONTACT:
                continue
            near = [(float(np.linalg.norm(center(tr.last_box) - p)), tr) for tr in lost if t - tr.last_t <= self.carry]
            near = [x for x in near if x[0] / self.scale <= 2 * CONTACT + 0.5]
            if near:
                return min(near, key=lambda x: x[0])[1]
        return None

    def update(self, i: int, t: float, objects: list[dict], hands: list | None = None) -> list[tuple[ObjectTrack, list]]:
        """Add frame ``i``'s detections (``hands``: the hand points in this frame); returns the (track, box) pairs
        present now (a track seen within ``hold`` seconds stays present at its last box: hands hide what they hold)."""
        dets = sorted((o for o in objects if o["label"] not in IGNORE and o.get("score", 1.0) >= self.min_score),
                      key=lambda o: -o.get("score", 1.0))
        kept: list[dict] = []
        for o in dets:   # one box per object: drop near-duplicates of a stronger box
            if not any(k["label"] == o["label"] and iou(k["box"], o["box"]) > 0.5 for k in kept):
                kept.append(o)
        taken: set[int] = set()
        for o in kept:
            c = center(o["box"])
            diag = math.hypot(o["box"][2] - o["box"][0], o["box"][3] - o["box"][1])
            reach = max(0.6 * diag, 0.25 * self.scale)
            best, best_d = None, reach
            for tr in self.tracks:
                if tr.label != o["label"] or tr.id in taken or t - tr.last_t > self.max_gap:
                    continue
                dd = float(np.linalg.norm(center(tr.last_box) - c))
                if dd < best_d:
                    best, best_d = tr, dd
            if best is None:
                best = self._link(o, c, reach, t, taken, hands or [])
            if best is None:
                best = ObjectTrack(len(self.tracks), o["label"])
                self.tracks.append(best)
                self._home[best.id] = c
            best.boxes[i] = list(o["box"])
            best.last_i, best.last_t = i, t
            best.score = max(best.score, o.get("score", 1.0))
            taken.add(best.id)
        return [(tr, tr.boxes[i] if tr.id in taken else tr.last_box) for tr in self.tracks
                if tr.id in taken or 0 <= t - tr.last_t <= self.hold]


def contact_distance(p, box, label: str, scale: float) -> tuple[float, bool]:
    """Distance (shoulder widths) from a hand point to an object, and whether it is the container-opening kind:
    for a container, the space above its opening counts as the object (putting something in)."""
    d = box_dist(p, box) / scale
    if label in CONTAINERS and (box[3] - box[1]) / scale >= MOUTH_MIN:
        x1, y1, x2, y2 = box
        h = y2 - y1
        dm = box_dist(p, (x1, y1 - MOUTH * h, x2, y1 + 0.2 * h)) / scale
        if dm < d and p[1] < y1:
            return dm, True
    return d, False


def pick_contact(p, present: list[tuple[ObjectTrack, list]], scale: float, engaged) -> tuple | None:
    """The object a hand at ``p`` works with, as (track, via_opening, engaged), or None.

    When it touches several, one off its resting place (``engaged(track, box)``: moved, or held up) wins: in
    clutter, the object being handled is the one that moves. Otherwise the smallest wins: a hand inside a big
    background box (a plant behind the bench) is about the small thing it holds."""
    cands = []
    for tr, box in present:
        d, mouth = contact_distance(p, box, tr.label, scale)
        if d <= CONTACT:
            eng = engaged(tr, box)
            rank = d if eng else (box[2] - box[0]) * (box[3] - box[1])
            cands.append((not eng, rank, tr.id, tr, mouth, eng))
    if not cands:
        return None
    _, _, _, tr, mouth, eng = min(cands, key=lambda c: c[:3])
    return tr, mouth, eng
