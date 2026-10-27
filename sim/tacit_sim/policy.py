"""Behaviour-cloning policy: an MLP that maps the observation to a chunk of TCP commands.

Training (`train_policy`) and closed-loop use (`PolicyController`) live here. The file at
`policy_path` is a torch checkpoint with the weights, normalisation statistics and config, so
it is self-contained.
"""

from __future__ import annotations

import json
import math
import os
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

from .env import SimEnv
from .features import ACT_DIM, CHUNK, OBS_DIM, chunk_labels, observe

FORMAT = "tacit-bc-chunk-mlp/1"


class ChunkMLP(nn.Module):
    def __init__(self, obs_dim: int = OBS_DIM, chunk: int = CHUNK, act_dim: int = ACT_DIM,
                 hidden: int = 512, layers: int = 3):
        super().__init__()
        mods: list[nn.Module] = []
        d = obs_dim
        for _ in range(layers):
            mods += [nn.Linear(d, hidden), nn.LayerNorm(hidden), nn.GELU()]
            d = hidden
        mods.append(nn.Linear(d, chunk * act_dim))
        self.net = nn.Sequential(*mods)
        self.chunk, self.act_dim = chunk, act_dim

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x).view(-1, self.chunk, self.act_dim)


def _load_demos(demos_path: str | os.PathLike):
    p = Path(demos_path)
    if p.is_dir():
        p = p / "episodes.npz"
    z = np.load(p)
    keep = z["success"]
    starts, ends = z["starts"][keep], z["ends"][keep]
    if len(starts) == 0:
        raise ValueError(f"{p}: no successful episodes to learn from")
    idx = np.concatenate([np.arange(s, e) for s, e in zip(starts, ends)])
    lengths = ends - starts
    new_ends = np.cumsum(lengths)
    new_starts = new_ends - lengths
    take = {k: z[k][idx] for k in ("obs", "tcp", "yaw", "tgt_pos", "tgt_yaw", "grip")}
    labels = chunk_labels(take["tcp"], take["yaw"], take["tgt_pos"], take["tgt_yaw"], take["grip"],
                          new_starts, new_ends)
    return take["obs"].astype(np.float32), labels, len(starts)


def train_policy(demos_path: str | os.PathLike, out_path: str | os.PathLike, epochs: int = 30,
                 on_epoch=None, batch_size: int = 512, lr: float = 1e-3, seed: int = 0,
                 threads: int | None = None) -> dict:
    """Train on the successful episodes in `demos_path`; save to `out_path`.

    `on_epoch(epoch, loss)` is called after every epoch (epochs count from 1).
    Returns {policy_path, loss_curve: [[epoch, loss]], val_loss, episodes, frames, seconds}.
    """
    t0 = time.time()
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    if threads is None:
        threads = max(1, min(8, (os.cpu_count() or 2) // 2))
    torch.set_num_threads(threads)

    obs, labels, n_eps = _load_demos(demos_path)
    n = len(obs)
    obs_mean = obs.mean(0)
    obs_std = np.maximum(obs.std(0), 1e-3)
    cont = labels[..., :4]
    act_mean = cont.mean(0)
    act_std = np.maximum(cont.std(0), 1e-3)

    x = torch.from_numpy((obs - obs_mean) / obs_std)
    y_cont = torch.from_numpy((cont - act_mean) / act_std)
    y_grip = torch.from_numpy(labels[..., 4])

    perm = rng.permutation(n)
    n_val = max(1, n // 20)
    val_idx, tr_idx = torch.from_numpy(perm[:n_val]), torch.from_numpy(perm[n_val:])

    model = ChunkMLP()
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    steps_per_epoch = math.ceil(len(tr_idx) / batch_size)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=epochs * steps_per_epoch,
                                                pct_start=0.1)
    # Near-future steps matter most; later ones regularise.
    w = torch.exp(-0.15 * torch.arange(CHUNK, dtype=torch.float32))[None, :, None]
    bce = nn.BCEWithLogitsLoss(reduction="none")

    def loss_fn(xb, yc, yg):
        out = model(xb)
        lc = (nn.functional.smooth_l1_loss(out[..., :4], yc, reduction="none") * w).mean()
        lg = (bce(out[..., 4], yg) * w[..., 0]).mean()
        return lc + 0.5 * lg

    curve = []
    for epoch in range(1, epochs + 1):
        model.train()
        order = tr_idx[torch.randperm(len(tr_idx))]
        total, count = 0.0, 0
        for b in range(steps_per_epoch):
            bi = order[b * batch_size:(b + 1) * batch_size]
            loss = loss_fn(x[bi], y_cont[bi], y_grip[bi])
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            sched.step()
            total += loss.item() * len(bi)
            count += len(bi)
        train_loss = total / count
        curve.append([epoch, round(train_loss, 6)])
        if on_epoch:
            on_epoch(epoch, train_loss)
    model.eval()
    with torch.no_grad():
        val_loss = float(loss_fn(x[val_idx], y_cont[val_idx], y_grip[val_idx]))

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path = Path(demos_path) / "meta.json" if Path(demos_path).is_dir() else None
    program = json.loads(meta_path.read_text())["program"] if meta_path and meta_path.exists() else None
    torch.save({
        "format": FORMAT,
        "state_dict": model.state_dict(),
        "obs_mean": obs_mean, "obs_std": obs_std,
        "act_mean": act_mean, "act_std": act_std,
        "config": {"obs_dim": OBS_DIM, "chunk": CHUNK, "act_dim": ACT_DIM, "hidden": 512, "layers": 3},
        "program": program,
        "trained_on": {"episodes": n_eps, "frames": n, "epochs": epochs},
        "loss_curve": curve,
        "val_loss": val_loss,
    }, out_path)
    return {"policy_path": str(out_path), "loss_curve": curve, "val_loss": round(val_loss, 6),
            "episodes": n_eps, "frames": n, "seconds": round(time.time() - t0, 2)}


class PolicyController:
    """Runs a trained policy in a SimEnv: one query per control step, temporally ensembled."""

    def __init__(self, policy_path: str | os.PathLike, ensemble: float = 0.25):
        ck = torch.load(policy_path, map_location="cpu", weights_only=False)
        if ck.get("format") != FORMAT:
            raise ValueError(f"{policy_path}: not a {FORMAT} checkpoint")
        cfg = ck["config"]
        self.model = ChunkMLP(cfg["obs_dim"], cfg["chunk"], cfg["act_dim"], cfg["hidden"], cfg["layers"])
        self.model.load_state_dict(ck["state_dict"])
        self.model.eval()
        self.obs_mean, self.obs_std = ck["obs_mean"], ck["obs_std"]
        self.act_mean, self.act_std = ck["act_mean"], ck["act_std"]
        self.chunk = cfg["chunk"]
        self.program = ck.get("program")
        # ACT-style temporal ensembling: weight exp(-ensemble * age) over the overlapping chunks
        # that predicted the current step (0 disables it).
        self.ensemble = ensemble
        self.reset()

    def reset(self) -> None:
        self.history: list[tuple[int, np.ndarray, np.ndarray]] = []   # (step, abs targets, grips)
        self.step = 0

    @torch.no_grad()
    def predict(self, obs: np.ndarray) -> np.ndarray:
        x = torch.from_numpy(((obs - self.obs_mean) / self.obs_std).astype(np.float32))[None]
        out = self.model(x)[0].numpy()
        cont = out[:, :4] * self.act_std + self.act_mean
        grip = 1.0 / (1.0 + np.exp(-out[:, 4]))
        return np.concatenate([cont, grip[:, None]], axis=1)

    def act(self, env: SimEnv) -> tuple[np.ndarray, float, float]:
        """Return (tcp target, yaw goal, grip) for this step."""
        chunk = self.predict(observe(env))
        tcp, yaw = env.tcp_pos(), env.gripper_yaw()
        targets = np.concatenate([tcp + chunk[:, :3], (yaw + chunk[:, 3])[:, None]], axis=1)
        if self.ensemble <= 0:
            pos, ygoal, grip = targets[0, :3], targets[0, 3], chunk[0, 4]
        else:
            self.history.append((self.step, targets, chunk[:, 4]))
            self.history = [h for h in self.history if self.step - h[0] < self.chunk]
            ws, ps, gs = [], [], []
            for s, tg, gr in self.history:
                k = self.step - s
                ws.append(math.exp(-self.ensemble * (len(self.history) - 1 - len(ws))))
                ps.append(tg[k])
                gs.append(gr[k])
            ws = np.array(ws) / np.sum(ws)
            ps = np.array(ps)
            pos = (ws[:, None] * ps[:, :3]).sum(0)
            # Yaw goals are angles mod pi: average the offsets to the newest one.
            ref = ps[-1, 3]
            ygoal = ref + float((ws * (((ps[:, 3] - ref) + np.pi / 2) % np.pi - np.pi / 2)).sum())
            grip = float((ws * np.array(gs)).sum())
        self.step += 1
        return pos, float(ygoal), 1.0 if grip > 0.5 else 0.0
