"""Produce the sim card's evidence in .orchestration/evidence/sim/.

    uv run --project sim python sim/scripts/make_evidence.py [--skip-gr00t] [--program FILE]

Steps: generate 200 demos, train the policy, evaluate it (20 trials for the merge gate, plus 100
more on other seeds), run the scripted expert as a baseline, render offscreen videos of a
scripted, a policy and a GR00T episode, and record GR00T's per-call latency.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

os.environ.setdefault("MUJOCO_GL", "egl")

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

from tacit_sim import evaluate_policy, generate_demos, run_episode, train_policy  # noqa: E402
from tacit_sim.render import Cameras  # noqa: E402

SIM = Path(__file__).resolve().parents[1]
REPO = SIM.parent
DEFAULT_OUT = REPO / ".orchestration" / "evidence" / "sim"


class Video:
    """Raw RGB frames piped to ffmpeg (H.264, yuv420p, plays everywhere)."""

    def __init__(self, path: Path, width: int, height: int, fps: int = 30):
        self.proc = subprocess.Popen(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
             "-s", f"{width}x{height}", "-r", str(fps), "-i", "-", "-c:v", "libx264",
             "-pix_fmt", "yuv420p", "-crf", "26", "-preset", "medium", "-movflags", "+faststart",
             str(path)], stdin=subprocess.PIPE)
        self.frames = 0

    def write(self, img: np.ndarray) -> None:
        self.proc.stdin.write(np.ascontiguousarray(img, dtype=np.uint8).tobytes())
        self.frames += 1

    def close(self) -> None:
        self.proc.stdin.close()
        self.proc.wait()


def _font(size):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
              "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


FONT = None


def caption(img: np.ndarray, lines: list[str]) -> np.ndarray:
    global FONT
    FONT = FONT or _font(15)
    im = Image.fromarray(img)
    d = ImageDraw.Draw(im, "RGBA")
    h = 8 + 20 * len(lines)
    d.rectangle([0, 0, im.width, h], fill=(10, 12, 16, 170))
    for i, line in enumerate(lines):
        d.text((10, 5 + 20 * i), line, font=FONT, fill=(235, 240, 245, 255))
    return np.asarray(im)


def record(program, mode: str, seed: int, path: Path, title: str, policy_path=None, max_seconds=None,
           with_robot_cams: bool = False) -> dict:
    """Run one episode and render it from the overview camera (plus GR00T's two cameras)."""
    state: dict = {}
    W, H = 640, 360

    def on_step(env):
        if "cams" not in state:
            # Created on the simulation's thread (EGL contexts are per thread).
            state["cams"] = Cameras(env.model, W, H, shadows=True)
            state["small"] = Cameras(env.model, 320, 180, shadows=False) if with_robot_cams else None
            state["video"] = Video(path, W + (320 if with_robot_cams else 0), H)
        img = state["cams"].render(env.data, "overview")
        img = caption(img, [f"{title}   seed {seed}   t = {env.t:5.1f} s",
                            f"phase: {env.monitor.label}"])
        if with_robot_cams:
            ext = state["small"].render(env.data, "exterior")
            wri = state["small"].render(env.data, "wrist")
            ext = caption(ext, ["exterior (to GR00T)"])
            wri = caption(wri, ["wrist (to GR00T)"])
            img = np.concatenate([img, np.concatenate([ext, wri], axis=0)], axis=1)
        state["video"].write(img)

    t0 = time.time()
    try:
        r = run_episode(program, mode, seed, policy_path=policy_path, on_step=on_step,
                        **({"max_seconds": max_seconds} if max_seconds else {}))
    finally:
        if "video" in state:
            state["video"].close()
        for k in ("cams", "small"):
            if state.get(k) is not None:
                state[k].close()
    r["video"] = path.name
    r["wall_seconds"] = round(time.time() - t0, 1)
    return r


def pct(x):
    return f"{100 * x:.0f}%"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--program", default=str(SIM / "examples" / "sort2.json"))
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--work", default=str(SIM / "runs" / "evidence"))
    ap.add_argument("--demos", type=int, default=200)
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--skip-gr00t", action="store_true")
    ap.add_argument("--extra-program", default=str(SIM / "examples" / "kit3.json"),
                    help="a second program to train and evaluate (empty to skip)")
    args = ap.parse_args()

    program = json.loads(Path(args.program).read_text())
    out, work = Path(args.out), Path(args.work)
    out.mkdir(parents=True, exist_ok=True)
    work.mkdir(parents=True, exist_ok=True)
    summary: dict = {"program": program, "program_file": Path(args.program).name,
                     "host_cpus": os.cpu_count(), "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

    print("demos ...", flush=True)
    ds = generate_demos(program, n=args.demos, seed=0, out_dir=work / "demos")
    summary["demos"] = ds.to_dict()
    print(" ", ds.to_dict(), flush=True)

    print("train ...", flush=True)
    tr = train_policy(ds.path, work / "policy.pt", epochs=args.epochs,
                      on_epoch=lambda e, l: print(f"  epoch {e:2d}  loss {l:.4f}", flush=True))
    summary["train"] = tr
    (out / "loss_curve.json").write_text(json.dumps(tr["loss_curve"]))

    print("evaluate ...", flush=True)
    gate = evaluate_policy(program, tr["policy_path"], trials=20, seed=0)
    extra = evaluate_policy(program, tr["policy_path"], trials=100, seed=1000)
    scripted = [run_episode(program, "scripted", 1000 + i) for i in range(100)]
    summary["eval_gate"] = gate
    summary["eval_extra"] = {"success_rate": extra["success_rate"], "seconds": extra["seconds"],
                             "failures": [t for t in extra["trials"] if not t["success"]]}
    summary["scripted"] = {"success_rate": sum(r["success"] for r in scripted) / len(scripted),
                           "failures": [{"seed": 1000 + i, "reason": r["reason"]}
                                        for i, r in enumerate(scripted) if not r["success"]]}
    print("  gate", gate["success_rate"], "extra", extra["success_rate"], "scripted",
          summary["scripted"]["success_rate"], flush=True)

    if args.extra_program:
        prog2 = json.loads(Path(args.extra_program).read_text())
        print("extra program ...", flush=True)
        ds2 = generate_demos(prog2, n=args.demos, seed=0, out_dir=work / "extra" / "demos")
        tr2 = train_policy(ds2.path, work / "extra" / "policy.pt", epochs=args.epochs)
        ev2 = evaluate_policy(prog2, tr2["policy_path"], trials=20, seed=0)
        summary["extra_program"] = {"file": Path(args.extra_program).name, "program": prog2,
                                    "demos": ds2.to_dict(), "train_seconds": tr2["seconds"],
                                    "success_rate": ev2["success_rate"],
                                    "failures": [t for t in ev2["trials"] if not t["success"]]}
        print("  extra", ev2["success_rate"], flush=True)

    print("videos ...", flush=True)
    summary["videos"] = {
        "scripted": record(program, "scripted", 0, out / "scripted_run.mp4", "scripted expert"),
        "policy": record(program, "policy", 0, out / "policy_run.mp4", "trained BC policy",
                         policy_path=tr["policy_path"]),
    }
    if not args.skip_gr00t:
        g = record(program, "gr00t", 0, out / "gr00t_run.mp4", "GR00T N1.7 on chip 3", with_robot_cams=True)
        summary["videos"]["gr00t"] = g
        lat = run_gr00t_latency(program)
        summary["gr00t_latency"] = lat
        (out / "gr00t_latency.json").write_text(json.dumps(lat, indent=1))
    (out / "summary.json").write_text(json.dumps(summary, indent=1, default=str))
    write_results(out, summary)
    print("wrote", out, flush=True)


def run_gr00t_latency(program) -> dict:
    """A full GR00T episode without video, to time the closed loop on its own."""
    from tacit_sim import Runner

    runner = Runner(program, "gr00t", seed=1)
    t0 = time.time()
    r = runner.run_episode()
    wall = time.time() - t0
    calls = runner.gr00t_calls
    ms = np.array([c["ms"] for c in calls])
    srv = np.array([c["server_ms"] for c in calls if c["server_ms"] is not None])
    dev = np.array([c["device_ms"] for c in calls if c["device_ms"] is not None])

    def st(a):
        return {"p50": round(float(np.median(a)), 1), "p90": round(float(np.percentile(a, 90)), 1),
                "max": round(float(a.max()), 1), "mean": round(float(a.mean()), 1)} if len(a) else None

    return {"episode": r, "calls": len(calls), "sim_seconds": r["seconds"], "wall_seconds": round(wall, 1),
            "round_trip_ms": st(ms), "server_ms": st(srv), "device_ms": st(dev),
            "requery_every_gr00t_steps": 8, "gr00t_hz": 15, "image_size": [320, 180],
            "per_call": calls}


def write_results(out: Path, s: dict) -> None:
    g, e, sc = s["eval_gate"], s["eval_extra"], s["scripted"]
    tr, ds = s["train"], s["demos"]
    lines = [
        "# Sim evidence",
        "",
        f"Generated {s['date']} by `sim/scripts/make_evidence.py` on program `{s['program_file']}`:",
        "",
        "```json", json.dumps(s["program"]), "```",
        "",
        "## Success rates",
        "",
        "| Run | Trials | Seeds | Success |",
        "|---|---:|---|---:|",
        f"| BC policy (merge gate) | 20 | 0-19 | **{pct(g['success_rate'])}** |",
        f"| BC policy (extra) | 100 | 1000-1099 | {pct(e['success_rate'])} |",
        f"| Scripted expert (baseline) | 100 | 1000-1099 | {pct(sc['success_rate'])} |",
        "",
        "Gate trials:",
        "",
        "| Seed | Success | Steps | Reason |",
        "|---:|---|---:|---|",
    ]
    for t in g["trials"]:
        lines.append(f"| {t['seed']} | {'yes' if t['success'] else 'no'} | {t['steps']} | {t['reason'] or ''} |")
    if e["failures"]:
        lines += ["", "Extra-trial failures: " + "; ".join(f"seed {f['seed']}: {f['reason']}" for f in e["failures"])]
    if "extra_program" in s:
        x = s["extra_program"]
        lines += ["", f"Second program, `{x['file']}` (three parts, two sharing a bin), trained the same way "
                  f"({x['demos']['n']} demos, {x['train_seconds']} s of training): **{pct(x['success_rate'])}** "
                  "over 20 trials (seeds 0-19)."
                  + ("" if not x["failures"] else " Failures: " + "; ".join(f"seed {f['seed']}: {f['reason']}" for f in x["failures"])),
                  "", "```json", json.dumps(x["program"]), "```"]
    lines += [
        "",
        "## Training",
        "",
        f"- Demos: {ds['n']} randomised episodes with noise injection, {ds['episodes_ok']} completed "
        f"({pct(ds['success_rate'])}) and used; {ds['frames']} frames; {ds['seconds']} s on {min(8, (s['host_cpus'] or 2) // 2)} processes.",
        f"- Policy: chunked MLP (3 x 512), {tr['frames']} frames, {len(tr['loss_curve'])} epochs in "
        f"{tr['seconds']} s on CPU; final train loss {tr['loss_curve'][-1][1]:.4f}, val loss {tr['val_loss']:.4f} "
        "(`loss_curve.json`).",
        "",
        "## Videos (offscreen MuJoCo renders, software EGL)",
        "",
    ]
    for k, v in s["videos"].items():
        lines.append(f"- `{v['video']}`: {k}, seed 0, success {v['success']}, {v['seconds']} s of sim"
                     + (f", reason: {v['reason']}" if v["reason"] else ""))
    if "gr00t_latency" in s:
        L = s["gr00t_latency"]
        lines += [
            "",
            "## GR00T N1.7 closed loop (chip 3, port 21030)",
            "",
            f"Full episode (seed 1, {L['sim_seconds']} s of sim, {L['wall_seconds']} s wall): "
            f"{L['calls']} queries, success {L['episode']['success']}"
            + (f" ({L['episode']['reason']})" if L["episode"]["reason"] else "") + ".",
            "",
            "| Latency per query | p50 | p90 | max | mean |",
            "|---|---:|---:|---:|---:|",
        ]
        for k, label in (("round_trip_ms", "round trip from the sim (ms)"), ("server_ms", "server total (ms)"),
                         ("device_ms", "device (ms)")):
            v = L[k]
            if v:
                lines.append(f"| {label} | {v['p50']} | {v['p90']} | {v['max']} | {v['mean']} |")
        lines += ["", "Two cameras x two frames (t-15, t) at 320x180 JPEG, DROID state, re-query every 8 "
                  "action steps (0.53 s). GR00T is the foundation-model baseline; the sim is off its "
                  "training distribution, so it is not expected to finish the task."]
    (out / "results.md").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    sys.exit(main())
