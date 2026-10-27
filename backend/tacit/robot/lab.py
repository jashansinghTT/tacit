"""F5 Robot Lab glue: runs the `tacit_sim` package (owned by the sim card) as jobs and streams runs."""
from __future__ import annotations

import asyncio
import importlib
import logging
import threading
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from .. import jobs
from ..config import SKILLS, endpoints
from ..db import now
from .. import reflex
from ..storage import load_skill, new_id, read_json, save_skill, twin_path

log = logging.getLogger("tacit.robot")
RUNS: dict[str, dict] = {}


class SimUnavailable(RuntimeError):
    pass


def sim():
    try:
        return importlib.import_module("tacit_sim")
    except ImportError as e:
        raise SimUnavailable("The robot simulator (tacit_sim) is not installed yet.") from e


def program_for(skill: dict) -> list[dict]:
    prog = (skill.get("robot") or {}).get("program") or []
    if not prog:
        objs = [o for st in skill.get("steps", []) for o in st.get("objects", [])][:2] or ["part"]
        prog = []
        for o in objs:
            prog += [{"op": "pick", "object": o}, {"op": "place", "target": "tray"}]
    return prog


def robot_dir(skill_id: str):
    d = SKILLS / skill_id / "robot"
    d.mkdir(parents=True, exist_ok=True)
    return d


def wrist_path(skill_id: str) -> tuple[list[list[float]], list[float], list[float]] | None:
    """The expert's working wrist in camera space (metres, OpenCV axes) with a 0..1 grip, for Replay.

    The twin stores y-up points re-centred on the work area; `camera.position` is where the camera
    sits in that frame, so the camera-space point is (x - cx, -(y - cy), -(z - cz)).
    """
    twin = read_json(twin_path(skill_id))
    if not twin:
        return None
    cam = (twin.get("camera") or {}).get("position") or [0.0, 0.0, 0.0]
    counts = {"left": 0, "right": 0}
    for fr in twin["frames"]:
        for side in counts:
            if (fr.get("hands") or {}).get(side):
                counts[side] += 1
    side = max(counts, key=counts.get)
    curls = {row[0]: row[1:] for row in reflex.finger_track(skill_id, hand=side)["frames"]}
    pts, ts, grip = [], [], []
    for fr in twin["frames"]:
        h = (fr.get("hands") or {}).get(side)
        if not h:
            continue
        x, y, z = h[0]
        pts.append([x - cam[0], -(y - cam[1]), -(z - cam[2])])
        ts.append(fr["t"])
        c = curls.get(round(fr["t"], 3))
        grip.append(round(sum(c[1:]) / 4, 3) if c else 0.0)
    return (pts, ts, grip) if len(pts) >= 5 else None


def _bridge(job: jobs.Job, loop: asyncio.AbstractEventLoop):
    def cb(frac: float, detail: str) -> None:
        loop.call_soon_threadsafe(job.stage_progress, frac, detail)
    return cb


async def train(job: jobs.Job, skill_id: str, demos: int, epochs: int) -> dict:
    ts = sim()
    skill = load_skill(skill_id)
    prog = program_for(skill)
    loop = asyncio.get_running_loop()
    rd = robot_dir(skill_id)
    skill.setdefault("robot", {})["policy"] = {"status": "training"}
    save_skill(skill)
    job.start_stage("demos", models=["MuJoCo@cpu"], detail=f"{demos} randomised demonstrations")
    cb = _bridge(job, loop)
    def on_episode(i: int, n: int, ok: bool) -> None:
        loop.call_soon_threadsafe(job.stage_progress, (i + 1) / max(1, n), f"{i + 1}/{n} demonstrations")

    ds = await asyncio.to_thread(ts.generate_demos, prog, demos, 0, str(rd / "demos"), True, None, on_episode)
    ds = ds.to_dict() if hasattr(ds, "to_dict") else dict(ds)
    job.finish_stage("demos", detail=f"{ds.get('n', demos)} demos, scripted success {ds.get('success_rate', 0):.0%}")
    job.start_stage("train", models=["PyTorch@cpu"])
    curve: list[list[float]] = []

    def on_epoch(epoch: int, loss: float) -> None:
        curve.append([epoch, round(float(loss), 5)])
        loop.call_soon_threadsafe(job.stage_progress, epoch / max(1, epochs), f"epoch {epoch}/{epochs} loss {loss:.4f}")
        job.result = {"loss_curve": curve}

    res = await asyncio.to_thread(ts.train_policy, ds.get("path", str(rd / "demos")), str(rd / "policy.pt"), epochs, on_epoch)
    job.finish_stage("train", detail=f"final loss {curve[-1][1] if curve else 'n/a'}")
    skill = load_skill(skill_id)
    skill["robot"]["policy"] = {"status": "trained", "trained_at": now(), "policy_path": res.get("policy_path", str(rd / "policy.pt")),
                                "demos": ds.get("n", demos), "loss_curve": curve}
    save_skill(skill)
    _ = cb
    return {"loss_curve": curve, "policy_path": res.get("policy_path")}


async def evaluate(job: jobs.Job, skill_id: str, trials: int, seed: int) -> dict:
    ts = sim()
    skill = load_skill(skill_id)
    pol = (skill.get("robot") or {}).get("policy") or {}
    if pol.get("status") != "trained":
        raise ValueError("Train the policy first.")
    loop = asyncio.get_running_loop()
    job.start_stage("evaluate", models=["MuJoCo@cpu", "Tacit-BC@cpu"], detail=f"{trials} randomised trials")
    done: list[dict] = []

    def on_trial(i: int, n: int, r: dict) -> None:
        done.append(r)
        loop.call_soon_threadsafe(job.stage_progress, (i + 1) / trials, f"{sum(1 for x in done if x.get('success'))}/{len(done)} succeeded")

    res = await asyncio.to_thread(ts.evaluate_policy, program_for(skill), pol["policy_path"], trials, seed, on_trial)
    skill = load_skill(skill_id)
    skill["robot"]["policy"].update({"success_rate": res["success_rate"], "trials": trials, "evaluated_at": now()})
    save_skill(skill)
    job.finish_stage("evaluate", detail=f"success {res['success_rate']:.0%}")
    return res


def start_run(skill_id: str, mode: str, seed: int, realtime: bool = True) -> str:
    sim()
    skill = load_skill(skill_id)
    if mode == "policy" and ((skill.get("robot") or {}).get("policy") or {}).get("status") != "trained":
        raise ValueError("Train the policy first.")
    if mode == "replay" and not wrist_path(skill_id):
        raise ValueError("This skill has no recorded hand path to replay.")
    rid = new_id("rr")
    RUNS[rid] = {"skill_id": skill_id, "mode": mode, "seed": seed, "realtime": realtime, "created": now()}
    return rid


async def stream(ws: WebSocket, run_id: str) -> None:
    await ws.accept()
    meta = RUNS.get(run_id)
    if not meta:
        await ws.send_json({"type": "error", "message": "unknown run"})
        await ws.close()
        return
    ts = sim()
    skill = load_skill(meta["skill_id"])
    kwargs: dict[str, Any] = {"seed": meta["seed"]}
    if meta["mode"] == "policy":
        kwargs["policy_path"] = skill["robot"]["policy"]["policy_path"]
    if meta["mode"] == "replay":
        wp = wrist_path(meta["skill_id"])
        if not wp:
            raise ValueError("This skill has no recorded hand path to replay.")
        kwargs["human_path"] = ts.retarget_wrist_path(wp[0], wp[1], wp[2])
    if meta["mode"] == "gr00t":
        kwargs["gr00t_url"] = endpoints()["gr00t"].url
    runner = ts.Runner(program_for(skill), meta["mode"], **kwargs)
    q: asyncio.Queue = asyncio.Queue(maxsize=240)
    loop = asyncio.get_running_loop()
    stop = threading.Event()

    def produce():
        try:
            for msg in runner.frames(realtime=meta["realtime"]):
                if stop.is_set():
                    break
                asyncio.run_coroutine_threadsafe(q.put(msg), loop).result()
        except Exception as e:  # noqa: BLE001
            log.exception("sim run")
            asyncio.run_coroutine_threadsafe(q.put({"type": "error", "message": str(e)}), loop).result()
        finally:
            asyncio.run_coroutine_threadsafe(q.put(None), loop).result()

    th = threading.Thread(target=produce, daemon=True)
    th.start()
    try:
        while True:
            msg = await q.get()
            if msg is None:
                break
            await ws.send_json(msg)
            if msg.get("type") == "done":
                skill = load_skill(meta["skill_id"])
                skill.setdefault("robot", {}).setdefault("runs", []).append(
                    {"id": run_id, "mode": meta["mode"], "success": msg.get("success"), "at": now()})
                skill["robot"]["runs"] = skill["robot"]["runs"][-20:]
                save_skill(skill)
    except WebSocketDisconnect:
        pass
    finally:
        stop.set()
        try:
            await ws.close()
        except RuntimeError:
            pass


def scene(skill_id: str | None) -> dict:
    ts = sim()
    skill = load_skill(skill_id) if skill_id else None
    return ts.scene_description(program_for(skill) if skill else [{"op": "pick", "object": "cup"}, {"op": "place", "target": "bowl"}])
