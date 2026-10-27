"""Reflex (Hack the North 2026): a 5-finger exoskeleton glove that moves a person's fingers.

Tacit turns the expert's recorded hand into the glove's language, so a trainee can feel the skill:
five curls in finger order (thumb, index, middle, ring, pinky), 0 = open .. 1 = closed.

- `finger_track`: per analysed frame, the expert's curls from MediaPipe's 3D hand landmarks.
- `movement_steps` / `movement_file`: the track as a Reflex movement (poses with durations), the
  format Reflex plays with its own arrival checks and rate limits.
- `Client`: talks to a running Reflex backend (REFLEX_URL; real glove or its mock mode) over its
  documented HTTP API: teach a movement, play it, stop, read the glove's state.
Without a Reflex backend, the web app drives a virtual glove from the same data.
"""
from __future__ import annotations

import math
import os
import re

import httpx
import numpy as np

from .storage import load_skill, read_json, tracks_path

FINGERS = ("thumb", "index", "middle", "ring", "pinky")
# Joint chains in MediaPipe's 21-point hand: wrist, then each finger's four points.
CHAINS = [(0, 1 + 4 * k, 2 + 4 * k, 3 + 4 * k, 4 + 4 * k) for k in range(5)]
# Total bend (radians) of an open hand and a fist, typical adult values. A person's own
# calibration would be better; the expert is not there to give one.
OPEN = np.array([0.45, 0.30, 0.30, 0.30, 0.35])
FIST = np.array([1.60, 3.00, 3.20, 3.10, 3.00])
GUIDE_MAX = 0.85   # never close fully on a person's hand


def bends(world: list[list[float]]) -> np.ndarray:
    """Per finger, the sum of angles between consecutive bones (scale and rotation free)."""
    p = np.asarray(world, dtype=np.float64)
    out = []
    for chain in CHAINS:
        b = np.diff(p[list(chain)], axis=0)
        n = np.linalg.norm(b, axis=1, keepdims=True)
        u = b / np.maximum(n, 1e-9)
        cos = np.clip((u[:-1] * u[1:]).sum(axis=1), -1.0, 1.0)
        out.append(float(np.arccos(cos).sum()))
    return np.array(out)


def curls(world: list[list[float]]) -> list[float]:
    c = np.clip((bends(world) - OPEN) / (FIST - OPEN), 0.0, 1.0)
    return [round(float(v), 3) for v in c]


def finger_track(skill_id: str, step_index: int | None = None, side: str | None = None) -> dict:
    """Curls of the expert's working hand over time (whole skill, or one step)."""
    skill = load_skill(skill_id) or {}
    frames = (read_json(tracks_path(skill_id)) or {}).get("frames", [])
    t0, t1 = 0.0, math.inf
    if step_index is not None:
        st = next((s for s in skill.get("steps", []) if s["index"] == step_index), None)
        if st:
            t0, t1 = st["t_start"], st["t_end"]
            side = side or st.get("hand")
    if side is None:
        counts = {"left": 0, "right": 0}
        for f in frames:
            for h in f.get("hands", []):
                counts[h["side"]] += 1
        side = max(counts, key=counts.get)
    rows = []
    for f in frames:
        if not (t0 <= f["t"] <= t1):
            continue
        h = next((h for h in f.get("hands", []) if h["side"] == side), None)
        if h and h.get("world") and len(h["world"]) == 21:
            rows.append([round(f["t"], 3), *curls(h["world"])])
    rows = _smooth(rows)
    return {"fingers": list(FINGERS), "hand": side, "t_start": t0 if rows else None,
            "frames": rows, "fps": 10.0}


def _smooth(rows: list[list[float]], k: int = 3) -> list[list[float]]:
    if len(rows) < k:
        return rows
    a = np.array(rows)
    out = a.copy()
    for j in range(1, 6):
        out[:, j] = np.convolve(np.pad(a[:, j], (k // 2, k // 2), mode="edge"), np.ones(k) / k, mode="valid")
    return [[round(float(v), 3) for v in r] for r in out]


def movement_steps(track: dict, min_change: float = 0.08, max_gap: float = 0.6, speed: float = 1.0) -> list[dict]:
    """Keyframes of the track: a new pose when any finger moved `min_change`, or every `max_gap` s."""
    rows = track["frames"]
    if not rows:
        return []
    steps, last_t, last_pose = [], rows[0][0], None
    for r in rows:
        pose = [min(GUIDE_MAX, v) for v in r[1:]]
        moved = last_pose is None or max(abs(a - b) for a, b in zip(pose, last_pose)) >= min_change
        if moved or r[0] - last_t >= max_gap:
            seconds = max(0.1, min(30.0, (r[0] - last_t) / speed)) if last_pose is not None else 0.5
            steps.append({"pose": [round(v, 3) for v in pose], "seconds": round(seconds, 2)})
            last_t, last_pose = r[0], pose
    steps.append({"pose": [0.15] * 5, "seconds": 0.5})  # end relaxed
    return steps[:2000]


def movement_name(skill_id: str, step_index: int | None) -> str:
    base = re.sub(r"[^a-z0-9_]", "_", f"tacit_{skill_id}" + (f"_step{step_index}" if step_index else "")).lower()
    return base if base[0].isalpha() else f"t_{base}"


def movement_file(title: str, description: str, steps: list[dict]) -> str:
    """A Reflex movement module: TITLE, DESCRIPTION and steps() -> [(pose, seconds), ...]."""
    poses = "".join(f"        ({[float(v) for v in s['pose']]!r}, {float(s['seconds'])!r}),\n" for s in steps)
    return ('"""A movement taught by Tacit from an expert\'s recorded hand (title below).\n\nFinger order: thumb, index, middle, '
            f'ring, pinky; 0 = open, 1 = closed (capped at {GUIDE_MAX} for a hand inside the glove)."""\n\n'
            f"TITLE = {str(title)!r}\nDESCRIPTION = {str(description)!r}\n\n\ndef steps():\n    return [\n{poses}    ]\n\n\n"
            "if __name__ == \"__main__\":\n    for pose, seconds in steps():\n        print(f\"{seconds:5.2f} s  \" + "
            "\"  \".join(f\"{v:.2f}\" for v in pose))\n")


class Client:
    """A Reflex backend (its FastAPI, port 8000 by default)."""

    def __init__(self, url: str | None = None):
        self.url = (url or os.environ.get("REFLEX_URL", "http://127.0.0.1:8000")).rstrip("/")

    async def status(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=2.0) as c:
                h = (await c.get(self.url + "/api/health")).json()
                s = (await c.get(self.url + "/api/state")).json()
            return {"connected": True, "url": self.url, "ros_connected": h.get("ros_connected"), "mock": h.get("mock"),
                    "state": s.get("state"), "command": s.get("command"), "passive": s.get("passive"),
                    "movement": s.get("movement"), "fingers": list(FINGERS)}
        except (httpx.HTTPError, ValueError):
            return {"connected": False, "url": self.url, "fingers": list(FINGERS)}

    async def teach(self, name: str, title: str, description: str, steps: list[dict]) -> dict:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.put(f"{self.url}/api/movements/{name}", json={"title": title, "description": description, "steps": steps})
            r.raise_for_status()
            return r.json() if r.content else {}

    async def play(self, name: str) -> dict:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.post(f"{self.url}/api/movements/play", json={"name": name})
            r.raise_for_status()
            return r.json() if r.content else {}

    async def stop(self) -> None:
        async with httpx.AsyncClient(timeout=5.0) as c:
            await c.post(f"{self.url}/api/movements/stop", json={})
