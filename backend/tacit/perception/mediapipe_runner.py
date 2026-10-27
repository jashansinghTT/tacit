"""CPU landmarks with MediaPipe Tasks: two hands and one body per frame.

Hand boxes feed HaMeR and the head box (from the face landmarks of the pose) feeds Gaze-LLE.
"""
from __future__ import annotations

import threading

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

from ..config import MODELS_DIR
from .interactions import fix_sides

HAND_MODEL = MODELS_DIR / "hand_landmarker.task"
POSE_MODEL = MODELS_DIR / "pose_landmarker_full.task"


def _box(points: np.ndarray, w: int, h: int, margin: float, square: bool = False) -> list[float]:
    x1, y1 = points.min(axis=0)
    x2, y2 = points.max(axis=0)
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    bw, bh = (x2 - x1) * (1 + margin), (y2 - y1) * (1 + margin)
    if square:
        bw = bh = max(bw, bh)
    x1, x2 = max(0.0, cx - bw / 2), min(w - 1.0, cx + bw / 2)
    y1, y2 = max(0.0, cy - bh / 2), min(h - 1.0, cy + bh / 2)
    return [round(float(x1), 1), round(float(y1), 1), round(float(x2), 1), round(float(y2), 1)]


class MediaPipeRunner:
    """One instance per stream. VIDEO mode tracks across frames; timestamps must increase."""

    def __init__(self, video: bool = True):
        mode = vision.RunningMode.VIDEO if video else vision.RunningMode.IMAGE
        self.video = video
        self.hands = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(HAND_MODEL)), running_mode=mode, num_hands=2,
            min_hand_detection_confidence=0.4, min_hand_presence_confidence=0.4, min_tracking_confidence=0.4))
        self.pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(POSE_MODEL)), running_mode=mode, num_poses=1,
            min_pose_detection_confidence=0.4, min_tracking_confidence=0.4))
        self._lock = threading.Lock()
        self._last_ts = -1

    def close(self) -> None:
        self.hands.close()
        self.pose.close()

    def detect(self, rgb: np.ndarray, t_ms: int) -> dict:
        h, w = rgb.shape[:2]
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        with self._lock:
            if self.video:
                ts = max(t_ms, self._last_ts + 1)
                self._last_ts = ts
                hr = self.hands.detect_for_video(image, ts)
                pr = self.pose.detect_for_video(image, ts)
            else:
                hr = self.hands.detect(image)
                pr = self.pose.detect(image)

        hands = []
        for i, lms in enumerate(hr.hand_landmarks):
            pts = np.array([[p.x * w, p.y * h] for p in lms], dtype=np.float32)
            world = [[round(p.x, 4), round(p.y, 4), round(p.z, 4)] for p in hr.hand_world_landmarks[i]]
            cat = hr.handedness[i][0]
            # A first guess only: the pose below says which arm each hand is on (see fix_sides).
            side = "left" if cat.category_name == "Left" else "right"
            hands.append({"side": side, "score": round(float(cat.score), 3),
                          "bbox": _box(pts, w, h, margin=0.6, square=True),
                          "lm2d": [[round(float(x), 1), round(float(y), 1)] for x, y in pts], "world": world})

        pose = head = None
        if pr.pose_landmarks:
            lms = pr.pose_landmarks[0]
            lm2d = [[round(p.x * w, 1), round(p.y * h, 1), round(float(getattr(p, "visibility", 1.0) or 0.0), 3)] for p in lms]
            world = [[round(p.x, 4), round(p.y, 4), round(p.z, 4)] for p in pr.pose_world_landmarks[0]]
            pose = {"lm2d": lm2d, "world": world}
            face = np.array([[lm2d[i][0], lm2d[i][1]] for i in range(11) if lm2d[i][2] > 0.3], dtype=np.float32)
            if len(face) >= 3:
                head = {"bbox": _box(face, w, h, margin=1.4, square=True)}
        hands = fix_sides({"hands": hands, "pose": pose})["hands"]
        # One hand of each side at most (keep the more confident).
        best: dict[str, dict] = {}
        for hd in hands:
            if hd["side"] not in best or hd["score"] > best[hd["side"]]["score"]:
                best[hd["side"]] = hd
        return {"hands": list(best.values()), "pose": pose, "head": head, "size": [w, h]}
