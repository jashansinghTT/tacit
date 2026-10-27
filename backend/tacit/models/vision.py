"""Clients for the vision models on chip 0: HaMeR, Gaze-LLE, RF-DETR and VGGT."""
from __future__ import annotations

import base64
import io

import numpy as np

from .base import post_json, served
from ..config import endpoints


async def rfdetr(image_b64: str, scale: float, threshold: float = 0.45, max_detections: int = 30) -> tuple[list[dict], dict]:
    """Objects in the frame. Boxes are returned in source-frame pixels (`scale` undone)."""
    res, ms = await post_json("rfdetr", "/predict", {"image": image_b64, "threshold": threshold,
                                                      "max_detections": max_detections}, timeout=15)
    out = []
    for d in res.get("detections", []):
        x1, y1, x2, y2 = (v / scale for v in d["box"])
        out.append({"label": d["label"], "score": round(float(d["score"]), 3), "box": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)]})
    return out, served(endpoints()["rfdetr"], ms)


async def gaze(image_b64: str, scale: float, head_boxes: list[list[float]]) -> tuple[list[dict], dict]:
    """Gaze target per head box (source-frame pixels in and out)."""
    boxes = [[v * scale for v in b] for b in head_boxes]
    res, ms = await post_json("gaze", "/predict", {"image": image_b64, "bboxes": boxes, "bbox_format": "pixels",
                                                    "heatmap_format": "none"}, timeout=15)
    out = []
    for p in res.get("predictions", []):
        gt = p.get("gaze_target", {})
        out.append({"x": round(gt.get("x", 0) / scale, 1), "y": round(gt.get("y", 0) / scale, 1),
                    "score": round(float(gt.get("score", 0)), 3), "inout": round(float(p.get("inout", 0)), 3)})
    return out, served(endpoints()["gaze"], ms)


async def hamer(image_b64: str, scale: float, bbox: list[float], is_right: bool) -> tuple[dict, dict]:
    """3D hand for one box: MANO rotations, shape and camera-space translation."""
    b = [v * scale for v in bbox]
    res, ms = await post_json("hamer", "/predict", {"image": image_b64, "bbox": b, "is_right": is_right,
                                                     "return_vertices": False}, timeout=15)
    out = {"cam_t": [round(float(v), 4) for v in res.get("cam_t_full", [0, 0, 0])],
           "rotmats": res.get("rotmats"), "betas": res.get("betas"),
           "focal": float(res.get("focal_length") or 0.0), "image_size": res.get("image_size"), "scale": scale}
    return out, served(endpoints()["hamer"], ms)


async def vggt(images_b64: list[str], outputs: tuple[str, ...] = ("depth", "depth_conf", "world_points", "world_points_conf"),
               timeout: float = 120.0) -> tuple[dict, dict]:
    """Multi-view reconstruction of 1 to 4 views. Dense arrays come back decoded as numpy."""
    res, ms = await post_json("vggt", "/predict", {"images": images_b64, "output_format": "npz", "dtype": "float16",
                                                    "outputs": list(outputs)}, timeout=timeout, retries=0)
    dense = {}
    blob = (res.get("dense") or {}).get("data")
    if blob:
        with np.load(io.BytesIO(base64.b64decode(blob))) as z:
            dense = {k: z[k].astype(np.float32) for k in z.files}
    out = {"extrinsic": np.asarray(res.get("extrinsic"), dtype=np.float32),
           "intrinsic": np.asarray(res.get("intrinsic"), dtype=np.float32),
           "preprocess": res.get("preprocess"), "timing_ms": res.get("timing_ms"), **dense}
    return out, served(endpoints()["vggt"], ms)
