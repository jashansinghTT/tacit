# SPDX-License-Identifier: Apache-2.0
"""HaMeR (3D hand pose from a hand box) as a co-host app member: ``hamer.server.app`` on the
shared mesh.

The boot is the standalone lifespan's, split in two: the first warm-up runs the eager forward
(every program compiled, the persistent token buffer allocated); the second captures the trace,
replays it on the same input and on a fresh one, and applies the standalone PCC gate against the
CPU reference, so a device path broken by sharing the chip fails the boot instead of serving.
"""
from __future__ import annotations

import time
from typing import Any, Dict

from tt_kernel.cohost.apps import AppMember

from .common import Rounds, StepModel, log, note, programs, without_lifespan


class HamerMember(AppMember):
    def __init__(self, host, member):
        self.host, self.member = host, member
        self.rounds = Rounds()
        self.outs: Dict[str, Any] = {}

    def load(self, mesh):
        import torch

        from hamer.checkpoint import load_hamer_checkpoint
        from hamer.model import TtHamer
        from hamer.reference import Hamer, sample_input
        from hamer.server import app as srv

        torch.set_grad_enabled(False)
        t0 = time.perf_counter()
        cfg = srv.load_config()
        ck, mean, winfo = srv.resolve_weights(cfg)
        ref = Hamer()
        ref.eval()
        report = load_hamer_checkpoint(ref, ck, mean)
        if report["loaded"] == 0 or report["missing_in_ref"] != 0 or report["unexpected_in_ref"] != 0:
            raise RuntimeError(f"Checkpoint {ck} does not map cleanly onto the reference: {report}")
        if not bool(ref.head.init_cam.abs().sum() > 0):
            raise RuntimeError(f"{mean} did not populate the MANO mean parameters")
        mano, mano_path = None, srv.resolve_mano_path(cfg)
        if mano_path is not None:
            from hamer.mano import MANO

            mano = MANO(mano_path)
            mano.eval()
        log.info("cohost-vision: hamer weights %s, MANO %s", ck, mano_path or "absent (MANO parameters only)")

        class SharedMeshTtHamer(TtHamer):
            """TtHamer on the co-host's mesh: it neither opens nor closes a chip."""

            def _open_device(self):
                self.device, self._is_mesh = mesh, True

            def close(self):
                pass

        self.model = SharedMeshTtHamer(ref, device_id=cfg.device_id, strict=True, use_trace=cfg.use_trace)
        if self.model._vit_params is None or self.model._head_params is None:
            raise RuntimeError("tt-nn parameters not available after the upload")
        self.ref, self.cfg, self.srv = ref, cfg, srv
        self.x_a, self.x_b = sample_input(batch=1, seed=0), sample_input(batch=1, seed=1)
        srv.STATE.update(mano=mano, mano_path=str(mano_path) if mano_path else None, cfg=cfg,
                         weights={**winfo, "ckpt": str(ck), "mean_params": str(mean), "report": report})
        self.t_load = time.perf_counter() - t0
        note(mesh, self.member.name, "load")

    def warmup(self):
        import torch

        mesh, name = self.model.device, self.member.name
        before = programs(mesh)
        with torch.inference_mode():
            if self.rounds.next() == 1:
                # compile: the eager forward (every kernel JIT-compiled, the token buffer allocated)
                self.outs["eager_a"] = self.model(self.x_a).detach().clone()
                note(mesh, name, "compile", before)
                return
            # capture: the first call with no trace captures one and replays it (no eager run)
            t = time.perf_counter()
            self.outs["replay_a"] = self.model(self.x_a).detach().clone()
            self.outs["fresh_b"] = self.model(self.x_b).detach().clone()
            dt = (time.perf_counter() - t) * 1000.0
            if self.cfg.use_trace and not self.model.trace_active:
                raise RuntimeError("ttnn trace was not captured during warm-up")
            note(mesh, name, "capture", before)
            ref_a, ref_b = self.ref(self.x_a), self.ref(self.x_b)
        for k, v in self.outs.items():
            if tuple(v.shape) != (1, 157) or not torch.isfinite(v).all():
                raise RuntimeError(f"warm-up forward {k} produced an invalid output {tuple(v.shape)}")
        pcc = self.srv._pcc
        gate = {"eager_vs_ref_pcc": round(pcc(self.outs["eager_a"], ref_a), 5),
                "replay_vs_eager_pcc": round(pcc(self.outs["replay_a"], self.outs["eager_a"]), 5),
                "fresh_input_vs_ref_pcc": round(pcc(self.outs["fresh_b"], ref_b), 5),
                "min_pcc": self.cfg.warmup_min_pcc}
        log.info("cohost-vision: hamer warm-up PCC %s (capture + 2 replays %.0f ms)", gate, dt)
        bad = [k for k in ("eager_vs_ref_pcc", "replay_vs_eager_pcc", "fresh_input_vs_ref_pcc")
               if gate[k] < self.cfg.warmup_min_pcc]
        if bad:
            raise RuntimeError(f"HaMeR warm-up PCC below {self.cfg.warmup_min_pcc}: {gate}")
        self.srv.STATE["warmup"] = gate

    def release_traces(self):
        self.model._release_trace()

    def asgi_app(self):
        self.srv.STATE.update(model=StepModel(self.host, self.member.name, self.model),
                              boot_seconds=round(self.t_load, 1), ready=True)
        return without_lifespan(self.srv.app)


def member(host, member):
    return HamerMember(host, member)
