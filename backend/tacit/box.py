"""F7: the box, live: which model runs on which chip, whether it answers, how fast, and device memory."""
from __future__ import annotations

import asyncio
import socket
import time

from .config import cohost_status_ports, endpoints
from .db import now
from .models.base import client, health, stats

_cache: dict = {"at": 0.0, "data": None}
BOARDS = {0: "p300c #1", 1: "p300c #1", 2: "p300c #2", 3: "p300c #2"}


async def _cohost(port: int) -> dict | None:
    try:
        r = await client().get(f"http://127.0.0.1:{port}/", timeout=1.5)
        return r.json() if r.status_code == 200 else None
    except Exception:  # noqa: BLE001
        return None


async def box_status(max_age: float = 4.0) -> dict:
    if _cache["data"] and time.time() - _cache["at"] < max_age:
        return _cache["data"]
    eps = endpoints()
    keys = list(eps)
    oks = await asyncio.gather(*(health(k) for k in keys))
    co = {chip: await _cohost(port) for chip, port in cohost_status_ports().items()}
    chips = []
    for chip in range(4):
        models = []
        group = None
        for k, ok in zip(keys, oks):
            ep = eps[k]
            if ep.chip != chip:
                continue
            group = ep.group
            st = stats(k)
            models.append({"key": k, "name": ep.name, "role": ep.role, "port": int(ep.url.rsplit(":", 1)[1]), "healthy": ok,
                           "p50_ms": st.p50(), "calls": st.calls, "errors": st.errors, "backend": "tt"})
        mem = None
        if co.get(chip):
            d = co[chip].get("dram_gib_per_chip") or {}
            mem = {"dram_gib": round(float(d.get("total", 0.0)), 2), "dram_total_gib": 32.0,
                   "members": {m: round(sum(v.values()), 2) for m, v in (d.get("members") or {}).items()},
                   "device_owner": co[chip].get("device_owner")}
        n_ok = sum(1 for m in models if m["healthy"])
        status = "ok" if models and n_ok == len(models) else "degraded" if n_ok else "down"
        chips.append({"id": chip, "board": BOARDS[chip], "group": group, "status": status, "models": models, "memory": mem})
    data = {"host": socket.gethostname(), "updated_at": now(), "chips": chips,
            "totals": {"models": len(keys), "healthy": sum(1 for o in oks if o), "chips": 4}}
    _cache.update(at=time.time(), data=data)
    return data


async def wait_healthy(keys: tuple[str, ...], timeout: float = 3600.0, every: float = 15.0) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout:
        oks = await asyncio.gather(*(health(k) for k in keys))
        if all(oks):
            return True
        await asyncio.sleep(every)
    return False
