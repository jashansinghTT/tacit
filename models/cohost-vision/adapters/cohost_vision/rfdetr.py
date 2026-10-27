# SPDX-License-Identifier: Apache-2.0
"""RF-DETR-base (COCO object detection) as a co-host app member: ``rf_detr.server.app`` on the
shared mesh, with its one metal trace.

``TtRfDetr._capture_trace`` allocates the persistent input, runs the graph eagerly (compiles,
prepares the conv weights) and captures it. Here the allocation and the eager run are the first
warm-up and the capture alone is the second.
"""
from __future__ import annotations

import time

from tt_kernel.cohost.apps import AppMember

from .common import Rounds, StepModel, is_l1, l1_copy, log, note, programs, unpin_l1, without_lifespan


class RfDetrMember(AppMember):
    def __init__(self, host, member):
        self.host, self.member = host, member
        self.rounds = Rounds()

    def load(self, mesh):
        import torch

        from rf_detr.reference.weights import get_preprocessor, load_rf_detr_base, resolve_weight_files
        from rf_detr.server import app as srv
        from rf_detr.tt.ttnn_backbone import TtDinoBackbone
        from rf_detr.tt.ttnn_rf_detr import TtRfDetr

        srv._setup_logging()
        torch.set_grad_enabled(False)
        t0 = time.perf_counter()
        cfg = srv._config_from_env()
        if cfg["torch_threads"]:
            torch.set_num_threads(int(cfg["torch_threads"]))
        weights_path, config_path = resolve_weight_files(cfg["hf_model"], cfg["revision"])
        ref, model_cfg = load_rf_detr_base(weights_path=weights_path, config_path=config_path)
        ref.eval()
        pre = get_preprocessor(model_cfg)
        model = TtRfDetr(ref, mesh)
        if not model.use_trace:
            raise RuntimeError("the co-host adapter serves RF-DETR's traced path only (RFDETR_EAGER unset)")
        # the layer-scale rows of the fused residual ops: copied into L1 at each use instead of resident
        freed = sum(unpin_l1(p, f"{k}_l1", k) for p in model.backbone.layers for k in ("ls1", "ls2"))
        TtDinoBackbone._ls = staticmethod(lambda p, key, residual: l1_copy(p[key]) if is_l1(residual) else p[key])
        log.info("cohost-vision: rfdetr: %d resident L1 layer-scale row(s) freed; copied into L1 per use", freed)
        self.model, self.pre, self.srv = model, pre, srv
        srv.STATE.update(
            device=mesh, pre=pre, config=cfg,
            id2label={int(k): str(v) for k, v in (model_cfg.id2label or {}).items()},
            weights={"repo": None if cfg["weights_dir"] else cfg["hf_model"],
                     "revision": None if cfg["weights_dir"] else cfg["revision"],
                     "files": {"model.safetensors": weights_path, "config.json": config_path}})
        self.t_load = time.perf_counter() - t0
        note(mesh, self.member.name, "load")

    def warmup(self):
        import torch
        import ttnn

        m, name = self.model, self.member.name
        dev = m.device
        before = programs(dev)
        embed = m._embed_host(self.srv._warmup_input(self.pre))
        if self.rounds.next() == 1:
            # compile: the persistent input the trace reads, then the eager graph on it (program
            # cache, prepared conv weights), as in TtRfDetr._capture_trace before its capture
            m._persistent_in = ttnn.to_device(embed, dev)
            with torch.inference_mode():
                logits, boxes = m._device_graph(m._persistent_in)
            ttnn.synchronize_device(dev)
            ttnn.deallocate(logits)
            ttnn.deallocate(boxes)
            note(dev, name, "compile", before)
            return
        # capture: TtRfDetr._capture_trace's capture half
        t0 = time.perf_counter()
        with torch.inference_mode():
            m._trace_id = ttnn.begin_trace_capture(dev, cq_id=0)
            try:
                m._logits_out, m._boxes_out = m._device_graph(m._persistent_in)
            finally:
                ttnn.end_trace_capture(dev, m._trace_id, cq_id=0)
            ttnn.synchronize_device(dev)
            note(dev, name, "capture", before)
            t1 = time.perf_counter()
            out = m(self.srv._warmup_input(self.pre))
            ttnn.synchronize_device(dev)
            t_traced = (time.perf_counter() - t1) * 1000.0
        nq, nc = self.srv.NUM_QUERIES, self.srv.NUM_CLASSES
        if tuple(out.logits.shape) != (1, nq, nc) or tuple(out.pred_boxes.shape) != (1, nq, 4):
            raise RuntimeError(f"warm-up produced unexpected shapes {tuple(out.logits.shape)} / "
                               f"{tuple(out.pred_boxes.shape)}")
        if not (torch.isfinite(out.logits).all() and torch.isfinite(out.pred_boxes).all()):
            raise RuntimeError("warm-up produced non-finite logits/boxes")
        log.info("cohost-vision: rfdetr trace captured in %.1fs; traced call %.1f ms",
                 t1 - t0, t_traced)
        self.srv.STATE.update(warmup_traced_call_ms=round(t_traced, 2),
                              trace={"captured": True, "input_path": getattr(m.backbone, "input_path", None)})

    def release_traces(self):
        import ttnn

        m = self.model
        if m._trace_id is not None:
            ttnn.release_trace(m.device, m._trace_id)
            m._trace_id = None
        m._logits_out = m._boxes_out = None

    def asgi_app(self):
        self.srv.STATE.update(model=StepModel(self.host, self.member.name, self.model),
                              started_at=time.time(), ready=True)
        return without_lifespan(self.srv.app)


def member(host, member):
    return RfDetrMember(host, member)
