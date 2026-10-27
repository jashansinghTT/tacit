# SPDX-License-Identifier: Apache-2.0
"""Gaze-LLE (gaze target per head box) as a co-host app member: ``gaze_lle.server.app`` on the
shared mesh, fused and metal-traced as in the standalone package.

``TtGazeLLE.warmup()`` pairs an eager run with each capture (scene graph, then one decoder graph
per head-count bucket). Here the eager runs are the first warm-up and the captures the second, on
the same persistent buffers (the input, and one head mask per bucket, allocated in the first).
"""
from __future__ import annotations

import gc
import time

from tt_kernel.cohost.apps import AppMember

from .common import Rounds, StepModel, log, note, programs, share_decodes, without_lifespan


class GazeMember(AppMember):
    def __init__(self, host, member):
        self.host, self.member = host, member
        self.rounds = Rounds()
        self.masks = {}

    def load(self, mesh):
        import torch

        from gaze_lle.reference.load_pretrained import load_pretrained
        from gaze_lle.reference.torch_gaze_lle import build_gaze_lle
        from gaze_lle.server import app as srv
        from gaze_lle.tt.tt_gaze_lle import TtGazeLLE

        torch.set_grad_enabled(False)
        t0 = time.perf_counter()
        cfg = srv._read_config()
        dinov2_path, gaze_path, winfo = srv._resolve_weights(cfg)
        ref = build_gaze_lle("vitb14", inout=True).eval()
        srv._check_load_report(load_pretrained(ref, dinov2_path=dinov2_path, gaze_path=gaze_path, verbose=True))
        model = TtGazeLLE(ref_model=ref, device=mesh, inout=True)
        model.ref = None  # kept by TtGazeLLE, never used in forward (~350 MB)
        del ref
        gc.collect()
        if not (getattr(model, "fused", False) and model.fused_cfg.trace):
            raise RuntimeError("the co-host adapter serves Gaze-LLE's fused, traced path only (TT_FUSED=1)")
        self.buckets = [b for b in model.fused_cfg.trace_heads if b <= cfg["max_heads"]] or [1]
        self.model, self.cfg, self.srv = model, cfg, srv
        srv.STATE.update(cfg=cfg, device=mesh, weights=winfo)
        share_decodes(srv)   # the same frame is decoded once for every member
        self.t_start = t0
        note(mesh, self.member.name, "load")

    def _mask(self, n: int):
        import torch
        import ttnn

        m = self.model
        return ttnn.from_torch(torch.zeros(n, m.seq_len, 1, dtype=torch.bfloat16), dtype=ttnn.bfloat16,
                               layout=ttnn.TILE_LAYOUT, device=m.device, memory_config=ttnn.DRAM_MEMORY_CONFIG)

    def warmup(self):
        import torch
        import ttnn

        m, name = self.model, self.member.name
        dev = m.device
        before = programs(dev)
        if self.rounds.next() == 1:
            # compile: the scene graph and every bucket's decoder graph, eagerly, on the buffers the
            # traces will read (TtGazeLLE._ensure_scene_trace / _ensure_decoder_trace, eager half)
            m._ensure_input_buffer()
            x_base = m._fused_scene_graph(m._in_dev)
            for n in self.buckets:
                self.masks[n] = self._mask(n)
                for o in m._fused_decoder_graph(self.masks[n], x_base):
                    ttnn.deallocate(o)
            ttnn.synchronize_device(dev)
            ttnn.deallocate(x_base)
            note(dev, name, "compile", before)
            return
        # capture: the same graphs recorded (the capture half), scene first; its output X_base
        # is what every decoder trace reads
        t0 = time.perf_counter()
        tid = ttnn.begin_trace_capture(dev, cq_id=0)
        try:
            m._x_base = m._fused_scene_graph(m._in_dev)
        finally:
            ttnn.end_trace_capture(dev, tid, cq_id=0)
        m._scene_trace = tid
        for n in self.buckets:
            tid = ttnn.begin_trace_capture(dev, cq_id=0)
            try:
                outs = m._fused_decoder_graph(self.masks[n], m._x_base)
            finally:
                ttnn.end_trace_capture(dev, tid, cq_id=0)
            m._dec[n] = {"trace": tid, "mask": self.masks[n], "outs": outs}
        ttnn.synchronize_device(dev)
        note(dev, name, "capture", before)
        # the standalone warm-up forwards, now through the traced path every request takes
        dummy = torch.zeros(1, 3, self.srv.INPUT_SIZE, self.srv.INPUT_SIZE, dtype=torch.float32)
        warm_ms = []
        with torch.inference_mode():
            for _ in range(self.cfg["warmup_iters"]):
                t = time.perf_counter()
                out = m(dummy, [self.srv.WARMUP_BBOX])
                warm_ms.append((time.perf_counter() - t) * 1000.0)
        hm, io_ = out["heatmap"], out["inout"]
        if tuple(hm.shape) != (1, 64, 64) or io_ is None or tuple(io_.shape) != (1,):
            raise RuntimeError(f"unexpected warm-up output shapes: heatmap {tuple(hm.shape)}")
        if not (torch.isfinite(hm).all() and torch.isfinite(io_).all()):
            raise RuntimeError("warm-up produced non-finite outputs")
        log.info("cohost-vision: gaze traces for head buckets %s captured in %.1fs; warm %s ms",
                 self.buckets, time.perf_counter() - t0, [round(x, 1) for x in warm_ms])
        self.srv.STATE.update(warm_ms=warm_ms, fused=m.fused_info())

    def release_traces(self):
        import ttnn

        m = self.model
        for d in m._dec.values():  # trace ids and outputs; the head masks stay for the recapture
            ttnn.release_trace(m.device, d["trace"])
        m._dec.clear()
        if m._scene_trace is not None:
            ttnn.release_trace(m.device, m._scene_trace)
            m._scene_trace = None
            m._x_base = None

    def asgi_app(self):
        self.srv.STATE.update(model=StepModel(self.host, self.member.name, self.model), boot_s=time.perf_counter() - self.t_start)
        return without_lifespan(self.srv.app)


def member(host, member):
    return GazeMember(host, member)
