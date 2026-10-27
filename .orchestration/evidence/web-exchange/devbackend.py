"""A private copy of the real Tacit backend for exchange UI work while chip 0 (vision) is down.

Runs the backend code from this worktree on its own port and data dir, with every model endpoint
mocked in-process (respx) using the backend's own test fixtures, so the real pipeline produces
ready, VGGT-verified skills without touching any chip. Never talks to ports 21000-21039.

    TACIT_DATA=<dir> PYTHONPATH=<worktree>/backend python devbackend.py --port 8714 [--seed]
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import io
import json
import os
import shutil
import sys
import threading
import time
import wave
from pathlib import Path

WT = Path(os.environ.get("TACIT_WT", "/home/jashan/tacit-wt/web-exchange"))
DATA = Path(os.environ["TACIT_DATA"])
os.environ["TACIT_SEED"] = "0"
os.environ.setdefault("TACIT_ROOT", str(WT))
sys.path.insert(0, str(WT / "backend"))
sys.path.insert(0, str(WT / "backend" / "tests"))

(DATA / "models").mkdir(parents=True, exist_ok=True)
for f in (Path.home() / "tacit/data/models").glob("*.task"):
    dst = DATA / "models" / f.name
    if not dst.exists():
        os.symlink(f, dst)

import httpx  # noqa: E402
import numpy as np  # noqa: E402
import respx  # noqa: E402
import uvicorn  # noqa: E402

FIX = WT / "backend/tests/fixtures"
RAW = Path.home() / "tacit/data/samples/raw"

SAMPLES = [
    {"id": "smp_pack", "file": "sd_6898012.mp4", "title": "Pack a boxed order into a carrier bag", "expert": "u_maria",
     "steps": [
         ("Square the box on the bench", "Set the boxed order flat on the bench with the label facing you.",
          "A square box slides into the bag without catching the handles."),
         ("Open the carrier bag", "Hold the bag open with your left hand at the seam.",
          "Holding the seam keeps the bag from folding in while you load it."),
         ("Lower the box in flat", "Lower the box into the bag flat, label side out.",
          "Flat means the base takes the weight and the label stays readable."),
         ("Check the fold and seal", "Fold the top once and press the seal along its length.",
          "One clean fold is what the courier scanner expects."),
         ("Hand off to the outbound tote", "Lift by both handles and place the bag in the outbound tote.",
          "Both handles keep the box level so nothing shifts inside."),
     ],
     "labels": ["box", "bag", "tote"],
     "program": [{"op": "pick", "object": "box"}, {"op": "place", "target": "bag"}, {"op": "pick", "object": "bag"},
                 {"op": "place", "target": "outbound tote"}]},
    {"id": "smp_kit", "file": "sd_6898015.mp4", "title": "Kit a takeaway order for dispatch", "expert": "u_dev",
     "steps": [
         ("Stage the bag by the scale", "Stand the open bag beside the scale, handles out.",
          "Staging by the scale saves a reach for every item."),
         ("Load the heavy box first", "Place the largest box in the bag first, flat on the base.",
          "Heavy items at the bottom stop lighter ones getting crushed."),
         ("Top up the light items", "Add the light items on top, upright.",
          "Upright containers do not leak in transit."),
         ("Close and tag", "Fold the bag top and stick the order tag across the fold.",
          "A tag across the fold shows if the bag was opened."),
     ],
     "labels": ["box", "bag", "cup"],
     "program": [{"op": "pick", "object": "box"}, {"op": "place", "target": "bag"}]},
    {"id": "smp_prep", "file": "pexels_6707612.mp4", "title": "Prep produce for the blender line", "expert": "u_maria",
     "steps": [
         ("Pick the ripe pieces", "Take the ripe pieces from the bowl, one at a time.",
          "Under-ripe fruit jams the blade and changes the taste."),
         ("Trim on the board", "Trim the ends on the board, away from your hand.",
          "Cutting away from the hand is the line's safety rule."),
         ("Quarter and seed", "Quarter each piece and remove the seeds.",
          "Seeds left in turn the batch bitter."),
         ("Load the jug", "Drop the pieces into the jug, heavy pieces first.",
          "Heavy pieces at the base blend evenly."),
     ],
     "labels": ["apple", "bowl", "knife"],
     "program": [{"op": "pick", "object": "apple"}, {"op": "place", "target": "bowl"}]},
]


CURRENT = {"sample": None}


def _hamer(request: httpx.Request) -> httpx.Response:
    # The fixture's camera translation belongs to another image; drop it so the twin places each
    # hand at the MediaPipe wrist depth, as the backend does whenever HaMeR has no usable depth.
    out = json.loads((FIX / "hamer/response.json").read_text())
    out["cam_t_full"] = [0.0, 0.0, 100.0]
    out["cam_t"] = [0.0, 0.0, 100.0]
    return httpx.Response(200, json=out)


def _rfdetr(request: httpx.Request) -> httpx.Response:
    out = json.loads((FIX / "rfdetr/response.json").read_text())
    labels = (CURRENT["sample"] or SAMPLES[0])["labels"]
    seen: dict[str, str] = {}
    for d in out.get("detections", []):
        if d.get("label") in ("person", "dining table", "chair"):
            continue
        d["label"] = seen.setdefault(d["label"], labels[len(seen) % len(labels)])
    return httpx.Response(200, json=out)


def _wav(seconds=1.2, rate=16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        t = np.arange(int(seconds * rate)) / rate
        w.writeframes((np.sin(2 * np.pi * 220 * t) * 1200).astype(np.int16).tobytes())
    return buf.getvalue()


def _vggt() -> dict:
    from test_units import _fake_vggt
    v = _fake_vggt()
    buf = io.BytesIO()
    np.savez_compressed(buf, depth=v["depth"].astype(np.float16), depth_conf=v["depth_conf"].astype(np.float16),
                        world_points=v["world_points"], world_points_conf=v["world_points_conf"].astype(np.float16))
    return {"extrinsic": v["extrinsic"].tolist(), "intrinsic": v["intrinsic"].tolist(), "preprocess": v["preprocess"],
            "dense": {"data": base64.b64encode(buf.getvalue()).decode()}, "timing_ms": {}}


def _sample_for(prompt: str) -> dict:
    for s in SAMPLES:
        if s["title"] in prompt:
            return s
    return SAMPLES[0]


def _llm(request: httpx.Request) -> httpx.Response:
    body = json.loads(request.content)
    prompt = body["messages"][-1]["content"]
    if body.get("stream"):
        words = ["Hold ", "the ", "seam ", "while ", "you ", "load ", "it. "]
        chunks = "".join(f"data: {json.dumps({'choices': [{'delta': {'content': w}}]})}\n\n" for w in words)
        return httpx.Response(200, text=chunks + "data: [DONE]\n\n", headers={"content-type": "text/event-stream"})
    smp = _sample_for(prompt)
    if "pending_questions" in prompt:
        timeline = json.loads(prompt.split("Timeline (JSON):\n", 1)[1].split("\n\nReturn JSON", 1)[0])
        steps = []
        for st in timeline["steps"]:
            i = st["index"]
            t, ins, why = smp["steps"][(i - 1) % len(smp["steps"])]
            steps.append({"index": i, "title": t, "instruction": ins, "why": why, "why_source": "inferred",
                          "tips": ["Keep the bench clear of loose wrap."]})
        content = json.dumps({"title": smp["title"], "summary": f"{smp['title']} the way the line does it, so it ships right the first time.",
                              "steps": steps, "robot_program": smp["program"],
                              "pending_questions": [{"index": 1, "question": "Why that order?"}]})
    elif "sop_markdown" in prompt:
        sk = json.loads(prompt.split("Skill (JSON):\n", 1)[1].split("\n\nReturn JSON", 1)[0])
        lines = [f"# {sk['title']}", "", sk["summary"], "", "## Before you start", "- Clear the bench.", "", "## Steps"]
        for s in sk["steps"]:
            lines += [f"{s['index']}. **{s['title']}**. {s['instruction']}  ", f"   Why: {s['why']}"]
        content = json.dumps({"sop_markdown": "\n".join(lines),
                              "quiz": [{"q": "Why does the order matter?", "choices": ["Speed", "Nothing gets crushed", "Habit"],
                                        "answer": 1, "explain": "Heavy first protects the light items."}],
                              "safety": ["Lift with both handles.", "Keep blades pointed away from you."]})
    else:
        content = "Why did you do it in that order?"
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def mock_models() -> respx.MockRouter:
    m = respx.mock(assert_all_called=False, assert_all_mocked=True)
    m.start()
    m.post("http://127.0.0.1:21002/predict").mock(side_effect=_rfdetr)
    m.post("http://127.0.0.1:21001/predict").respond(json=json.loads((FIX / "gaze/response.json").read_text()))
    m.post("http://127.0.0.1:21000/predict").mock(side_effect=_hamer)
    m.post("http://127.0.0.1:21003/predict").respond(json=_vggt())
    m.post("http://127.0.0.1:21020/v1/chat/completions").mock(side_effect=_llm)
    m.post(url__regex=r"http://127\.0\.0\.1:21011/v1/.*").respond(content=_wav(), headers={"content-type": "audio/wav"})
    m.post("http://127.0.0.1:21010/v1/audio/transcriptions").respond(json={"text": "Because it keeps the bag square."})
    m.get(url__regex=r"http://127\.0\.0\.1:210\d\d/.*").respond(json={"ok": True, "members": {}})
    m.route(url__regex=r"http://127\.0\.0\.1:210\d\d/.*").respond(503)
    m.route(host="127.0.0.1").pass_through()
    m.route(host="localhost").pass_through()
    return m


def write_samples() -> None:
    sdir = DATA / "samples"
    sdir.mkdir(parents=True, exist_ok=True)
    items = []
    for s in SAMPLES:
        dst = sdir / s["file"]
        if not dst.exists():
            shutil.copy2(RAW / s["file"], dst)
        items.append({"id": s["id"], "title": s["title"], "video": f"/media/samples/{s['file']}",
                      "thumb": f"/media/samples/{s['file']}.jpg", "duration": 20.0, "kind": "real"})
    (sdir / "samples.json").write_text(json.dumps(items))


def seed(port: int, list_first: int) -> None:
    """Process each sample through the real pipeline (mocked models); list the first `list_first` ones."""
    base = f"http://127.0.0.1:{port}"
    c = httpx.Client(base_url=base, timeout=60, transport=httpx.HTTPTransport())
    for _ in range(100):
        try:
            if c.get("/api/health").status_code == 200:
                break
        except httpx.HTTPError:
            time.sleep(0.3)
    have = {s["title"] for s in c.get("/api/skills").json()}
    for k, s in enumerate(SAMPLES):
        if s["title"] in have:
            continue
        h = {"X-Tacit-User": s["expert"]}
        CURRENT["sample"] = s
        sid = c.post("/api/skills", json={"source": "sample", "sample_id": s["id"]}, headers=h).json()["skill_id"]
        job = c.post(f"/api/skills/{sid}/process", headers=h).json()["job_id"]
        while (j := c.get(f"/api/jobs/{job}").json())["status"] in ("queued", "running"):
            time.sleep(1)
        print(f"seed {s['id']} -> {sid}: {j['status']} {j.get('error') or ''}", flush=True)
        if j["status"] == "done" and k < list_first:
            r = c.post("/api/exchange/listings", headers=h, json={
                "skill_id": sid, "consent": {"expert_confirmed": True, "voice_text": True},
                "price": {"training": 39 + 10 * k, "robot_deploy": 449 + 50 * k, "exclusive": 8900 + 1000 * k},
                "industry": "Logistics" if k == 1 else "Food and beverage",
                "robot_types": ["franka", "ur5"] if k == 1 else ["franka"]})
            print("listed", r.status_code, r.json().get("id"), flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8714)
    ap.add_argument("--seed", action="store_true")
    ap.add_argument("--list-first", type=int, default=1)
    a = ap.parse_args()
    write_samples()
    mock_models()
    from tacit.app import app
    if a.seed:
        threading.Thread(target=seed, args=(a.port, a.list_first), daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=a.port, log_level="warning")


if __name__ == "__main__":
    asyncio.set_event_loop_policy(None)
    main()
