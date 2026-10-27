# SPDX-License-Identifier: Apache-2.0
"""VGGT-1B (multi-view 3D reconstruction) as a co-host app member: ``models.server.app`` on the
shared mesh, with the fused, device-resident port and one metal trace per view count S.

``TtVggt.warm`` already runs every S eagerly before capturing any; here the eager runs are the
first warm-up and the captures the second. ``TtVggt._capture`` adds a warm run on the trace's own
input when no VGGT trace is live yet; that run is left out, because by then the other members'
traces are live (the eager runs of the first warm-up already compiled every program).
"""
from __future__ import annotations

import time

from tt_kernel.cohost.apps import AppMember

from .common import Rounds, log, note, programs, without_lifespan


class _StepForward:
    """Stands in for the app's ``ttnn_vggt`` module: ``vggt_forward`` runs as a co-host step."""

    def __init__(self, host, member: str, mod):
        self._host, self._member, self._mod = host, member, mod

    def vggt_forward(self, images, device=None, **kwargs):
        import torch

        def run():
            with torch.inference_mode():
                return self._mod.vggt_forward(images, device=device, **kwargs)
        return self._host.step(self._member, run)

    def __getattr__(self, name):
        return getattr(self._mod, name)


class VggtMember(AppMember):
    def __init__(self, host, member):
        self.host, self.member = host, member
        self.rounds = Rounds()

    def load(self, mesh):
        import torch

        from models.demos.vggt.reference import torch_vggt
        from models.demos.vggt.tt import ttnn_vggt
        from models.demos.vggt.tt.ttnn_vggt_fused import TtVggt
        from models.server import app as srv

        torch.set_grad_enabled(False)
        t0 = time.perf_counter()
        cfg = srv.load_config()
        if cfg.torch_threads:
            torch.set_num_threads(cfg.torch_threads)
        if not ttnn_vggt.fused_enabled():
            raise RuntimeError("the co-host adapter serves VGGT's fused, traced path only (TT_FUSED=1)")
        weights_path = torch_vggt.resolve_weights_path()
        model = ttnn_vggt._get_model()  # torch_vggt.load_vggt, cached module-wide (the host-side driver)
        # what ttnn_vggt._ensure_installed does for the fused path, minus its warm-up
        ttnn_vggt._FUSED_ACTIVE = True
        ttnn_vggt._FUSED_MODEL = TtVggt(model, mesh)
        ttnn_vggt._INSTALL_DONE[id(mesh)] = True
        self.tt = ttnn_vggt._FUSED_MODEL
        if self.tt.cfg.trace_mode != "multi":
            raise RuntimeError(f"VGGT trace mode {self.tt.cfg.trace_mode!r}: the co-host needs every S "
                               "captured at boot ('multi')")
        s_canon = cfg.s_canon
        self.seqs = tuple(range(1, s_canon + 1)) if s_canon > 1 else tuple(sorted(set(cfg.prewarm_seqs or (1,))))
        self.srv, self.ttnn_vggt = srv, ttnn_vggt
        srv.STATE.update(config=cfg, weights_path=str(weights_path), device=mesh)
        self.t_load = time.perf_counter() - t0
        note(mesh, self.member.name, "load")

    def warmup(self):
        import ttnn

        tt, name = self.tt, self.member.name
        dev = tt.device
        before = programs(dev)
        if self.rounds.next() == 1:
            for S in self.seqs:  # compile: every S eagerly (TtVggt.warm, eager half)
                tt._eager_warm(S)
            note(dev, name, "compile", before)
            return
        t0 = time.perf_counter()
        for S in self.seqs:  # capture: TtVggt._capture without its warm run
            dev_in = ttnn.to_device(tt.host_input(tt._zero_tokens(S)), dev)
            tt._capturing = True
            try:
                tid = ttnn.begin_trace_capture(dev, cq_id=0)
                try:
                    outs = tt._graph(dev_in, S)
                finally:
                    ttnn.end_trace_capture(dev, tid, cq_id=0)
            finally:
                tt._capturing = False
            ttnn.synchronize_device(dev)
            if hasattr(ttnn, "mark_corruptible"):
                for t in [dev_in] + tt._flat_outs(outs):
                    ttnn.mark_corruptible(t)
            tt._traces[S] = {"tid": tid, "in": dev_in, "outs": outs}
        note(dev, name, "capture", before)
        log.info("cohost-vision: vggt traces for S=%s captured in %.1fs", list(self.seqs), time.perf_counter() - t0)

    def release_traces(self):
        for S in list(self.tt._traces):
            self.tt._release_trace(S)

    def asgi_app(self):
        self.srv.ttnn_vggt = _StepForward(self.host, self.member.name, self.ttnn_vggt)
        self.srv.STATE["ready"] = True
        return without_lifespan(self.srv.app)


def member(host, member):
    return VggtMember(host, member)
