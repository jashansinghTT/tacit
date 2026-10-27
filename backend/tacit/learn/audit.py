"""Quality and safety use case: compare a worker's recorded run with the expert's skill, step by step.

Each expert step is looked for in the run (in order), matched on the objects handled and the hand's
motion; the report says which steps were done, skipped or out of order, how long each took against
the expert, and whether the worker looked where the expert looked (the gaze check that catches
"did not check the gauge first").
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import numpy as np

from .. import jobs
from ..db import now
from ..models import llm
from ..models.base import ModelUnavailable
from ..perception.frame import analyze
from ..perception.mediapipe_runner import MediaPipeRunner
from ..perception.timeline import segment_steps
from ..pipeline.video import frames as video_frames, probe, transcode
from ..storage import load_skill, media_dir, media_url, new_id, read_json, skill_dir, tracks_path, write_json
from .practice import features, subsequence_dtw, vec

STAGES = ["decode", "perceive", "align", "report"]


def audits_dir(skill_id: str) -> Path:
    d = skill_dir(skill_id) / "audits"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _step_feats(frames: list[dict], t0: float, t1: float, hand: str | None) -> np.ndarray:
    fts = [features(f, hand) for f in frames if t0 <= f["t"] <= t1]
    fts = [x for x in fts if x]
    return np.stack([vec(x) for x in fts]) if fts else np.zeros((0, 4), np.float32)


def _gaze_labels(frames: list[dict], t0: float, t1: float) -> set[str]:
    return {f["gaze"]["target"] for f in frames if t0 <= f["t"] <= t1 and f.get("gaze") and f["gaze"].get("target")}


def compare(skill: dict, expert_frames: list[dict], run_frames: list[dict], run_steps: list[dict]) -> dict:
    """Greedy in-order alignment of expert steps to the run's steps (object overlap + motion DTW)."""
    rows, cursor = [], 0
    for es in skill.get("steps", []):
        ref = _step_feats(expert_frames, es["t_start"], es["t_end"], es.get("hand"))
        best, best_score = None, 0.0
        for j in range(len(run_steps)):
            rs = run_steps[j]
            obj = 1.0 if set(es.get("objects", [])) & set(rs.get("objects", [])) else (0.5 if not es.get("objects") else 0.0)
            q = _step_feats(run_frames, rs["t_start"], rs["t_end"], rs.get("hand"))
            motion = float(np.exp(-1.6 * subsequence_dtw(ref, q)[0])) if len(ref) and len(q) else 0.0
            order = 1.0 if j >= cursor else 0.6
            score = (0.5 * obj + 0.5 * motion) * order
            if score > best_score:
                best, best_score = j, score
        row = {"index": es["index"], "title": es.get("title"), "expert_seconds": round(es["t_end"] - es["t_start"], 1)}
        if best is None or best_score < 0.35:
            row.update(status="missing", score=round(best_score, 3))
        else:
            rs = run_steps[best]
            row.update(status="done" if best >= cursor else "out_of_order", score=round(best_score, 3),
                       run_t=[round(rs["t_start"], 1), round(rs["t_end"], 1)], run_seconds=round(rs["t_end"] - rs["t_start"], 1))
            eg = _gaze_labels(expert_frames, es["t_start"], es["t_end"]) - {"workbench"}
            rg = _gaze_labels(run_frames, rs["t_start"], rs["t_end"])
            row["gaze_check"] = {"expert_looked_at": sorted(eg), "worker_looked_at": sorted(rg),
                                 "ok": (not eg) or bool(eg & rg)}
            cursor = max(cursor, best + 1)
        rows.append(row)
    done = sum(1 for r in rows if r["status"] == "done")
    gaze_ok = sum(1 for r in rows if (r.get("gaze_check") or {}).get("ok"))
    overall = round(float(np.mean([r["score"] for r in rows])) if rows else 0.0, 3)
    return {"steps": rows, "summary": {"steps_total": len(rows), "done": done,
                                       "out_of_order": sum(1 for r in rows if r["status"] == "out_of_order"),
                                       "missing": sum(1 for r in rows if r["status"] == "missing"),
                                       "gaze_checks_ok": gaze_ok, "score": overall}}


async def _narrative(skill: dict, report: dict) -> str:
    msgs = [{"role": "system", "content": "You are a quality lead. In at most 3 short sentences, tell a worker how their run of a "
                                          "task compared with the expert's: what they did well, what they skipped or did out of order, "
                                          "and one thing to fix first. Plain words, no lists."},
            {"role": "user", "content": json.dumps({"skill": skill.get("title"), "report": report["steps"]}, ensure_ascii=False)}]
    text, _ = await llm.chat(msgs, max_tokens=300)
    return text


async def run_audit(job: jobs.Job, skill_id: str, video: Path, audit_id: str, worker: str) -> dict:
    skill = load_skill(skill_id)
    expert_frames = (read_json(tracks_path(skill_id)) or {}).get("frames", [])
    job.start_stage("decode")
    dst = media_dir(skill_id) / f"audit_{audit_id}.mp4"
    await transcode(video, dst)
    info = probe(dst)
    job.finish_stage("decode", detail=f"{info['duration']:.1f} s")
    job.start_stage("perceive", models=["MediaPipe@cpu", "HaMeR@0", "Gaze-LLE@0", "RF-DETR@0"])
    runner = MediaPipeRunner(video=True)
    run_frames, pending = [], []
    try:
        for t, rgb in video_frames(dst, fps=10.0):
            pending.append(asyncio.ensure_future(analyze(rgb, t, runner)))
            if len(pending) >= 3:
                run_frames.append(await pending.pop(0))
                if len(run_frames) % 20 == 0:
                    job.stage_progress(len(run_frames) / max(1, info["duration"] * 10))
        for p in pending:
            run_frames.append(await p)
    finally:
        await asyncio.to_thread(runner.close)
    job.finish_stage("perceive", detail=f"{len(run_frames)} frames")
    job.start_stage("align")
    run_steps = segment_steps(run_frames)
    report = compare(skill, expert_frames, run_frames, run_steps)
    job.finish_stage("align", detail=f"{report['summary']['done']}/{report['summary']['steps_total']} steps matched")
    job.start_stage("report", models=["gpt-oss-20b@2"])
    try:
        report["narrative"] = await _narrative(skill, report)
    except ModelUnavailable:
        report["narrative"] = None
    report.update({"id": audit_id, "skill_id": skill_id, "worker": worker, "video": media_url(dst), "created_at": now()})
    write_json(audits_dir(skill_id) / f"{audit_id}.json", report)
    job.finish_stage("report")
    return {"audit_id": audit_id, "summary": report["summary"]}


def list_audits(skill_id: str) -> list[dict]:
    out = []
    for p in sorted(audits_dir(skill_id).glob("*.json")):
        r = read_json(p) or {}
        out.append({k: r.get(k) for k in ("id", "worker", "created_at", "summary", "narrative", "video")})
    return sorted(out, key=lambda r: r.get("created_at") or "", reverse=True)


def new_audit_id() -> str:
    return new_id("aud")
