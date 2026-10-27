"""Clients for the vision models on chip 0: HaMeR, Gaze-LLE, RF-DETR and VGGT."""
from __future__ import annotations

import asyncio
import base64
import heapq
import io
import time
from contextlib import asynccontextmanager

import numpy as np

import httpx

from .base import ModelUnavailable, client, post_json, served
from ..config import endpoints

LIVE, BATCH, SLOW = 0, 1, 2


class ChipGate:
    """Requests in flight to chip 0, by kind.

    The chip runs one model step at a time, but the co-host decodes and prepares the next requests while it
    does, so several calls of one live frame (RF-DETR, Gaze-LLE, HaMeR per hand) are best all in flight at
    once. Offline work (BATCH, and SLOW for VGGT's 0.4 to 3 s calls) holds at most ``batch`` slots, so a live
    frame never waits behind more than that on the chip; live requests have ``live`` slots of their own.
    While live frames are flowing (one in the last ``live_window`` seconds), offline work gets ``batch_live``
    slots instead, so a live call waits behind at most one offline step. Waiting requests go lowest
    priority number first."""

    def __init__(self, batch: int = 2, live: int = 4, batch_live: int = 1, live_window: float = 1.0):
        self.batch, self.batch_live, self.live_window = batch, batch_live, live_window
        self.cap = {True: live, False: batch}
        self.inflight = {True: 0, False: 0}
        self._waiting: list = []
        self._seq = 0
        self._last_live = -1e9

    def _caps(self) -> dict:
        live_now = time.monotonic() - self._last_live <= self.live_window
        self.cap[False] = self.batch_live if live_now else self.batch
        return self.cap

    def _admit(self) -> None:
        self._caps()
        kept = []
        while self._waiting:
            prio, seq, fut = heapq.heappop(self._waiting)
            live = prio == LIVE
            if fut.done():
                continue
            if self.inflight[live] < self.cap[live]:
                self.inflight[live] += 1
                fut.set_result(None)
            else:
                kept.append((prio, seq, fut))
        for w in kept:
            heapq.heappush(self._waiting, w)

    @asynccontextmanager
    async def slot(self, priority: int):
        live = priority == LIVE
        if live:
            self._last_live = time.monotonic()
        if self.inflight[live] < self._caps()[live] and not any(w[0] <= priority for w in self._waiting):
            self.inflight[live] += 1
        else:
            fut = asyncio.get_running_loop().create_future()
            self._seq += 1
            heapq.heappush(self._waiting, (priority, self._seq, fut))
            try:
                await fut
            except asyncio.CancelledError:
                if fut.done() and not fut.cancelled():   # admitted just as we were cancelled: give the slot back
                    self.inflight[live] -= 1
                    self._admit()
                raise
        try:
            yield
        finally:
            self.inflight[live] -= 1
            self._admit()

    def snapshot(self) -> dict:
        return {"inflight": self.inflight[True] + self.inflight[False], "waiting": len(self._waiting),
                "live_inflight": self.inflight[True], "batch_inflight": self.inflight[False], "batch_cap": self._caps()[False]}


GATE = ChipGate(batch=2, live=4)


async def _call(path_key: str, path: str, payload: dict, priority: int, **kw):
    async with GATE.slot(priority):
        return await post_json(path_key, path, payload, **kw)


async def rfdetr(image_b64: str, scale: float, threshold: float = 0.45, max_detections: int = 30,
                 priority: int = BATCH) -> tuple[list[dict], dict]:
    """Objects in the frame. Boxes are returned in source-frame pixels (`scale` undone)."""
    res, ms = await _call("rfdetr", "/predict", {"image": image_b64, "threshold": threshold,
                                                  "max_detections": max_detections}, priority, timeout=15)
    out = []
    for d in res.get("detections", []):
        x1, y1, x2, y2 = (v / scale for v in d["box"])
        out.append({"label": d["label"], "score": round(float(d["score"]), 3), "box": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)]})
    return out, served(endpoints()["rfdetr"], ms)


async def gaze(image_b64: str, scale: float, head_boxes: list[list[float]], priority: int = BATCH) -> tuple[list[dict], dict]:
    """Gaze target per head box (source-frame pixels in and out)."""
    boxes = [[v * scale for v in b] for b in head_boxes]
    res, ms = await _call("gaze", "/predict", {"image": image_b64, "bboxes": boxes, "bbox_format": "pixels",
                                                "heatmap_format": "none"}, priority, timeout=15)
    out = []
    for p in res.get("predictions", []):
        gt = p.get("gaze_target", {})
        out.append({"x": round(gt.get("x", 0) / scale, 1), "y": round(gt.get("y", 0) / scale, 1),
                    "score": round(float(gt.get("score", 0)), 3), "inout": round(float(p.get("inout", 0)), 3)})
    return out, served(endpoints()["gaze"], ms)


def _hand(res: dict, scale: float) -> dict:
    return {"cam_t": [round(float(v), 4) for v in res.get("cam_t_full", [0, 0, 0])],
            "rotmats": res.get("rotmats"), "betas": res.get("betas"),
            "focal": float(res.get("focal_length") or 0.0), "image_size": res.get("image_size"), "scale": scale}


async def hamer(image_b64: str, scale: float, bbox: list[float], is_right: bool, priority: int = BATCH) -> tuple[dict, dict]:
    """3D hand for one box: MANO rotations, shape and camera-space translation."""
    b = [v * scale for v in bbox]
    res, ms = await _call("hamer", "/predict", {"image": image_b64, "bbox": b, "is_right": is_right,
                                                 "return_vertices": False}, priority, timeout=15)
    return _hand(res, scale), served(endpoints()["hamer"], ms)


_HANDS_ROUTE = {"ok": False, "checked": -1e9}


async def _serves_hands() -> bool:
    """Does the HaMeR on chip 0 serve POST /predict_hands (the co-host image since liveperf)? Checked once a
    minute from its OpenAPI listing, so an image swap is picked up without a failed call."""
    if time.monotonic() - _HANDS_ROUTE["checked"] > 60.0:
        _HANDS_ROUTE["checked"] = time.monotonic()
        try:
            r = await client().get(endpoints()["hamer"].url + "/openapi.json", timeout=2.0)
            _HANDS_ROUTE["ok"] = r.status_code == 200 and "/predict_hands" in (r.json().get("paths") or {})
        except (httpx.HTTPError, ValueError):
            _HANDS_ROUTE["ok"] = False
    return _HANDS_ROUTE["ok"]


async def hamer_hands(image_b64: str, scale: float, hands: list[tuple[list[float], bool]],
                      priority: int = BATCH) -> list:
    """3D hands for several boxes of one frame: one request (one decode, one HTTP round trip) when HaMeR serves
    /predict_hands, else one ``hamer`` call per hand. Per hand, what ``hamer`` returns or the exception it raised."""
    if len(hands) < 2 or not await _serves_hands():
        return list(await asyncio.gather(*(hamer(image_b64, scale, b, r, priority=priority) for b, r in hands),
                                         return_exceptions=True))
    ep = endpoints()["hamer"]
    body = {"image": image_b64, "hands": [{"bbox": [v * scale for v in b], "is_right": r} for b, r in hands],
            "return_vertices": False}
    try:
        res, ms = await _call("hamer", "/predict_hands", body, priority, timeout=15)
    except ModelUnavailable as e:
        return [e] * len(hands)
    out = []
    for one in res.get("hands", []):
        err = one.get("error")
        out.append(ModelUnavailable(ep, f"HTTP {err.get('status')}: {err.get('detail')}") if err
                   else (_hand(one, scale), served(ep, ms)))
    return out


async def vggt(images_b64: list[str], outputs: tuple[str, ...] = ("depth", "depth_conf", "world_points", "world_points_conf"),
               timeout: float = 120.0) -> tuple[dict, dict]:
    """Multi-view reconstruction of 1 to 4 views. Dense arrays come back decoded as numpy."""
    res, ms = await _call("vggt", "/predict", {"images": images_b64, "output_format": "npz", "dtype": "float16",
                                                "outputs": list(outputs)}, SLOW, timeout=timeout, retries=0)
    dense = {}
    blob = (res.get("dense") or {}).get("data")
    if blob:
        with np.load(io.BytesIO(base64.b64decode(blob))) as z:
            dense = {k: z[k].astype(np.float32) for k in z.files}
    out = {"extrinsic": np.asarray(res.get("extrinsic"), dtype=np.float32),
           "intrinsic": np.asarray(res.get("intrinsic"), dtype=np.float32),
           "preprocess": res.get("preprocess"), "timing_ms": res.get("timing_ms"), **dense}
    return out, served(endpoints()["vggt"], ms)
