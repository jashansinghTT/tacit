#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Probe the four vision members over HTTP: fixtures, latency, output comparison, concurrency.

The same requests (built from the images in backend/tests/fixtures/<member>/) are sent to a
standalone package or to the cohost group, so their outputs can be compared number for number.

    vision_probe.py fixtures <member> --port P      # write request/response fixtures + a full baseline
    vision_probe.py bench <member> --port P -n 20   # p50 latency over n requests
    vision_probe.py compare <member> --port P --baseline DIR
    vision_probe.py concurrent --base-port 21000 -n 10   # all four members at once

Run with numpy available, e.g. ``uv run --with numpy python vision_probe.py ...``.
"""
from __future__ import annotations

import argparse
import base64
import copy
import io
import json
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[3]
FIXTURES = REPO / "backend" / "tests" / "fixtures"
MEMBERS = ("hamer", "gaze", "rfdetr", "vggt")
PORT_OFFSET = {m: i for i, m in enumerate(MEMBERS)}


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


def requests_for(member: str) -> dict:
    """name -> request body. The first entry is the member's main fixture request."""
    d = FIXTURES / member
    if member == "hamer":
        img = b64(d / "sample1.jpg")
        return {"request": {"image": img, "bbox": [20, 170, 295, 260], "is_right": True},
                "request_left": {"image": img, "bbox": [130, 340, 320, 510], "is_right": False}}
    if member == "gaze":
        img = b64(d / "source_1.jpg")
        boxes = [[116, 28, 176, 104], [269, 37, 301, 81], [87, 57, 107, 76]]
        return {"request": {"image": img, "bboxes": boxes, "heatmap_format": "none"},
                "request_heatmap": {"image": img, "bboxes": boxes, "heatmap_format": "npz"}}
    if member == "rfdetr":
        return {"request": {"image": b64(d / "demo_source.jpg"), "threshold": 0.5}}
    if member == "vggt":
        views = [b64(d / "view_1.jpg"), b64(d / "view_2.jpg")]
        return {"request": {"images": views, "output_format": "npz"},
                "request_json": {"images": views, "output_format": "json", "json_stride": 32}}
    raise SystemExit(f"unknown member {member!r}")


def post(port: int, body: dict, timeout: float = 600.0) -> tuple[dict, float]:
    data = json.dumps(body).encode()
    req = urllib.request.Request(f"http://127.0.0.1:{port}/predict", data=data,
                                 headers={"Content-Type": "application/json"})
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            out = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"port {port}: HTTP {e.code}: {e.read()[:500]!r}")
    return out, (time.perf_counter() - t0) * 1000.0


# --------------------------------------------------------------------------- fixtures
def shrink(member: str, resp: dict) -> dict:
    """Drop base64 blobs from a response (fixtures stay small); note what was dropped."""
    r = copy.deepcopy(resp)
    if member == "gaze":
        for p in r.get("predictions", []):
            for k in ("heatmap_png", "heatmap_npz", "heatmap"):
                if k in p:
                    p[k] = f"<omitted: {len(str(p[k]))} chars>"
        for k in ("heatmap_npz",):
            if k in r:
                r[k] = f"<omitted: {len(str(r[k]))} chars>"
    if member == "vggt" and isinstance(r.get("dense"), dict) and r["dense"].get("encoding") == "npz":
        r["dense"]["data"] = f"<omitted: {len(r['dense'].get('data') or '')} chars of base64 npz>"
    return r


def cmd_fixtures(a) -> None:
    out = FIXTURES / a.member
    base = Path(a.baseline_out) / a.member if a.baseline_out else None
    if base:
        base.mkdir(parents=True, exist_ok=True)
    for name, body in requests_for(a.member).items():
        resp, ms = post(a.port, body)
        print(f"{a.member} {name}: {ms:.1f} ms")
        (out / f"{name}.json").write_text(json.dumps(body) + "\n")
        (out / name.replace("request", "response")).with_suffix(".json").write_text(
            json.dumps(shrink(a.member, resp), indent=1) + "\n")
        if base:
            (base / f"{name.replace('request', 'response')}.json").write_text(json.dumps(resp))


# --------------------------------------------------------------------------- latency
def timing_field(member: str, resp: dict) -> float | None:
    t = resp.get("timing_ms") or {}
    return t.get({"hamer": "device", "gaze": "inference", "rfdetr": "inference", "vggt": "forward"}[member])


def cmd_bench(a) -> dict:
    body = next(iter(requests_for(a.member).values()))
    for _ in range(2):
        post(a.port, body)
    wall, dev, server = [], [], []
    for _ in range(a.n):
        resp, ms = post(a.port, body)
        wall.append(ms)
        dev.append(timing_field(a.member, resp))
        server.append((resp.get("timing_ms") or {}).get("total"))
    res = {"member": a.member, "n": a.n, "wall_ms_p50": round(statistics.median(wall), 2),
           "wall_ms_min": round(min(wall), 2), "wall_ms_max": round(max(wall), 2)}
    if all(v is not None for v in dev):
        res["model_ms_p50"] = round(statistics.median(dev), 2)
    if all(v is not None for v in server):
        res["server_total_ms_p50"] = round(statistics.median(server), 2)
    print(json.dumps(res))
    return res


# --------------------------------------------------------------------------- compare
def pcc(a, b) -> float:
    a = np.asarray(a, dtype=np.float64).ravel()
    b = np.asarray(b, dtype=np.float64).ravel()
    a, b = a - a.mean(), b - b.mean()
    den = np.linalg.norm(a) * np.linalg.norm(b)
    return float(a @ b / den) if den > 0 else float(np.array_equal(a, b))


def maxdiff(a, b) -> float:
    return float(np.max(np.abs(np.asarray(a, dtype=np.float64) - np.asarray(b, dtype=np.float64))))


def iou(p, q) -> float:
    ix = max(0.0, min(p[2], q[2]) - max(p[0], q[0]))
    iy = max(0.0, min(p[3], q[3]) - max(p[1], q[1]))
    inter = ix * iy
    union = (p[2] - p[0]) * (p[3] - p[1]) + (q[2] - q[0]) * (q[3] - q[1]) - inter
    return inter / union if union > 0 else 0.0


def npz(data: str) -> dict:
    with np.load(io.BytesIO(base64.b64decode(data))) as z:
        return {k: z[k] for k in z.files}


def compare(member: str, name: str, base: dict, new: dict) -> dict:
    if member == "hamer":
        keys = ("rotmats", "betas", "cam", "cam_t_full")
        va = np.concatenate([np.ravel(base[k]) for k in keys])
        vb = np.concatenate([np.ravel(new[k]) for k in keys])
        return {"pcc": round(pcc(va, vb), 6), "max_abs": maxdiff(va, vb),
                "cam_t_full_max_abs": maxdiff(base["cam_t_full"], new["cam_t_full"])}
    if member == "gaze":
        pa, pb = base["predictions"], new["predictions"]
        out = {"heads": len(pb), "inout_max_abs": maxdiff([p["inout"] for p in pa], [p["inout"] for p in pb]),
               "target_px_max": max(float(np.hypot(p["gaze_target"]["x"] - q["gaze_target"]["x"],
                                                   p["gaze_target"]["y"] - q["gaze_target"]["y"]))
                                    for p, q in zip(pa, pb))}
        if "heatmap_npz" in base and "heatmap_npz" in new:
            ha, hb = npz(base["heatmap_npz"])["heatmap"], npz(new["heatmap_npz"])["heatmap"]
            out["heatmap_pcc_min"] = round(min(pcc(x, y) for x, y in zip(ha, hb)), 6)
            out["heatmap_max_abs"] = maxdiff(ha, hb)
        return out
    if member == "rfdetr":
        da, db = base["detections"], new["detections"]
        used, ious, dscore = set(), [], []
        for d in da:
            best = max(((iou(d["box"], e["box"]), j) for j, e in enumerate(db)
                        if e["label"] == d["label"] and j not in used), default=(0.0, None))
            if best[1] is not None:
                used.add(best[1])
                ious.append(best[0])
                dscore.append(abs(d["score"] - db[best[1]]["score"]))
        return {"n_base": len(da), "n_new": len(db), "matched": len(ious),
                "iou_min": round(min(ious), 6) if ious else None,
                "score_max_abs": round(max(dscore), 6) if dscore else None}
    if member == "vggt":
        out = {"extrinsic_max_abs": maxdiff(base["extrinsic"], new["extrinsic"]),
               "intrinsic_max_abs": maxdiff(base["intrinsic"], new["intrinsic"]),
               "pose_enc_max_abs": maxdiff(base["pose_enc"], new["pose_enc"])}
        if base["dense"].get("encoding") == "npz":
            a_, b_ = npz(base["dense"]["data"]), npz(new["dense"]["data"])
        else:
            a_, b_ = base["dense"]["arrays"], new["dense"]["arrays"]
        for k in sorted(a_):
            av = np.asarray(a_[k] if not isinstance(a_[k], dict) else a_[k].get("data"), dtype=np.float64)
            bv = np.asarray(b_[k] if not isinstance(b_[k], dict) else b_[k].get("data"), dtype=np.float64)
            out[f"{k}_pcc"] = round(pcc(av, bv), 6)
            out[f"{k}_max_abs"] = maxdiff(av, bv)
        return out
    raise SystemExit(member)


def cmd_compare(a) -> dict:
    base_dir = Path(a.baseline) / a.member
    res = {}
    for name, body in requests_for(a.member).items():
        rname = name.replace("request", "response")
        base = json.loads((base_dir / f"{rname}.json").read_text())
        new, ms = post(a.port, body)
        res[name] = compare(a.member, name, base, new)
        res[name]["wall_ms"] = round(ms, 1)
        if a.save:
            Path(a.save).mkdir(parents=True, exist_ok=True)
            (Path(a.save) / f"{a.member}_{rname}.json").write_text(json.dumps(new))
    print(json.dumps({a.member: res}))
    return res


# --------------------------------------------------------------------------- concurrency
def exact(cmp: dict) -> bool:
    """A comparison that found no difference at all."""
    for k, v in cmp.items():
        if k.endswith(("max_abs", "_px_max")) and v != 0.0:
            return False
        if (k == "pcc" or k.endswith("_pcc") or k.endswith("_pcc_min") or k == "iou_min") and v != 1.0:
            return False
        if k == "matched" and v != cmp.get("n_base"):
            return False
    return True


def cmd_concurrent(a) -> None:
    """All four members at once, each sending its main request back to back (``--counts``);
    every response is compared with the baseline, so interleaving cannot hide a wrong answer."""
    counts = {m: a.n for m in MEMBERS}
    for item in filter(None, (a.counts or "").split(",")):
        k, _, v = item.partition("=")
        counts[k] = int(v)
    members = [m for m in MEMBERS if counts.get(m, 0) > 0]
    results, errors = {}, []
    barrier = threading.Barrier(len(members))

    def run(member: str) -> None:
        try:
            body = next(iter(requests_for(member).values()))
            base = json.loads((Path(a.baseline) / member / "response.json").read_text()) if a.baseline else None
            barrier.wait()
            walls, n_exact, first_diff = [], 0, None
            t0 = time.perf_counter()
            for _ in range(counts[member]):
                resp, ms = post(a.base_port + PORT_OFFSET[member], body)
                walls.append(ms)
                if base is not None:
                    c = compare(member, "request", base, resp)
                    if exact(c):
                        n_exact += 1
                    elif first_diff is None:
                        first_diff = c
            walls.sort()
            results[member] = {"n": len(walls), "wall_ms_p50": round(statistics.median(walls), 1),
                               "wall_ms_p95": round(walls[min(len(walls) - 1, int(0.95 * len(walls)))], 1),
                               "wall_ms_max": round(walls[-1], 1),
                               "elapsed_s": round(time.perf_counter() - t0, 2)}
            if base is not None:
                results[member]["identical_to_baseline"] = f"{n_exact}/{len(walls)}"
                if first_diff is not None:
                    results[member]["first_difference"] = first_diff
        except BaseException as e:  # noqa: BLE001
            errors.append(f"{member}: {e}")

    threads = [threading.Thread(target=run, args=(m,)) for m in members]
    t0 = time.perf_counter()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    summary = {m: results.get(m) for m in members}
    summary["wall_s"] = round(time.perf_counter() - t0, 2)
    summary["errors"] = errors
    print(json.dumps(summary, indent=1))
    bad = errors or [m for m in members if results.get(m, {}).get("first_difference")]
    if bad:
        sys.exit(1)


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fixtures")
    f.add_argument("member", choices=MEMBERS)
    f.add_argument("--port", type=int, required=True)
    f.add_argument("--baseline-out", help="also save the full, unshrunk responses here")
    b = sub.add_parser("bench")
    b.add_argument("member", choices=MEMBERS)
    b.add_argument("--port", type=int, required=True)
    b.add_argument("-n", type=int, default=20)
    c = sub.add_parser("compare")
    c.add_argument("member", choices=MEMBERS)
    c.add_argument("--port", type=int, required=True)
    c.add_argument("--baseline", required=True)
    c.add_argument("--save", help="save the full new responses here")
    k = sub.add_parser("concurrent")
    k.add_argument("--base-port", type=int, default=21000)
    k.add_argument("-n", type=int, default=10, help="requests per member (default for --counts)")
    k.add_argument("--counts", help="per-member request counts, e.g. hamer=200,gaze=200,rfdetr=200,vggt=5")
    k.add_argument("--baseline")
    a = ap.parse_args()
    {"fixtures": cmd_fixtures, "bench": cmd_bench, "compare": cmd_compare, "concurrent": cmd_concurrent}[a.cmd](a)


if __name__ == "__main__":
    main()
