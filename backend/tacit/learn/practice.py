"""F4 practice: align the trainee's hands to the expert's for the current step and give one concrete hint.

Features are camera-independent: hand positions relative to the shoulders (in shoulder widths), grip
closure, and which object the hand is on. Alignment is subsequence DTW over the last few seconds.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import math
import time

import numpy as np
from fastapi import WebSocket, WebSocketDisconnect

from ..db import LessonProgress, now, select, session
from ..models.base import decode_image
from ..models import vision
from ..perception.frame import analyze
from ..perception.mediapipe_runner import MediaPipeRunner
from ..perception.timeline import hand_feats, near_object
from ..storage import load_skill, read_json, tracks_path

SESSIONS: dict[str, dict] = {}


def body_frame(f: dict) -> tuple[np.ndarray, float] | None:
    p = f.get("pose")
    if not p:
        return None
    a, b = np.array(p["lm2d"][11][:2]), np.array(p["lm2d"][12][:2])
    if min(p["lm2d"][11][2], p["lm2d"][12][2]) < 0.4:
        return None
    w = float(np.linalg.norm(a - b))
    return ((a + b) / 2, w) if w > 5 else None


def features(f: dict, side: str | None) -> dict | None:
    hands = {h["side"]: h for h in f.get("hands", [])}
    hd = hands.get(side) if side else None
    if hd is None and hands:
        hd = max(hands.values(), key=lambda h: h.get("score", 0))
    if hd is None:
        return None
    ft = hand_feats(hd)
    bf = body_frame(f)
    if bf:
        origin, scale = bf
    else:
        w, h = f.get("size", [1280, 720])
        origin, scale = np.array([w / 2, h / 2]), 0.25 * w
    rel = (ft["center"] - origin) / scale
    return {"side": hd["side"], "x": float(rel[0]), "y": float(rel[1]), "closure": ft["closure"], "pinch": ft["pinch"],
            "object": near_object(ft["center"], ft["size"], f.get("objects", []))}


def vec(ft: dict) -> np.ndarray:
    return np.array([ft["x"], ft["y"], 0.6 * ft["closure"], 0.4 * ft["pinch"]], dtype=np.float32)


def subsequence_dtw(ref: np.ndarray, query: np.ndarray) -> tuple[float, int]:
    """Best alignment of `query` (trainee, recent frames) to any part of `ref` (expert step).
    Returns (mean cost per step, index in ref aligned to the last query frame)."""
    n, m = len(ref), len(query)
    D = np.full((m + 1, n + 1), np.inf, dtype=np.float32)
    D[0, :] = 0.0
    cost = np.linalg.norm(query[:, None, :] - ref[None, :, :], axis=2)
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            D[i, j] = cost[i - 1, j - 1] + min(D[i - 1, j], D[i, j - 1], D[i - 1, j - 1])
    j = int(np.argmin(D[m, 1:])) + 1
    return float(D[m, j] / m), j - 1


def hint(trainee: dict, expert: dict, step: dict) -> str:
    if trainee["side"] != expert["side"] and step.get("hand"):
        return f"Use your {expert['side']} hand for this step."
    if expert.get("object") and trainee.get("object") != expert["object"]:
        return f"Reach for the {expert['object']}."
    dx, dy = trainee["x"] - expert["x"], trainee["y"] - expert["y"]
    if abs(dx) > 0.35 or abs(dy) > 0.35:
        # Camera frames are not mirrored: image +x is the trainee's own left.
        if abs(dx) >= abs(dy):
            return f"Move your hand to your {'right' if dx > 0 else 'left'}, toward the {expert.get('object') or 'work area'}."
        return f"Bring your hand {'up' if dy > 0 else 'down'} to where the {expert.get('object') or 'part'} sits."
    if trainee["closure"] - expert["closure"] > 0.35:
        return f"Close your grip around the {expert.get('object') or 'part'}."
    if expert["closure"] - trainee["closure"] > 0.35:
        return "Open your hand to let go."
    tips = step.get("tips") or []
    return tips[0] if tips else "Good. Keep the same motion."


class Practice:
    def __init__(self, skill: dict, trainee_id: str):
        self.skill = skill
        self.trainee_id = trainee_id
        tracks = read_json(tracks_path(skill["id"])) or {"frames": []}
        self.expert_frames = tracks["frames"]
        self.step_index = 1
        self.buf: list[np.ndarray] = []
        self.buf_ft: list[dict] = []
        self.best: dict[int, float] = {}
        self.ref, self.ref_ft = self._ref(1)

    def _step(self, idx: int) -> dict:
        return next((s for s in self.skill["steps"] if s["index"] == idx), self.skill["steps"][0])

    def _ref(self, idx: int):
        st = self._step(idx)
        fts = [features(f, st.get("hand")) for f in self.expert_frames if st["t_start"] <= f["t"] <= st["t_end"]]
        fts = [x for x in fts if x]
        if not fts:
            fts = [{"side": st.get("hand") or "right", "x": 0.0, "y": 0.8, "closure": 1.6, "pinch": 0.6, "object": None}]
        return np.stack([vec(x) for x in fts]), fts

    def set_step(self, idx: int) -> None:
        self.step_index = idx
        self.buf, self.buf_ft = [], []
        self.ref, self.ref_ft = self._ref(idx)

    def update(self, f: dict) -> dict | None:
        st = self._step(self.step_index)
        ft = features(f, None)
        if ft is None:
            return {"type": "feedback", "step_index": self.step_index, "score": 0.0, "phase": 0.0,
                    "hint": "Show both hands to the camera.", "done": False}
        self.buf.append(vec(ft))
        self.buf_ft.append(ft)
        window = min(len(self.buf), max(8, len(self.ref)))
        q = np.stack(self.buf[-window:])
        cost, j = subsequence_dtw(self.ref, q)
        score = float(math.exp(-1.6 * cost))
        phase = (j + 1) / len(self.ref)
        self.best[self.step_index] = max(self.best.get(self.step_index, 0.0), score)
        done = phase > 0.85 and score > 0.55 and len(self.buf) >= min(8, len(self.ref))
        return {"type": "feedback", "step_index": self.step_index, "score": round(score, 3), "phase": round(phase, 3),
                "hint": hint(ft, self.ref_ft[j], st), "done": done}

    def save_progress(self) -> dict:
        with session() as s:
            row = s.exec(select(LessonProgress).where(LessonProgress.trainee_id == self.trainee_id,
                                                      LessonProgress.skill_id == self.skill["id"])).first()
            row = row or LessonProgress(trainee_id=self.trainee_id, skill_id=self.skill["id"])
            row.steps_total = len(self.skill["steps"])
            row.steps_done = max(row.steps_done, len([k for k, v in self.best.items() if v > 0.55]))
            row.best_score = max(row.best_score, round(float(np.mean(list(self.best.values()))) if self.best else 0.0, 3))
            row.updated_at = now()
            s.add(row)
            s.commit()
            return {"steps_done": row.steps_done, "best_score": row.best_score}


async def run(ws: WebSocket, session_id: str) -> None:
    await ws.accept()
    meta = SESSIONS.get(session_id)
    skill = load_skill(meta["skill_id"]) if meta else None
    if not skill or not skill.get("steps"):
        await ws.send_json({"type": "error", "message": "unknown session or skill has no steps"})
        await ws.close()
        return
    pr = Practice(skill, meta["trainee_id"])
    runner = MediaPipeRunner(video=True)
    latest: list = [None]
    evt = asyncio.Event()
    closed = False

    async def loop():
        while not closed:
            await evt.wait()
            evt.clear()
            if latest[0] is None:
                continue
            t, jpeg = latest[0]
            try:
                rgb = await asyncio.to_thread(lambda: decode_image(base64.b64encode(jpeg).decode()))
                f = await analyze(rgb, t, runner, kinds=("rfdetr",), priority=vision.LIVE)
            except Exception as e:  # noqa: BLE001 - one bad frame must not end the session
                await ws.send_json({"type": "error", "message": f"frame skipped: {e}"})
                continue
            await ws.send_json({"type": "analysis", "t": f["t"], "hands": f["hands"], "objects": f["objects"],
                                "size": f["size"], "timing_ms": f["timing_ms"], "served_by": f["served_by"]})
            fb = pr.update(f)
            if fb:
                await ws.send_json(fb)
                if fb["done"]:
                    await ws.send_json({"type": "step_done", "step_index": fb["step_index"],
                                        "score": round(pr.best.get(fb["step_index"], 0.0), 3)})
                    nxt = fb["step_index"] + 1
                    if nxt <= len(skill["steps"]):
                        pr.set_step(nxt)

    task = asyncio.create_task(loop())
    try:
        while True:
            msg = await ws.receive_json()
            try:
                if msg.get("type") == "frame":
                    latest[0] = (float(msg.get("t", time.time())), base64.b64decode(msg["jpeg"], validate=True))
                    evt.set()
                elif msg.get("type") == "step":
                    pr.set_step(int(msg["index"]))
                elif msg.get("type") == "stop":
                    break
            except (KeyError, ValueError, TypeError, binascii.Error) as e:
                await ws.send_json({"type": "error", "message": f"ignored a malformed message: {e}"})
    except WebSocketDisconnect:
        pass
    finally:
        closed = True
        evt.set()
        task.cancel()
        try:
            prog = pr.save_progress()
            try:  # tell the trainee first: closing MediaPipe takes several seconds
                await ws.send_json({"type": "saved", **prog})
                await ws.close()
            except (RuntimeError, WebSocketDisconnect):
                pass  # the trainee already left
        finally:
            await asyncio.to_thread(runner.close)
