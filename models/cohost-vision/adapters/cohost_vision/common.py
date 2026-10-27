# SPDX-License-Identifier: Apache-2.0
"""Pieces the vision adapters share.

Each member's app keeps its module-global ``STATE`` and its own request handlers. An adapter
fills ``STATE`` with the model it built on the shared mesh, wrapped in :class:`StepModel` so the
handler's one device call runs as a co-host step, and swaps the app's lifespan (which would open
and close a chip of its own) for a no-op.

Boot (see ``tt_kernel.cohost.apps``) calls ``warmup()`` twice per member. The first call only
compiles: eager forwards at every shape the member will trace, so every program, prepared weight
and lazily allocated constant exists before ANY member captures a trace. The second call only
captures, with no eager warm runs, so nothing compiles or allocates long-lived device memory
after another member's trace exists. ``Rounds`` tells an adapter which call it is in.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, Callable

log = logging.getLogger("cohost_vision")


class StepModel:
    """Stands in for a member's model object in its app's STATE: a call runs as one device step
    of that member (exclusive on the device thread, in torch inference mode); attribute reads go
    to the model."""

    def __init__(self, host, member: str, model: Any, call: Callable[..., Any] | None = None):
        self._host, self._member, self._model = host, member, model
        self._call = call or model

    def __call__(self, *args, **kwargs):
        import torch

        def run():
            with torch.inference_mode():
                return self._call(*args, **kwargs)
        return self._host.step(self._member, run)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._model, name)


def without_lifespan(app) -> Any:
    """The app's own lifespan opens a chip and closes it; in the group the co-host did both."""

    @asynccontextmanager
    async def _booted(_app):
        yield

    app.router.lifespan_context = _booted
    return app


class Rounds:
    """Which ``warmup()`` call this is: 1 compiles, 2 (and any later call) captures."""

    def __init__(self) -> None:
        self.n = 0

    def next(self) -> int:
        self.n += 1
        return self.n


def programs(mesh) -> int:
    return mesh.num_program_cache_entries() if hasattr(mesh, "num_program_cache_entries") else -1


def note(mesh, who: str, what: str, before: int | None = None) -> int:
    """Log the program-cache size and the L1_SMALL this process holds after ``what``; with
    ``before``, also how many programs ``what`` compiled. Device thread only."""
    import ttnn

    n = programs(mesh)
    small = None
    try:
        mv = ttnn.get_memory_view(mesh, ttnn.BufferType.L1_SMALL)
        small = round(mv.total_bytes_allocated_per_bank / 1024, 1)
    except Exception:  # noqa: BLE001 - diagnostics only
        pass
    added = "" if before is None else f" (+{n - before} compiled)"
    log.info("cohost-vision: %s %s: %d programs cached%s; L1_SMALL held %s KiB/core", who, what, n, added, small)
    if before is not None and what.startswith("capture") and n != before:
        log.warning("cohost-vision: %s compiled %d program(s) while capturing; a capture should only record",
                    who, n - before)
    return n
