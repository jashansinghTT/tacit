"""Live analysis speed: stream a clip through perception.frame.analyze as live capture does, and time it.

    python backend/tools/live_bench.py                          # vase clip, 10 fps camera, 60 s, idle
    python backend/tools/live_bench.py --load                   # with an offline processing job alongside
    python backend/tools/live_bench.py --seconds 30 --json out.json
    python backend/tools/live_bench.py --record before.json                     # outputs of 60 frames per clip
    python backend/tools/live_bench.py --record after.json --compare before.json  # ... and are they unchanged?

A camera task offers a new frame every 1/fps s (the clip, looped, at most 960 px wide as the browser
sends it); the analyser always takes the newest frame, as live/capture.py does, so a slow analysis
drops frames instead of queueing them. ``--load`` runs what a processing job does in the backend
process at the same time: the other sample clip through analyze() at BATCH priority, three frames in
flight. Prints p50/p90 per stage (MediaPipe, JPEG encode, each model's call, total), the achieved fps,
and the same for frames that had two hands.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tacit.models import vision  # noqa: E402
from tacit.perception.frame import analyze  # noqa: E402
from tacit.perception.mediapipe_runner import MediaPipeRunner  # noqa: E402

DATA = Path(os.environ.get("TACIT_DATA", Path.home() / "tacit" / "data"))


def load_clip(path: Path, fps: float, max_width: int = 960) -> list[np.ndarray]:
    """The clip's frames at ``fps``, RGB, at most ``max_width`` wide."""
    cap = cv2.VideoCapture(str(path))
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    out, i, next_t = [], 0, 0.0
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        if i / src_fps >= next_t:
            h, w = bgr.shape[:2]
            if w > max_width:
                bgr = cv2.resize(bgr, (max_width, round(h * max_width / w)), interpolation=cv2.INTER_AREA)
            out.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
            next_t += 1.0 / fps
        i += 1
    cap.release()
    return out


def pct(xs: list[float], q: float) -> float | None:
    return round(float(np.percentile(xs, q)), 1) if xs else None


def summarize(rows: list[dict], seconds: float) -> dict:
    stages = sorted({k for r in rows for k in r["timing"]})
    span = rows[-1]["done"] - rows[0]["done"] if len(rows) > 1 else seconds
    out = {"frames": len(rows), "fps": round((len(rows) - 1) / span, 2) if len(rows) > 1 else 0.0,
           "stages": {k: {"p50": pct([r["timing"][k] for r in rows if k in r["timing"]], 50),
                          "p90": pct([r["timing"][k] for r in rows if k in r["timing"]], 90)} for k in stages},
           "latency_ms": {"p50": pct([r["latency"] for r in rows], 50), "p90": pct([r["latency"] for r in rows], 90)}}
    two = [r for r in rows if r["hands"] == 2]
    if two:
        out["two_hands"] = {"frames": len(two), "total_p50": pct([r["timing"]["total"] for r in two], 50),
                            "total_p90": pct([r["timing"]["total"] for r in two], 90),
                            "fps_if_all_two_hands": round(1000.0 / statistics.mean(r["timing"]["total"] for r in two), 2)}
    return out


async def live(frames: list[np.ndarray], fps: float, seconds: float, priority: int) -> list[dict]:
    latest: dict = {}
    new = asyncio.Event()
    stop = time.perf_counter() + seconds

    async def camera():
        k = 0
        while time.perf_counter() < stop:
            latest["frame"] = (k / fps, frames[k % len(frames)], time.perf_counter())
            new.set()
            k += 1
            await asyncio.sleep(max(0.0, (k / fps) - (time.perf_counter() - (stop - seconds))))

    cam = asyncio.create_task(camera())
    runner = MediaPipeRunner(video=True)
    rows = []
    try:
        while time.perf_counter() < stop:
            await new.wait()
            new.clear()
            t, rgb, offered = latest["frame"]
            f = await analyze(rgb, t, runner, priority=priority)
            rows.append({"t": t, "timing": f["timing_ms"], "hands": len(f["hands"]), "done": time.perf_counter(),
                         "latency": (time.perf_counter() - offered) * 1000, "unavailable": f["unavailable"]})
    finally:
        cam.cancel()
        runner.close()
    return rows


async def background(frames: list[np.ndarray], stop: asyncio.Event) -> int:
    """What a processing job does: every frame through analyze() at BATCH priority, three in flight."""
    runner = MediaPipeRunner(video=True)
    done, k = 0, 0
    pending: list[asyncio.Task] = []
    try:
        while not stop.is_set():
            pending.append(asyncio.ensure_future(analyze(frames[k % len(frames)], k / 10.0, runner)))
            k += 1
            if len(pending) >= 3:
                await pending.pop(0)
                done += 1
        for p in pending:
            await p
            done += 1
    finally:
        runner.close()
    return done


async def main_async(a) -> dict:
    clip = load_clip(Path(a.clip), a.fps)
    bg_clip = load_clip(Path(a.load_clip), 10.0) if a.load else []
    stop = asyncio.Event()
    bg = asyncio.create_task(background(bg_clip, stop)) if a.load else None
    if bg is not None:
        await asyncio.sleep(2.0)   # the job is under way before live starts
    t0 = time.perf_counter()
    rows = await live(clip, a.fps, a.seconds, vision.LIVE)
    wall = time.perf_counter() - t0
    stop.set()
    bg_frames = await bg if bg is not None else 0
    res = {"clip": Path(a.clip).name, "camera_fps": a.fps, "seconds": round(wall, 1), "load": bool(a.load),
           "background_frames_per_s": round(bg_frames / wall, 1) if bg is not None else None,
           "unavailable": sorted({u for r in rows for u in r["unavailable"]}), **summarize(rows, wall)}
    return res


def frame_outputs(f: dict) -> dict:
    """What analyze() decided about a frame, for an exact before/after comparison."""
    return {"hands": [{k: h.get(k) for k in ("side", "bbox", "lm2d", "cam_t", "rotmats", "source")} for h in f["hands"]],
            "head": f.get("head"), "objects": f["objects"], "gaze": f.get("gaze"), "unavailable": f["unavailable"]}


async def record(clips: list[Path], n: int) -> list[dict]:
    """``n`` frames of each clip at 10 fps, analysed one after another from a fresh MediaPipe runner (deterministic)."""
    out = []
    for clip in clips:
        frames = load_clip(clip, 10.0)[:n]
        runner = MediaPipeRunner(video=True)
        try:
            for k, rgb in enumerate(frames):
                f = await analyze(rgb, k / 10.0, runner, priority=vision.LIVE)
                out.append({"clip": clip.name, "k": k, **frame_outputs(f)})
        finally:
            runner.close()
    return out


def compare_outputs(before: list[dict], after: list[dict]) -> dict:
    """Frame by frame: identical, or the largest differences in boxes, landmarks, hand translation and rotations."""
    diff = {"frames": len(before), "identical": 0, "different": []}
    for b, a in zip(before, after):
        if b == a:
            diff["identical"] += 1
            continue
        d = {"clip": b["clip"], "k": b["k"]}
        if [h["side"] for h in b["hands"]] != [h["side"] for h in a["hands"]]:
            d["hands"] = ([h["side"] for h in b["hands"]], [h["side"] for h in a["hands"]])
        else:
            for hb, ha in zip(b["hands"], a["hands"]):
                for k in ("bbox", "lm2d", "cam_t", "rotmats"):
                    if hb.get(k) is not None and ha.get(k) is not None:
                        m = float(np.max(np.abs(np.asarray(hb[k], dtype=float) - np.asarray(ha[k], dtype=float))))
                        if m:
                            d[f"{hb['side']}_{k}_max_abs"] = round(m, 4)
        lb, la = [o["label"] for o in b["objects"]], [o["label"] for o in a["objects"]]
        if lb != la:
            d["objects"] = (lb, la)
        elif b["objects"]:
            m = float(np.max(np.abs(np.asarray([o["box"] for o in b["objects"]]) - np.asarray([o["box"] for o in a["objects"]]))))
            if m:
                d["object_box_max_abs"] = round(m, 2)
        if (b["gaze"] or {}).get("target") != (a["gaze"] or {}).get("target"):
            d["gaze"] = ((b["gaze"] or {}).get("target"), (a["gaze"] or {}).get("target"))
        diff["different"].append(d)
    return diff


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--clip", default=str(DATA / "samples" / "vase.mp4"))
    ap.add_argument("--load-clip", default=str(DATA / "samples" / "jars.mp4"))
    ap.add_argument("--fps", type=float, default=10.0)
    ap.add_argument("--seconds", type=float, default=60.0)
    ap.add_argument("--load", action="store_true", help="run an offline processing job alongside")
    ap.add_argument("--json", help="also write the results here")
    ap.add_argument("--record", help="instead: analyse the first --frames frames of both sample clips and save the outputs")
    ap.add_argument("--compare", help="with --record: compare the new outputs with this earlier recording")
    ap.add_argument("--frames", type=int, default=60)
    a = ap.parse_args()
    if a.record:
        outs = asyncio.run(record([Path(a.clip), Path(a.load_clip)], a.frames))
        Path(a.record).write_text(json.dumps(outs))
        if a.compare:
            res = compare_outputs(json.loads(Path(a.compare).read_text()), outs)
            print(json.dumps({**res, "different": res["different"][:20]}, indent=1))
        else:
            print(f"{len(outs)} frames recorded to {a.record}")
        return
    res = asyncio.run(main_async(a))
    print(json.dumps(res, indent=1))
    if a.json:
        Path(a.json).write_text(json.dumps(res, indent=1) + "\n")


if __name__ == "__main__":
    main()
