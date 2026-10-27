"""F2: turn a recorded or uploaded video into a ready skill (lesson, twin, verification, robot program)."""
from __future__ import annotations

import asyncio
import logging
import statistics
from collections import defaultdict
from pathlib import Path

import numpy as np

from .. import jobs
from ..db import now
from ..models.base import ModelUnavailable
from ..models import speech
from ..perception.frame import analyze
from ..perception.mediapipe_runner import MediaPipeRunner
from ..perception.timeline import IGNORE, segment_steps
from ..storage import (load_skill, media_dir, media_url, pointcloud_path, read_json, save_skill, skill_dir,
                       tracks_path, twin_path, write_json)
from . import geometry, preview, writer
from .video import frame_at, frames as video_frames, probe, save_jpeg, transcode

log = logging.getLogger("tacit.process")

STAGES = ["decode", "perceive", "steps", "write", "verify", "twin", "narrate", "ready"]
ANALYSIS_FPS = 10.0


def source_video(skill_id: str) -> Path:
    return media_dir(skill_id) / "source.mp4"


async def ensure_source(skill: dict) -> Path:
    dst = source_video(skill["id"])
    if dst.exists() and dst.stat().st_size > 0:
        return dst
    raw = Path(skill["source"]["raw_path"])
    await transcode(raw, dst)
    return dst


def models_used(frames: list[dict], extra: list[dict]) -> list[dict]:
    acc: dict[tuple, list[float]] = defaultdict(list)
    for sb in [s for f in frames for s in f.get("served_by", [])] + extra:
        acc[(sb["model"], sb.get("chip"), sb.get("backend", "tt"))].append(sb.get("ms", 0.0))
    out = [{"model": m, "chip": c, "backend": b, "calls": len(v), "p50_ms": round(statistics.median(v), 1)}
           for (m, c, b), v in acc.items()]
    return sorted(out, key=lambda r: (r["chip"] is None, r["chip"] if r["chip"] is not None else 9, r["model"]))


def _fallback_structure(steps: list[dict]) -> dict:
    out = []
    for s in steps:
        obj = s.get("object") or (s.get("objects") or ["part"])[0]
        out.append({"index": s["index"], "title": s.get("draft", "Step")[:48],
                    "instruction": s.get("draft", "Repeat the expert's movement."),
                    "why": "The expert does it this way; ask them why.", "why_source": "inferred", "tips": []})
        _ = obj
    prog = []
    for s in steps:
        if s.get("object"):
            prog += [{"op": "pick", "object": s["object"]}, {"op": "place", "target": s.get("to") or "tray"}]
    return {"title": "Recorded skill", "summary": "A hands-on task recorded by an expert.", "steps": out,
            "robot_program": prog, "pending_questions": []}


async def process_skill(job: jobs.Job, skill_id: str) -> dict:
    skill = load_skill(skill_id)
    if not skill:
        raise ValueError(f"no skill {skill_id}")
    skill["status"] = "processing"
    save_skill(skill)
    extra_served: list[dict] = []

    # decode --------------------------------------------------------------------------------
    job.start_stage("decode", detail="transcode for the browser, sample at 10 fps")
    src = await ensure_source(skill)
    info = probe(src)
    skill["source"].update({"video": media_url(src), "fps": info["fps"], "duration": info["duration"],
                            "width": info["width"], "height": info["height"]})
    mid = frame_at(src, info["duration"] * 0.5)
    if mid is not None:
        thumb = save_jpeg(mid, media_dir(skill_id) / "thumb.jpg", width=640)
        skill["thumb"] = media_url(thumb)
    save_skill(skill)
    job.finish_stage("decode", detail=f"{info['width']}x{info['height']}, {info['duration']:.1f} s")

    # perceive ------------------------------------------------------------------------------
    frames = (read_json(tracks_path(skill_id)) or {}).get("frames") if skill["source"].get("kind") == "live" else None
    if frames:
        job.start_stage("perceive", models=["captured live"], detail=f"{len(frames)} frames analysed during capture")
    else:
        job.start_stage("perceive", models=["MediaPipe@cpu", "HaMeR@0", "Gaze-LLE@0", "RF-DETR@0"])
        runner = MediaPipeRunner(video=True)
        frames = []
        n_total = max(1, int(info["duration"] * ANALYSIS_FPS))
        try:
            pending: list[asyncio.Task] = []
            for t, rgb in video_frames(src, fps=ANALYSIS_FPS):
                # MediaPipe needs frames in order; the chip calls inside analyze() overlap across frames.
                pending.append(asyncio.ensure_future(analyze(rgb, t, runner)))
                if len(pending) >= 3:
                    frames.append(await pending.pop(0))
                    if len(frames) % 10 == 0:
                        job.stage_progress(len(frames) / n_total, f"{len(frames)} / {n_total} frames")
            for p in pending:
                frames.append(await p)
        finally:
            runner.close()
        for f in frames:
            f.pop("rotmats", None)
        write_json(tracks_path(skill_id), {"fps": ANALYSIS_FPS, "width": info["width"], "height": info["height"], "frames": frames})
    down = sorted({u for f in frames for u in f.get("unavailable", [])})
    job.finish_stage("perceive", detail=f"{len(frames)} frames" + (f"; unavailable: {', '.join(down)}" if down else ""))

    # steps ---------------------------------------------------------------------------------
    job.start_stage("steps", detail="carried objects, hand activity and gaze")
    steps = segment_steps(frames)
    objects_seen = sorted({o["label"] for f in frames for o in f.get("objects", []) if o["label"] not in IGNORE})
    # Attach live Q&A to the step that contains its time.
    for q in skill.get("qa", []):
        t = q.get("t", 0.0)
        best = min(steps, key=lambda s: 0 if s["t_start"] <= t <= s["t_end"] + 2 else min(abs(t - s["t_start"]), abs(t - s["t_end"])),
                   default=None)
        q["step_index"] = best["index"] if best else None
    job.finish_stage("steps", detail=f"{len(steps)} steps; objects: {', '.join(objects_seen) or 'none'}")

    # write ---------------------------------------------------------------------------------
    job.start_stage("write", models=["gpt-oss-20b@2"])
    try:
        struct, sb1 = await writer.write_structure(skill, steps, objects_seen)
        extra_served.append(sb1)
        job.stage_progress(0.5, "steps, why notes and robot program written")
        docs, sb2 = await writer.write_documents(struct)
        extra_served.append(sb2)
    except (ModelUnavailable, ValueError) as e:
        log.warning("writer fallback: %s", e)
        struct, docs = _fallback_structure(steps), {"sop_markdown": "", "quiz": [], "safety": []}
        job.stage_progress(1.0, f"LLM unavailable, used drafts ({e})")
    out_steps = []
    groups = merge_groups(struct.get("steps", []), steps)
    old_to_new: dict[int, int] = {}
    for k, (w, g) in enumerate(groups, 1):
        t_start, t_end = min(s["t_start"] for s in g), max(s["t_end"] for s in g)
        for s in g:
            old_to_new[s["index"]] = k
        objects = list(dict.fromkeys(o for s in g for o in s.get("objects", []) if o))
        hand = max(g, key=lambda s: s["t_end"] - s["t_start"]).get("hand")
        gaze = next((s.get("gaze_target") for s in g if s.get("gaze_target")), None)
        kf_rgb = frame_at(src, t_start + 0.5 * (t_end - t_start))
        kf = save_jpeg(kf_rgb, media_dir(skill_id) / f"kf_{k:02d}.jpg", width=960) if kf_rgb is not None else None
        olds = {s["index"] for s in g}
        answered = next((q for q in skill.get("qa", []) if q.get("step_index") in olds and q.get("answer")), None)
        why = answered["answer"] if answered else (w.get("why") or "")
        draft = g[0].get("draft")
        out_steps.append({"id": f"st{k}", "index": k, "t_start": round(t_start, 2), "t_end": round(t_end, 2),
                          "title": w.get("title") or draft, "instruction": w.get("instruction") or draft,
                          "why": _clean_why(why), "why_source": "expert" if answered else w.get("why_source", "inferred"),
                          "keyframe": media_url(kf) if kf else None, "objects": objects, "hand": hand,
                          "gaze_target": gaze, "tips": (w.get("tips") or [])[:2]})
    for q in skill.get("qa", []):
        if q.get("step_index") in old_to_new:
            q["step_index"] = old_to_new[q["step_index"]]
            q["step_id"] = f"st{q['step_index']}"
    pending = {p.get("index"): p.get("question") for p in struct.get("pending_questions", []) if p.get("question")}
    for st in out_steps:
        if st["why_source"] != "expert" and st["index"] in pending and not any(q.get("step_index") == st["index"] for q in skill.get("qa", [])):
            skill.setdefault("qa", []).append({"step_index": st["index"], "step_id": st["id"], "t": st["t_end"],
                                               "question": pending[st["index"]], "answer": None, "pending": True})
    title = struct.get("title") or skill.get("title")
    if skill.get("test") and not title.startswith("QA "):
        title = "QA " + title
    skill.update({"title": title, "summary": struct.get("summary", ""), "steps": out_steps,
                  "sop_markdown": docs.get("sop_markdown", ""), "quiz": docs.get("quiz", [])[:5], "safety": docs.get("safety", [])[:4]})
    skill.setdefault("robot", {})["program"] = struct.get("robot_program") or []
    save_skill(skill)
    job.finish_stage("write", detail=f"\"{skill['title']}\"")

    # verify --------------------------------------------------------------------------------
    job.start_stage("verify", models=["VGGT-1B@0"])
    times = geometry.pick_times(info["duration"], 4)
    res = imgs = None
    try:
        res, imgs, sb = await geometry.reconstruct(src, times)
        extra_served.append(sb)
        metrics = geometry.consistency(res, frames, times)
        skill["verification"] = {"status": geometry.verdict(metrics["score"]), "score": metrics["score"],
                                 "method": "VGGT multi-view consistency", "details": metrics,
                                 "checked_at": now(),
                                 "pointcloud": f"/api/skills/{skill_id}/pointcloud"}
        job.finish_stage("verify", detail=f"score {metrics['score']:.2f}: {skill['verification']['status']}")
    except ModelUnavailable as e:
        skill["verification"] = {"status": "pending", "score": None, "method": "VGGT multi-view consistency",
                                 "details": {"error": "VGGT unavailable"}}
        job.finish_stage("verify", detail=str(e), status="skipped")
    save_skill(skill)

    # twin ----------------------------------------------------------------------------------
    job.start_stage("twin", detail="body, hands, gaze and parts in the rebuilt scene")
    twin, cloud = geometry.build_twin(frames, res, times, imgs or [], (info["width"], info["height"]))
    write_json(twin_path(skill_id), twin)
    pointcloud_path(skill_id).write_bytes(cloud)
    mt = preview.motion_thumb(frames, media_dir(skill_id) / "motion.jpg",
                              t=out_steps[0]["t_start"] + 1.0 if out_steps else None)
    if mt:
        skill["motion_thumb"] = media_url(mt)
    job.finish_stage("twin", detail=f"{len(twin['frames'])} frames, {len(cloud) // 24} points")

    # narrate -------------------------------------------------------------------------------
    # S2 Pro speaks at about half real time, so the job voices what a lesson needs to start
    # (intro and the first two steps) and the rest is voiced in the background after "ready".
    job.start_stage("narrate", models=["S2 Pro@1"])
    lines = narration_lines(skill)
    first, rest = lines[:3], lines[3:]
    narration = {}
    for k, (key, text) in enumerate(first):
        try:
            path, dur, sb = await speech.tts_sentences(text)
            narration[key] = {"audio": media_url(path), "duration": round(dur, 2), "text": text}
            extra_served.append(sb)
        except ModelUnavailable as e:
            job.stage_progress((k + 1) / len(first), f"TTS unavailable: {e}")
            break
        job.stage_progress((k + 1) / len(first), f"{k + 1} / {len(lines)} lines")
    skill["narration"] = narration
    job.finish_stage("narrate", detail=f"{len(narration)} of {len(lines)} lines now, the rest in the background")
    if rest:
        _background(narrate_rest(skill_id, rest))

    # ready ---------------------------------------------------------------------------------
    job.start_stage("ready")
    skill["models_used"] = models_used(frames, extra_served)
    skill["status"] = "ready"
    save_skill(skill)
    job.finish_stage("ready", detail=f"{len(out_steps)} steps, verification {skill['verification']['status']}")
    return {"skill_id": skill_id, "steps": len(out_steps), "verification": skill["verification"]["status"]}


def merge_groups(written: list[dict], observed: list[dict]) -> list[tuple[dict, list[dict]]]:
    """Pair each written step with the observed steps it covers (the writer may merge repeats).

    Uses the writer's `covers` lists when they are consistent (every observed step at most once, in
    order); otherwise falls back to matching by index, one observed step per written step.
    """
    by_obs = {s["index"]: s for s in observed}
    groups, seen = [], set()
    ok = bool(written)
    for w in written:
        cov = [i for i in (w.get("covers") or []) if isinstance(i, int) and i in by_obs and i not in seen]
        if not cov:
            ok = False
            break
        seen.update(cov)
        groups.append((w, [by_obs[i] for i in sorted(cov)]))
    if ok and groups:
        for i in sorted(set(by_obs) - seen):  # observed steps nobody claimed join the nearest earlier group
            prev = max((g for g in groups if g[1][0]["index"] < i), key=lambda g: g[1][0]["index"], default=groups[0])
            prev[1].append(by_obs[i])
        for _, g in groups:
            g.sort(key=lambda s: s["index"])
        return sorted(groups, key=lambda wg: wg[1][0]["t_start"])
    by_index = {w.get("index"): w for w in written}
    return [(by_index.get(s["index"], {}), [s]) for s in observed]


def _clean_why(text: str) -> str:
    t = (text or "").strip()
    for prefix in ("Inferred:", "inferred:", "Expert:", "expert:"):
        if t.startswith(prefix):
            t = t[len(prefix):].strip()
    return t[:1].upper() + t[1:] if t else t


def narration_lines(skill: dict) -> list[tuple[str, str]]:
    return [("intro", f"{skill['title']}. {skill.get('summary', '')}")] + \
           [(st["id"], f"Step {st['index']}. {st['title']}. {st['instruction']}") for st in skill.get("steps", [])]


_bg: set[asyncio.Task] = set()


def _background(coro) -> None:
    t = asyncio.create_task(coro)
    _bg.add(t)
    t.add_done_callback(_bg.discard)


async def narrate_rest(skill_id: str, lines: list[tuple[str, str]]) -> None:
    for key, text in lines:
        try:
            path, dur, _ = await speech.tts_sentences(text)
        except ModelUnavailable:
            log.warning("background narration stopped for %s", skill_id)
            return
        sk = load_skill(skill_id)
        if not sk:
            return
        sk.setdefault("narration", {})[key] = {"audio": media_url(path), "duration": round(dur, 2), "text": text}
        save_skill(sk)


def objects_summary(frames: list[dict]) -> list[str]:
    return sorted({o["label"] for f in frames for o in f.get("objects", []) if o["label"] not in IGNORE})


__all__ = ["process_skill", "STAGES", "source_video", "skill_dir", "np"]
