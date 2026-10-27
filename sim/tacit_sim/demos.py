"""Demonstrations: the scripted expert under randomised starts, with noise injection (DART).

Noise goes into the executed command, never into the recorded label: the label at every step is
the expert's clean command from the state the noise produced, so the policy learns how to get
back on track. Three kinds of noise:
- an Ornstein-Uhlenbeck drift on the TCP target (most episodes, a few millimetres),
- now and then a premature gripper close near the part (teaches reopening and re-aligning),
- rarely a release mid-carry (teaches picking a dropped part up again).

Output in `out_dir`:
- `episodes.npz`: every step of every episode (observations, labels, robot and object state).
- `meta.json`: program, layout, per-episode seed, length, noise and success.
- `lerobot/`: the successful episodes as a LeRobot-style dataset (parquet + meta JSON, no video),
  which goes into the Skill Exchange pack.
"""

from __future__ import annotations

import json
import math
import multiprocessing as mp
import os
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from .env import HOME_TCP, SimEnv
from .expert import ScriptedExpert
from .features import PHASES, observe
from .ik import wrap_period
from .program import parse_program

FPS = 30
STEPS_PER_TASK = 450


@dataclass
class DemoSet:
    path: str               # directory with episodes.npz, meta.json and lerobot/
    n: int                  # episodes collected
    success_rate: float     # share of episodes the noisy expert completed
    episodes_ok: int
    frames: int
    lerobot_path: str
    seconds: float

    def to_dict(self) -> dict:
        return asdict(self)


def episode_seed(seed: int, i: int) -> int:
    """Training episodes draw from their own seed range so they never coincide with evaluation
    trials (which use seed + i)."""
    return 1_000_000 + 10_007 * int(seed) + int(i)


def instruction(layout, task_index: int | None = None) -> str:
    """Natural-language task text, used as the LeRobot task string and as GR00T's instruction."""
    def one(t):
        return f"put the {t.object} in the {t.target}" if t.target else f"pick up the {t.object} and put it back down"

    tasks = layout.tasks if task_index is None else [layout.tasks[task_index]]
    if not tasks:
        return "stay at home"
    text = ", then ".join(one(t) for t in tasks)
    return text[0].upper() + text[1:]


def max_steps(layout) -> int:
    return STEPS_PER_TASK * max(1, len(layout.tasks)) + 90


_ENV_CACHE: dict[str, SimEnv] = {}


def _env_for(program) -> SimEnv:
    key = json.dumps(program, sort_keys=True)
    env = _ENV_CACHE.get(key)
    if env is None:
        env = _ENV_CACHE[key] = SimEnv(program)
    return env


def collect_episode(program, ep_seed: int, noise: bool = True) -> dict:
    env = _env_for(program)
    env.reset(ep_seed)
    expert = ScriptedExpert(env)
    rng = np.random.default_rng(ep_seed + 7)
    sigma = rng.uniform(0.002, 0.006) if (noise and rng.random() < 0.8) else 0.0
    flip_pick = 0.03 if (noise and rng.random() < 0.5) else 0.0
    flip_place = 0.0015 if (noise and rng.random() < 0.3) else 0.0
    ou = np.zeros(3)
    flip_left = 0
    rec = {k: [] for k in ("obs", "tcp", "yaw", "tgt_pos", "tgt_yaw", "grip", "qpos", "q_cmd",
                           "objects", "phase", "task")}
    limit = max_steps(env.layout)
    done_steps = 0
    for _ in range(limit):
        a = expert.act()
        tcp, yaw = env.tcp_pos(), env.gripper_yaw()
        rec["obs"].append(observe(env))
        rec["tcp"].append(tcp)
        rec["yaw"].append(yaw)
        rec["tgt_pos"].append(a.pos)
        rec["tgt_yaw"].append(yaw + wrap_period(a.yaw - yaw, math.pi))
        rec["grip"].append(a.grip)
        rec["qpos"].append(env.qpos9())
        rec["objects"].append(np.array([np.concatenate([s.pos, s.quat]) for s in
                                        (env.object_state(o.name) for o in env.layout.objects)]).reshape(-1, 7))
        mon = env.monitor
        rec["phase"].append(PHASES.index(mon.phase))
        rec["task"].append(mon.index)

        ou += -0.3 * ou + sigma * rng.standard_normal(3)
        grip = a.grip
        if flip_left > 0:
            flip_left -= 1
            grip = 1.0 - a.grip
        elif mon.phase == "pick" and a.grip < 0.5 and mon.task is not None:
            o = env.object_state(mon.task.object).pos
            if np.linalg.norm(o[:2] - tcp[:2]) < 0.03 and rng.random() < flip_pick:
                flip_left = int(rng.integers(4, 10))
        elif mon.phase == "place" and rng.random() < flip_place:
            flip_left = int(rng.integers(3, 6))
        env.step_ee(a.pos + ou, a.yaw, grip)
        rec["q_cmd"].append(env.q_cmd.copy())     # the joint command this step applied

        if mon.phase == "done":
            done_steps += 1
            if np.linalg.norm(env.tcp_pos() - HOME_TCP) < 0.03 or done_steps > 60:
                break
    out = {k: np.asarray(v) for k, v in rec.items()}
    out["success"] = env.success()
    out["seed"] = ep_seed
    out["sigma"] = sigma
    return out


def _collect_job(args):
    program, ep_seed, noise = args
    return collect_episode(program, ep_seed, noise)


def generate_demos(program, n: int = 200, seed: int = 0, out_dir: str | os.PathLike = "demos",
                   noise: bool = True, workers: int | None = None, on_episode=None) -> DemoSet:
    """Collect `n` demonstrations of `program` into `out_dir`.

    `on_episode(i, n, success)` is called as episodes finish (in completion order).
    """
    t0 = time.time()
    layout = parse_program(program)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    workers = workers if workers is not None else max(1, min(8, (os.cpu_count() or 2) // 2, n))
    seeds = [episode_seed(seed, i) for i in range(n)]
    episodes: list[dict | None] = [None] * n
    if workers <= 1:
        for i, s in enumerate(seeds):
            episodes[i] = collect_episode(program, s, noise)
            if on_episode:
                on_episode(i, n, bool(episodes[i]["success"]))
    else:
        # spawn, not fork: the caller may be a threaded server.
        ctx = mp.get_context("spawn")
        with ProcessPoolExecutor(max_workers=workers, mp_context=ctx) as pool:
            futs = {pool.submit(_collect_job, (program, s, noise)): i for i, s in enumerate(seeds)}
            for done, fut in enumerate(as_completed(futs)):
                i = futs[fut]
                episodes[i] = fut.result()
                if on_episode:
                    on_episode(done, n, bool(episodes[i]["success"]))

    lengths = np.array([len(e["obs"]) for e in episodes])
    ends = np.cumsum(lengths)
    starts = ends - lengths
    success = np.array([bool(e["success"]) for e in episodes])
    arrays = {k: np.concatenate([e[k] for e in episodes]) for k in
              ("obs", "tcp", "yaw", "tgt_pos", "tgt_yaw", "grip", "qpos", "q_cmd", "phase", "task")}
    arrays["objects"] = np.concatenate([e["objects"] for e in episodes]).reshape(len(arrays["obs"]), -1, 7)
    np.savez_compressed(out / "episodes.npz", starts=starts, ends=ends, success=success,
                        seeds=np.array(seeds), sigma=np.array([e["sigma"] for e in episodes]),
                        **{k: v.astype(np.float32) if v.dtype.kind == "f" else v for k, v in arrays.items()})
    meta = {
        "program": program,
        "instruction": instruction(layout),
        "objects": [o.name for o in layout.objects],
        "targets": [t.name for t in layout.targets],
        "fps": FPS,
        "seed": seed,
        "episodes": [{"index": i, "seed": int(seeds[i]), "length": int(lengths[i]),
                      "success": bool(success[i]), "noise_sigma": float(episodes[i]["sigma"])}
                     for i in range(n)],
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    lerobot = write_lerobot(out / "lerobot", layout, episodes, success)
    ok = int(success.sum())
    return DemoSet(path=str(out), n=n, success_rate=ok / max(1, n), episodes_ok=ok,
                   frames=int(lengths.sum()), lerobot_path=str(lerobot), seconds=round(time.time() - t0, 2))


def write_lerobot(root: Path, layout, episodes: list[dict], success: np.ndarray) -> Path:
    """Write the successful episodes as a LeRobot v2.1-style dataset (parquet, no video)."""
    import pyarrow as pa
    import pyarrow.parquet as pq

    root = Path(root)
    (root / "meta").mkdir(parents=True, exist_ok=True)
    (root / "data" / "chunk-000").mkdir(parents=True, exist_ok=True)
    task_text = instruction(layout)
    obj_names = [o.name for o in layout.objects]
    state_names = [f"panda_joint{i}" for i in range(1, 8)] + ["finger_left", "finger_right",
                                                                "tcp_x", "tcp_y", "tcp_z", "gripper_yaw"]
    env_names = [f"{n}.{c}" for n in obj_names for c in ("x", "y", "z", "qw", "qx", "qy", "qz")]
    act_names = [f"panda_joint{i}" for i in range(1, 8)] + ["gripper_close"]
    ee_names = ["dx", "dy", "dz", "dyaw", "gripper_close"]

    def fixed(arr: np.ndarray):
        arr = np.ascontiguousarray(arr, dtype=np.float32)
        return pa.FixedSizeListArray.from_arrays(pa.array(arr.ravel()), arr.shape[1])

    feats = {"observation.state": [], "observation.environment_state": [], "action": [], "action.ee": []}
    ep_lines = []
    index = 0
    kept = 0
    for ep in (e for e, ok in zip(episodes, success) if ok):
        n = len(ep["obs"])
        state = np.concatenate([ep["qpos"], ep["tcp"], ep["yaw"][:, None]], axis=1)
        env_state = ep["objects"].reshape(n, -1)
        action = np.concatenate([ep["q_cmd"], ep["grip"][:, None]], axis=1)
        ee = np.concatenate([ep["tgt_pos"] - ep["tcp"],
                             ((ep["tgt_yaw"] - ep["yaw"] + np.pi / 2) % np.pi - np.pi / 2)[:, None],
                             ep["grip"][:, None]], axis=1)
        table = pa.table({
            "observation.state": fixed(state),
            "observation.environment_state": fixed(env_state),
            "action": fixed(action),
            "action.ee": fixed(ee),
            "timestamp": pa.array(np.arange(n, dtype=np.float32) / FPS),
            "frame_index": pa.array(np.arange(n, dtype=np.int64)),
            "episode_index": pa.array(np.full(n, kept, dtype=np.int64)),
            "index": pa.array(np.arange(index, index + n, dtype=np.int64)),
            "task_index": pa.array(np.zeros(n, dtype=np.int64)),
            "next.done": pa.array(np.arange(n) == n - 1),
        })
        pq.write_table(table, root / "data" / "chunk-000" / f"episode_{kept:06d}.parquet")
        for k, v in (("observation.state", state), ("observation.environment_state", env_state),
                     ("action", action), ("action.ee", ee)):
            feats[k].append(v)
        ep_lines.append({"episode_index": kept, "tasks": [task_text], "length": n, "seed": int(ep["seed"])})
        index += n
        kept += 1

    def stats(v):
        if not v:
            return {}
        a = np.concatenate(v)
        return {"mean": a.mean(0).tolist(), "std": a.std(0).tolist(), "min": a.min(0).tolist(), "max": a.max(0).tolist()}

    def feat(names):
        return {"dtype": "float32", "shape": [len(names)], "names": names}

    info = {
        "codebase_version": "v2.1",
        "robot_type": "franka_panda",
        "total_episodes": kept,
        "total_frames": index,
        "total_tasks": 1,
        "total_videos": 0,
        "total_chunks": 1,
        "chunks_size": 1000,
        "fps": FPS,
        "splits": {"train": f"0:{kept}"},
        "data_path": "data/chunk-{episode_chunk:03d}/episode_{episode_index:06d}.parquet",
        "video_path": None,
        "features": {
            "observation.state": feat(state_names),
            "observation.environment_state": feat(env_names),
            "action": feat(act_names),
            "action.ee": feat(ee_names),
            "timestamp": {"dtype": "float32", "shape": [1], "names": None},
            "frame_index": {"dtype": "int64", "shape": [1], "names": None},
            "episode_index": {"dtype": "int64", "shape": [1], "names": None},
            "index": {"dtype": "int64", "shape": [1], "names": None},
            "task_index": {"dtype": "int64", "shape": [1], "names": None},
            "next.done": {"dtype": "bool", "shape": [1], "names": None},
        },
        "tacit": {
            "source": "MuJoCo sim demonstrations of the expert's skill program (scripted expert with noise injection)",
            "frame": "robot base, metres, z up",
            "action": "joint position targets (rad) and gripper close command (1 closes)",
            "action.ee": "TCP target minus TCP (m), gripper yaw goal minus yaw (rad), gripper close",
        },
    }
    (root / "meta" / "info.json").write_text(json.dumps(info, indent=1))
    (root / "meta" / "tasks.jsonl").write_text(json.dumps({"task_index": 0, "task": task_text}) + "\n")
    (root / "meta" / "episodes.jsonl").write_text("".join(json.dumps(x) + "\n" for x in ep_lines))
    (root / "meta" / "stats.json").write_text(json.dumps({k: stats(v) for k, v in feats.items()}))
    return root
