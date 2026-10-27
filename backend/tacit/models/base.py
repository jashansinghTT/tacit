"""Shared HTTP plumbing for the model clients: one pooled client, timing, health and stats."""
from __future__ import annotations

import asyncio
import base64
import io
import statistics
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

import httpx
import numpy as np
from PIL import Image

from ..config import Endpoint, endpoints

_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=3.0),
                                    limits=httpx.Limits(max_connections=64, max_keepalive_connections=32))
    return _client


class ModelUnavailable(RuntimeError):
    def __init__(self, ep: Endpoint, why: str):
        super().__init__(f"{ep.name} (chip {ep.chip}) is unavailable: {why}")
        self.endpoint = ep
        self.why = why


@dataclass
class Stats:
    latencies: deque = field(default_factory=lambda: deque(maxlen=200))
    calls: int = 0
    errors: int = 0
    last_error: str | None = None
    healthy: bool | None = None
    checked_at: float = 0.0

    def p50(self) -> float | None:
        return round(statistics.median(self.latencies), 1) if self.latencies else None


STATS: dict[str, Stats] = {}


def stats(key: str) -> Stats:
    return STATS.setdefault(key, Stats())


def served(ep: Endpoint, ms: float, backend: str = "tt") -> dict:
    return {"model": ep.name, "chip": ep.chip if backend == "tt" else None, "backend": backend, "ms": round(ms, 1)}


async def post_json(key: str, path: str, payload: dict, timeout: float = 30.0, retries: int = 1) -> tuple[Any, float]:
    """POST JSON to a model; returns (response json, wall ms). Raises ModelUnavailable."""
    ep = endpoints()[key]
    st = stats(key)
    last: Exception | None = None
    for attempt in range(retries + 1):
        t0 = time.perf_counter()
        try:
            r = await client().post(ep.url + path, json=payload, timeout=timeout)
            ms = (time.perf_counter() - t0) * 1000
            if r.status_code >= 500 and attempt < retries:
                last = RuntimeError(f"HTTP {r.status_code}: {r.text[:200]}")
                await asyncio.sleep(0.2)
                continue
            if r.status_code >= 400:
                raise RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")
            st.calls += 1
            st.latencies.append(ms)
            return r.json(), ms
        except (httpx.HTTPError, RuntimeError) as e:  # noqa: PERF203
            last = e
            if attempt < retries and not isinstance(e, RuntimeError):
                await asyncio.sleep(0.3)
                continue
            break
    st.errors += 1
    st.last_error = str(last)
    raise ModelUnavailable(ep, str(last))


async def health(key: str, timeout: float = 2.0) -> bool:
    ep = endpoints()[key]
    st = stats(key)
    try:
        r = await client().get(ep.url + ep.health, timeout=timeout)
        ok = r.status_code < 400
    except httpx.HTTPError:
        ok = False
    st.healthy, st.checked_at = ok, time.time()
    return ok


def encode_jpeg(img: np.ndarray, max_width: int = 960, quality: int = 88) -> tuple[str, float]:
    """RGB uint8 array -> (base64 JPEG, scale applied). Downscales wide frames to save transfer time."""
    h, w = img.shape[:2]
    scale = 1.0
    pil = Image.fromarray(img)
    if w > max_width:
        scale = max_width / w
        pil = pil.resize((max_width, round(h * scale)), Image.BILINEAR)
    buf = io.BytesIO()
    pil.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode(), scale


def decode_image(b64: str) -> np.ndarray:
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB"))
