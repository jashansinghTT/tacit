"""Motion-only previews: the expert's skeleton, hands and parts drawn on a dark canvas, no video pixels.

Listings use these instead of video frames, so a buyer never sees the expert's face.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

BG = (18, 13, 11)          # BGR of #0b0d12
ACCENT = (255, 225, 77)    # BGR of #4de1ff
HAND = (212, 245, 124)     # BGR of #7cf5d4
PART = (110, 211, 255)     # BGR of #ffd36e
GRID = (40, 33, 28)
POSE_EDGES = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24)]
HAND_EDGES = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8), (5, 9), (9, 10), (10, 11), (11, 12),
              (9, 13), (13, 14), (14, 15), (15, 16), (13, 17), (17, 18), (18, 19), (19, 20), (0, 17)]


def render(frame: dict, width: int = 640, trail: list[dict] | None = None) -> np.ndarray:
    w, h = frame.get("size", [1280, 720])
    s = width / w
    H = int(round(h * s))
    img = np.full((H, width, 3), BG, np.uint8)
    for x in range(0, width, 32):
        cv2.line(img, (x, 0), (x, H), GRID, 1)
    for y in range(0, H, 32):
        cv2.line(img, (0, y), (width, y), GRID, 1)

    def P(p):
        return int(round(p[0] * s)), int(round(p[1] * s))

    for o in frame.get("objects", []):
        if o["label"] in ("person", "dining table", "chair"):
            continue
        x1, y1, x2, y2 = (int(round(v * s)) for v in o["box"])
        cv2.rectangle(img, (x1, y1), (x2, y2), PART, 1, cv2.LINE_AA)
        cv2.putText(img, o["label"], (x1 + 4, max(12, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.42, PART, 1, cv2.LINE_AA)
    for prev in trail or []:  # faint wrist trails
        for hd in prev.get("hands", []):
            cv2.circle(img, P(hd["lm2d"][0]), 2, (110, 120, 60), -1, cv2.LINE_AA)
    pose = frame.get("pose")
    if pose:
        lm = pose["lm2d"]
        for a, b in POSE_EDGES:
            if lm[a][2] > 0.4 and lm[b][2] > 0.4:
                cv2.line(img, P(lm[a]), P(lm[b]), ACCENT, 2, cv2.LINE_AA)
        face = [lm[i] for i in range(11) if lm[i][2] > 0.4]
        if face:  # the head as a plain circle: position only, no likeness
            c = np.mean([[p[0], p[1]] for p in face], axis=0)
            cv2.circle(img, P(c), int(0.045 * width), ACCENT, 2, cv2.LINE_AA)
    for hd in frame.get("hands", []):
        pts = [P(p) for p in hd["lm2d"]]
        for a, b in HAND_EDGES:
            cv2.line(img, pts[a], pts[b], HAND, 2, cv2.LINE_AA)
        for p in pts:
            cv2.circle(img, p, 2, (255, 255, 255), -1, cv2.LINE_AA)
    g = frame.get("gaze")
    if g and pose:
        face = [pose["lm2d"][i] for i in range(11) if pose["lm2d"][i][2] > 0.4]
        if face:
            c = np.mean([[p[0], p[1]] for p in face], axis=0)
            cv2.line(img, P(c), P([g["x"], g["y"]]), (80, 170, 255), 1, cv2.LINE_AA)
            cv2.circle(img, P([g["x"], g["y"]]), 5, (80, 170, 255), 1, cv2.LINE_AA)
    return img


def motion_thumb(frames: list[dict], dst: Path, t: float | None = None, width: int = 640) -> Path | None:
    """The frame with the most hand detail near time `t` (or the middle), with a short wrist trail."""
    if not frames:
        return None
    t = frames[len(frames) // 2]["t"] if t is None else t
    window = [f for f in frames if abs(f["t"] - t) <= 1.5] or frames
    best = max(window, key=lambda f: (len(f.get("hands", [])), bool(f.get("pose"))))
    i = frames.index(best)
    img = render(best, width, trail=frames[max(0, i - 15):i])
    dst.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(dst), img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return dst
