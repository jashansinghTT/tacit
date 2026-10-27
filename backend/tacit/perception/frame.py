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


def label_point(x: float, y: float, objects: list[dict], hands: list[dict]) -> str:
    """Name what a gaze point lands on: the smallest object box containing it, else the nearest object or a hand."""
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


async def analyze(rgb: np.ndarray, t: float, mp_runner: MediaPipeRunner, kinds: tuple[str, ...] = KINDS) -> dict:
    """Analyse one RGB frame at time `t` (seconds). Shapes match API.md's Tracks frame plus timing and served_by."""
    t0 = time.perf_counter()
    det = await asyncio.to_thread(mp_runner.detect, rgb, int(t * 1000))
    t_mp = (time.perf_counter() - t0) * 1000
    b64, scale = encode_jpeg(rgb)

    jobs: dict[str, asyncio.Future] = {}
    if "rfdetr" in kinds:
        jobs["rfdetr"] = asyncio.ensure_future(vision.rfdetr(b64, scale))
    if "gaze" in kinds and det["head"]:
        jobs["gaze"] = asyncio.ensure_future(vision.gaze(b64, scale, [det["head"]["bbox"]]))
    if "hamer" in kinds:
        for hd in det["hands"]:
            jobs[f"hamer:{hd['side']}"] = asyncio.ensure_future(vision.hamer(b64, scale, hd["bbox"], hd["side"] == "right"))
    results = dict(zip(jobs, await asyncio.gather(*jobs.values(), return_exceptions=True)))

    served, timing, errors = [], {"mediapipe": round(t_mp, 1)}, []
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


async def vision_health() -> dict[str, bool]:
    from ..models.base import health
    keys = ("hamer", "gaze", "rfdetr", "vggt")
    oks = await asyncio.gather(*(health(k) for k in keys))
    return dict(zip(keys, oks))


__all__ = ["analyze", "label_point", "vision_health", "ModelUnavailable", "endpoints"]
