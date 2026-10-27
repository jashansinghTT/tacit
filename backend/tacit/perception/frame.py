"""One analysed frame: MediaPipe on CPU, then HaMeR, Gaze-LLE and RF-DETR on chip 0, concurrently."""
from __future__ import annotations

import asyncio
import time

import numpy as np

from ..models import vision
from ..models.base import ModelUnavailable, encode_jpeg
from ..config import endpoints
from .mediapipe_runner import MediaPipeRunner

KINDS = ("hamer", "gaze", "rfdetr")


NOT_TARGETS = {"person", "dining table", "chair", "bench", "couch", "bed"}  # the expert's own body, the table itself


def label_point(x: float, y: float, objects: list[dict], hands: list[dict]) -> str:
    """Name what a gaze point lands on: the smallest object box containing it, else the nearest object or a hand."""
    objects = [o for o in objects if o["label"] not in NOT_TARGETS]
    inside = [o for o in objects if o["box"][0] <= x <= o["box"][2] and o["box"][1] <= y <= o["box"][3]]
    if inside:
        return min(inside, key=lambda o: (o["box"][2] - o["box"][0]) * (o["box"][3] - o["box"][1]))["label"]
    for hd in hands:
        b = hd["bbox"]
        if b[0] <= x <= b[2] and b[1] <= y <= b[3]:
            return f"{hd['side']} hand"
    if objects:
        def dist(o):
            cx, cy = (o["box"][0] + o["box"][2]) / 2, (o["box"][1] + o["box"][3]) / 2
            return (cx - x) ** 2 + (cy - y) ** 2
        near = min(objects, key=dist)
        if dist(near) ** 0.5 < 120:
            return near["label"]
    return "workbench"


async def analyze(rgb: np.ndarray, t: float, mp_runner: MediaPipeRunner, kinds: tuple[str, ...] = KINDS,
                  priority: int = vision.BATCH) -> dict:
    """Analyse one RGB frame at time `t` (seconds). Shapes match API.md's Tracks frame plus timing and served_by."""
    return await finish(await begin(rgb, t, mp_runner, kinds, priority))


async def begin(rgb: np.ndarray, t: float, mp_runner: MediaPipeRunner, kinds: tuple[str, ...] = KINDS,
                priority: int = vision.BATCH) -> dict:
    """The CPU half of ``analyze``: encode, MediaPipe, and every chip call started (RF-DETR before MediaPipe:
    it needs no hand or head box). ``finish`` waits for the calls. Frames must begin in time order (MediaPipe
    tracks across them)."""
    t0 = time.perf_counter()
    b64, scale = encode_jpeg(rgb)
    t_enc = (time.perf_counter() - t0) * 1000
    jobs: dict[str, asyncio.Future] = {}
    # RF-DETR needs no hand or head box: it runs on the chip while MediaPipe runs on the CPU
    if "rfdetr" in kinds:
        jobs["rfdetr"] = asyncio.ensure_future(vision.rfdetr(b64, scale, priority=priority))
    t1 = time.perf_counter()
    try:
        det = await asyncio.to_thread(mp_runner.detect, rgb, int(t * 1000))
    except BaseException:
        for j in jobs.values():
            j.cancel()
        raise
    t_mp = (time.perf_counter() - t1) * 1000

    if "gaze" in kinds and det["head"]:
        jobs["gaze"] = asyncio.ensure_future(vision.gaze(b64, scale, [det["head"]["bbox"]], priority=priority))
    if "hamer" in kinds:
        for hd in det["hands"]:
            jobs[f"hamer:{hd['side']}"] = asyncio.ensure_future(vision.hamer(b64, scale, hd["bbox"], hd["side"] == "right", priority=priority))
    return {"t": t, "t0": t0, "det": det, "jobs": jobs, "t_mp": t_mp, "t_enc": t_enc}


async def finish(started: dict) -> dict:
    """The chip half of ``analyze``: wait for the calls ``begin`` started and put the frame together."""
    t, t0, det, jobs, t_mp, t_enc = (started[k] for k in ("t", "t0", "det", "jobs", "t_mp", "t_enc"))
    results = dict(zip(jobs, await asyncio.gather(*jobs.values(), return_exceptions=True)))

    served, timing, errors = [], {"mediapipe": round(t_mp, 1), "encode": round(t_enc, 1)}, []
    objects: list[dict] = []
    if "rfdetr" in results:
        r = results["rfdetr"]
        if isinstance(r, Exception):
            errors.append(str(r))
        else:
            objects, sb = r
            served.append(sb)
            timing["rfdetr"] = sb["ms"]
    hands = det["hands"]
    for hd in hands:
        r = results.get(f"hamer:{hd['side']}")
        if r is None:
            hd["source"] = "mediapipe"
            continue
        if isinstance(r, Exception):
            errors.append(str(r))
            hd["source"] = "mediapipe"
            continue
        out, sb = r
        hd["cam_t"] = out["cam_t"]
        hd["rotmats"] = out["rotmats"]
        hd["hamer_focal"] = out["focal"]
        hd["hamer_scale"] = out["scale"]
        hd["source"] = "hamer+mediapipe"
        served.append(sb)
        timing[f"hamer_{hd['side']}"] = sb["ms"]
    gaze = None
    if "gaze" in results:
        r = results["gaze"]
        if isinstance(r, Exception):
            errors.append(str(r))
        else:
            preds, sb = r
            served.append(sb)
            timing["gaze"] = sb["ms"]
            if preds:
                p = preds[0]
                gaze = {"x": p["x"], "y": p["y"], "inout": p["inout"], "score": p["score"],
                        "target": label_point(p["x"], p["y"], objects, hands)}
    timing["total"] = round((time.perf_counter() - t0) * 1000, 1)
    served.append({"model": "MediaPipe", "chip": None, "backend": "cpu", "ms": round(t_mp, 1)})
    unavailable = sorted({e.split(" (chip")[0] for e in errors})
    return {"t": round(t, 3), "hands": hands, "pose": det["pose"], "head": det["head"], "gaze": gaze,
            "objects": objects, "size": det["size"], "timing_ms": timing, "served_by": served,
            "unavailable": unavailable}


class LiveAnalyzer:
    """Analysis of a live stream, one frame deep: a frame's MediaPipe runs on the CPU while the previous frame's
    calls are on the chip, so a frame costs the slower of the two instead of their sum. ``push`` returns the
    previous frame's analysis (None for the first), in order; ``flush`` returns the last one."""

    def __init__(self, mp_runner: MediaPipeRunner, kinds: tuple[str, ...] = KINDS, priority: int = vision.LIVE):
        self.runner, self.kinds, self.priority = mp_runner, kinds, priority
        self._pending: asyncio.Task | None = None

    async def push(self, rgb: np.ndarray, t: float) -> dict | None:
        started = await begin(rgb, t, self.runner, self.kinds, self.priority)
        prev, self._pending = self._pending, asyncio.ensure_future(finish(started))
        return await prev if prev is not None else None

    async def flush(self) -> dict | None:
        prev, self._pending = self._pending, None
        return await prev if prev is not None else None


async def vision_health() -> dict[str, bool]:
    from ..models.base import health
    keys = ("hamer", "gaze", "rfdetr", "vggt")
    oks = await asyncio.gather(*(health(k) for k in keys))
    return dict(zip(keys, oks))


__all__ = ["analyze", "begin", "finish", "LiveAnalyzer", "label_point", "vision_health", "ModelUnavailable", "endpoints"]
