"""Tacit backend: every endpoint in docs/API.md."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import jobs, reflex, seed
from .box import box_status
from .config import MEDIA, SAMPLES, VERSION, WEB_DIST, WEB_PUBLIC
from .db import LessonProgress, SkillRow, User, init_db, select, session
from .exchange import market
from .learn import audit, i18n, practice
from .live import capture
from .models import llm, speech
from .models.base import ModelUnavailable
from .pipeline import writer
from .pipeline.process import STAGES, process_skill
from .robot import lab
from .storage import (delete_skill, load_skill, media_url, new_id, pointcloud_path, read_json, save_skill, skill_dir,
                      tracks_path, twin_path)

log = logging.getLogger("tacit")
logging.basicConfig(level=os.environ.get("TACIT_LOG", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Tacit", version=VERSION)


def err(status: int, code: str, message: str, detail: dict | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "detail": detail or {}}})


@app.exception_handler(ModelUnavailable)
async def _model_unavailable(_: Request, e: ModelUnavailable):
    return err(503, "model_unavailable", str(e), {"model": e.endpoint.name, "chip": e.endpoint.chip})


@app.exception_handler(lab.SimUnavailable)
async def _sim_unavailable(_: Request, e: lab.SimUnavailable):
    return err(503, "sim_unavailable", str(e))


@app.exception_handler(market.ListingError)
async def _listing_error(_: Request, e: market.ListingError):
    return err(400, "bad_request", str(e))


@app.on_event("startup")
async def _startup() -> None:
    init_db()
    seed.seed_users()
    seed.samples()
    interrupted = recover_interrupted_jobs()
    if os.environ.get("TACIT_RESUME_JOBS", "1") == "1":
        for skill_id in interrupted:
            jobs.run(jobs.create("process", skill_id, STAGES), lambda j, sid=skill_id: process_skill(j, sid))
    if os.environ.get("TACIT_SEED", "1") == "1":
        asyncio.create_task(seed.seed_sample_skills())
    asyncio.create_task(backfill_ready_skills())


async def backfill_ready_skills() -> None:
    """Finish what a restart cut short for ready skills: motion previews and background narration."""
    from .pipeline import preview
    from .pipeline.process import narrate_rest, narration_lines
    from .storage import media_dir
    with session() as s:
        ids = [r.id for r in s.exec(select(SkillRow).where(SkillRow.status == "ready")).all() if not r.test]
    for sid in ids:  # previews first (CPU, fast), then narration (the speech chip, slow)
        sk = load_skill(sid)
        if not sk:
            continue
        if not sk.get("motion_thumb"):
            frames = (read_json(tracks_path(sid)) or {}).get("frames", [])
            mt = await asyncio.to_thread(preview.motion_thumb, frames, media_dir(sid) / "motion.jpg",
                                         (sk.get("steps") or [{}])[0].get("t_start", 0.0) + 1.0 if sk.get("steps") else None)
            if mt:
                sk = load_skill(sid)
                sk["motion_thumb"] = media_url(mt)
                save_skill(sk)
    for sid in ids:
        sk = load_skill(sid)
        missing = [(k, t) for k, t in narration_lines(sk) if k not in (sk.get("narration") or {})] if sk else []
        if missing:
            await narrate_rest(sid, missing)


def recover_interrupted_jobs() -> list[str]:
    """Jobs that were running when the backend stopped are marked failed; their skills go back to draft.
    Returns the skills whose processing should be started again."""
    from .db import JobRow, now
    resume = []
    with session() as s:
        for row in s.exec(select(JobRow).where(JobRow.status.in_(("queued", "running")))).all():
            row.status, row.error, row.finished_at = "failed", "interrupted by a backend restart", now()
            payload = json.loads(row.payload or "{}")
            payload.update(status="failed", error=row.error)
            row.payload = json.dumps(payload)
            s.add(row)
            if row.kind == "process" and row.skill_id:
                resume.append(row.skill_id)
        s.commit()
    for skill_id in resume:
        sk = load_skill(skill_id)
        if sk and sk.get("status") == "processing":
            sk["status"] = "draft"
            save_skill(sk)
    for skill_id in [r for r in resume]:
        if not load_skill(skill_id):
            resume.remove(skill_id)
    if resume:
        log.warning("resuming %d interrupted processing jobs: %s", len(resume), resume)
    return resume


def user_id(x_tacit_user: str | None) -> str:
    return x_tacit_user or "u_maria"


# ------------------------------------------------------------------------------------ system
@app.get("/api/health")
async def health_():
    return {"ok": True, "version": VERSION}


@app.get("/api/box")
async def box_():
    from .models.speech import GATE
    return {**(await box_status()), "speech_queue": GATE.waiting()}


@app.get("/api/users")
async def users_():
    with session() as s:
        return [u.model_dump() for u in s.exec(select(User)).all()]


@app.get("/api/samples")
async def samples_():
    return seed.samples()


@app.get("/api/music/intro")
async def music_intro():
    """An 8 s instrumental lesson intro made once by MiniMax Music 3 on chip 1 (cached: music holds the
    speech chip for ~50 s, so it is never generated while people are talking to the coach)."""
    p = MEDIA / "music" / "lesson-intro.wav"
    if not p.exists():
        return err(404, "not_found", "no intro music yet")
    return {"audio": media_url(p), "duration": 8.0, "model": "MiniMax Music 3", "chip": 1,
            "credit": "Music generated with MiniMax-Music3"}


@app.get("/api/samples/{sample_id}/verify")
async def sample_verify(sample_id: str, refresh: bool = False):
    """VGGT verification of a sample clip (cached): the Check page compares a real recording with an AI-made one."""
    from .pipeline import geometry
    from .pipeline.video import probe
    sample = next((x for x in seed.samples() if x["id"] == sample_id), None)
    if not sample:
        return err(404, "not_found", f"no sample {sample_id}")
    cache = SAMPLES / f"{sample_id}.verify.json"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text())
    video = MEDIA / "samples" / os.path.basename(sample["video"])
    dur = probe(video)["duration"]
    times = geometry.pick_times(dur, 4)
    res, imgs, sb = await geometry.reconstruct(video, times)
    metrics = geometry.consistency(res, [], times)
    _, cloud = geometry.build_twin([], res, times, imgs, (imgs[0].shape[1], imgs[0].shape[0]) if imgs else (1280, 720))
    (MEDIA / "samples" / f"{sample_id}.pointcloud.bin").write_bytes(cloud)
    out = {"sample_id": sample_id, "kind": sample.get("kind"), "status": geometry.verdict(metrics["score"]), "score": metrics["score"],
           "method": "VGGT multi-view consistency", "details": metrics, "times": times,
           "pointcloud": f"/media/samples/{sample_id}.pointcloud.bin", "points": len(cloud) // 24, "served_by": [sb]}
    cache.write_text(json.dumps(out))
    return out


# ------------------------------------------------------------------------------------ skills
def summary(row: SkillRow) -> dict:
    with session() as s:
        u = s.get(User, row.expert_id)
    return {"id": row.id, "title": row.title, "summary": row.summary, "status": row.status, "created_at": row.created_at,
            "expert": {"id": row.expert_id, "name": u.name if u else row.expert_id}, "thumb": row.thumb, "duration": row.duration,
            "steps_count": row.steps_count, "verification_status": row.verification_status, "listed": bool(row.listing_id),
            "listing_id": row.listing_id, "source_kind": row.source_kind, "test": row.test}


@app.get("/api/skills")
async def skills_list(status: str | None = None, expert_id: str | None = None, include_test: bool = False):
    with session() as s:
        rows = s.exec(select(SkillRow)).all()
    out = [summary(r) for r in rows if (not status or r.status == status) and (not expert_id or r.expert_id == expert_id)
           and (include_test or not r.test)]
    return sorted(out, key=lambda r: r["created_at"], reverse=True)


@app.post("/api/skills")
async def skills_create(request: Request, x_tacit_user: str | None = Header(default=None)):
    uid = user_id(x_tacit_user)
    ctype = request.headers.get("content-type", "")
    with session() as s:
        u = s.get(User, uid if (s.get(User, uid) and s.get(User, uid).role == "expert") else "u_maria")
    expert = {"id": u.id, "name": u.name, "title": u.title}
    if ctype.startswith("multipart/"):
        form = await request.form()
        f = form.get("file")
        if f is None:
            raise HTTPException(400, "file is required")
        sid = new_id("sk")
        ext = Path(getattr(f, "filename", "") or "upload.mp4").suffix or ".mp4"
        raw = skill_dir(sid) / f"upload{ext}"
        raw.write_bytes(await f.read())
        skill = _new_skill(sid, expert, {"kind": "upload", "raw_path": str(raw)}, form.get("title"))
        return {"skill_id": sid, "status": skill["status"]}
    body = await request.json()
    if body.get("source") == "sample":
        sample = next((x for x in seed.samples() if x["id"] == body.get("sample_id")), None)
        if not sample:
            raise HTTPException(404, "no such sample")
        skill = seed.create_skill_from_sample(sample, expert_id=expert["id"], title=body.get("title"))
        return {"skill_id": skill["id"], "status": skill["status"]}
    if body.get("source") == "live":
        sid = new_id("sk")
        skill = _new_skill(sid, expert, {"kind": "live"}, body.get("title"))
        return {"skill_id": sid, "status": skill["status"]}
    raise HTTPException(400, "source must be sample, live, or a multipart upload")


def _new_skill(sid: str, expert: dict, source: dict, title: str | None) -> dict:
    from .db import now
    skill = {"id": sid, "title": title or "New skill", "title_hint": title, "summary": "", "status": "draft", "created_at": now(),
             "test": bool(title and title.startswith("QA ")),
             "expert": expert, "source": source, "steps": [], "qa": [], "verification": {"status": "pending"}, "robot": {},
             "consent": {"motion": True, "gaze": True, "voice_text": True, "raw_video": False, "signed_by": expert["id"], "signed_at": now()}}
    return save_skill(skill)


@app.get("/api/skills/{skill_id}")
async def skills_get(skill_id: str):
    sk = load_skill(skill_id)
    if not sk:
        return err(404, "not_found", f"no skill {skill_id}")
    sk = dict(sk)
    sk.pop("title_hint", None)
    src = dict(sk.get("source") or {})
    src.pop("raw_path", None)
    sk["source"] = src
    sk["listing_id"] = sk.get("listing_id")
    job = jobs.active_for(skill_id, "process")
    sk["job_id"] = job.id if job else None
    return sk


@app.patch("/api/skills/{skill_id}")
async def skills_patch(skill_id: str, body: dict):
    sk = load_skill(skill_id)
    if not sk:
        return err(404, "not_found", f"no skill {skill_id}")
    for k in ("title", "summary"):
        if k in body:
            sk[k] = body[k]
    if str(body.get("title", "")).startswith("QA "):
        sk["test"] = True
    if "steps" in body:
        by_id = {s["id"]: s for s in body["steps"] if "id" in s}
        for st in sk.get("steps", []):
            upd = by_id.get(st["id"], {})
            for k in ("title", "instruction", "why", "tips"):
                if k in upd:
                    st[k] = upd[k]
                    if k == "why":
                        st["why_source"] = "expert"
    if "qa" in body:
        for upd in body["qa"]:
            for q in sk.get("qa", []):
                if q.get("question") == upd.get("question") or (upd.get("step_index") and q.get("step_index") == upd.get("step_index")):
                    q["answer"] = upd.get("answer")
                    q["pending"] = False
                    st = next((s for s in sk.get("steps", []) if s["index"] == q.get("step_index")), None)
                    if st and upd.get("answer"):
                        st["why"], st["why_source"] = upd["answer"], "expert"
    return save_skill(sk)


@app.delete("/api/skills/{skill_id}")
async def skills_delete(skill_id: str):
    delete_skill(skill_id)
    return {"ok": True}


@app.get("/api/skills/{skill_id}/tracks")
async def skills_tracks(skill_id: str):
    p = tracks_path(skill_id)
    if not p.exists():
        return err(404, "not_found", "no tracks yet")
    return FileResponse(p, media_type="application/json")


@app.get("/api/skills/{skill_id}/twin")
async def skills_twin(skill_id: str):
    p = twin_path(skill_id)
    if not p.exists():
        return err(404, "not_found", "no twin yet")
    return FileResponse(p, media_type="application/json")


@app.get("/api/skills/{skill_id}/pointcloud")
async def skills_pointcloud(skill_id: str):
    p = pointcloud_path(skill_id)
    if not p.exists():
        return err(404, "not_found", "no point cloud yet")
    data = p.read_bytes()
    return Response(content=data, media_type="application/octet-stream", headers={"X-Points": str(len(data) // 24)})


@app.post("/api/skills/{skill_id}/process")
async def skills_process(skill_id: str):
    if not load_skill(skill_id):
        return err(404, "not_found", f"no skill {skill_id}")
    running = jobs.active_for(skill_id, "process")
    if running:
        return {"job_id": running.id}
    job = jobs.run(jobs.create("process", skill_id, STAGES), lambda j: process_skill(j, skill_id))
    return {"job_id": job.id}


@app.post("/api/skills/{skill_id}/verify")
async def skills_verify(skill_id: str):
    from .pipeline import geometry
    from .pipeline.process import source_video
    sk = load_skill(skill_id)
    if not sk:
        return err(404, "not_found", f"no skill {skill_id}")

    async def go(job: jobs.Job):
        from .db import now
        job.start_stage("verify", models=["VGGT-1B@0"])
        src = source_video(skill_id)
        dur = (sk.get("source") or {}).get("duration") or 10.0
        times = geometry.pick_times(dur, 4)
        frames = (read_json(tracks_path(skill_id)) or {}).get("frames", [])
        res, imgs, _ = await geometry.reconstruct(src, times)
        m = geometry.consistency(res, frames, times)
        s2 = load_skill(skill_id)
        s2["verification"] = {"status": geometry.verdict(m["score"]), "score": m["score"], "method": "VGGT multi-view consistency",
                              "details": m, "checked_at": now(), "pointcloud": f"/api/skills/{skill_id}/pointcloud"}
        save_skill(s2)
        job.finish_stage("verify", detail=f"score {m['score']:.2f}")
        return {"verification": s2["verification"]}

    job = jobs.run(jobs.create("verify", skill_id, ["verify"]), go)
    return {"job_id": job.id}


@app.post("/api/skills/{skill_id}/audit")
async def skills_audit(skill_id: str, file: UploadFile = File(...), worker: str = Form("Sam Okafor")):
    """Quality and safety: compare a worker's recorded run with the expert's skill."""
    sk = load_skill(skill_id)
    if not sk or sk.get("status") != "ready":
        return err(400, "bad_request", "audits need a ready skill")
    aid = audit.new_audit_id()
    raw = audit.audits_dir(skill_id) / f"{aid}{Path(file.filename or 'run.mp4').suffix or '.mp4'}"
    raw.write_bytes(await file.read())
    job = jobs.run(jobs.create("audit", skill_id, audit.STAGES), lambda j: audit.run_audit(j, skill_id, raw, aid, worker))
    return {"job_id": job.id, "audit_id": aid}


@app.get("/api/skills/{skill_id}/audits")
async def skills_audits(skill_id: str):
    return audit.list_audits(skill_id)


@app.get("/api/skills/{skill_id}/audits/{audit_id}")
async def skills_audit_get(skill_id: str, audit_id: str):
    r = read_json(audit.audits_dir(skill_id) / f"{audit_id}.json")
    return r if r else err(404, "not_found", f"no audit {audit_id}")


@app.post("/api/skills/{skill_id}/answer")
async def skills_answer(skill_id: str, file: UploadFile | None = File(default=None), question: str = Form(""),
                        step_index: int | None = Form(default=None), text: str = Form("")):
    """The expert answers a pending why-question by voice (Whisper) or text; the step's why is updated."""
    sk = load_skill(skill_id)
    if not sk:
        return err(404, "not_found", f"no skill {skill_id}")
    served_by = []
    if file is not None:
        text, sb = await speech.stt(await file.read(), file.filename or "answer.wav")
        served_by.append(sb)
    if not text:
        raise HTTPException(400, "no answer")
    q = next((x for x in sk.get("qa", []) if (step_index and x.get("step_index") == step_index) or (question and x.get("question") == question)), None)
    if q is None:
        q = {"step_index": step_index, "question": question or "(volunteered)", "t": 0.0}
        sk.setdefault("qa", []).append(q)
    q["answer"], q["pending"] = text, False
    st = next((s for s in sk.get("steps", []) if s["index"] == q.get("step_index")), None)
    if st:
        st["why"], st["why_source"] = text, "expert"
    save_skill(sk)
    return {"text": text, "skill": sk, "served_by": served_by}


# ------------------------------------------------------------------------------------ jobs
@app.get("/api/jobs/{job_id}")
async def jobs_get(job_id: str):
    j = jobs.get(job_id)
    if not j:
        return err(404, "not_found", f"no job {job_id}")
    return j


@app.websocket("/ws/jobs/{job_id}")
async def jobs_ws(ws: WebSocket, job_id: str):
    await ws.accept()
    job = jobs.JOBS.get(job_id)
    if not job:
        snap = jobs.get(job_id)
        await ws.send_json(snap or {"error": "no such job"})
        await ws.close()
        return
    q = job.subscribe()
    try:
        while True:
            snap = await q.get()
            await ws.send_json(snap)
            if snap["status"] in ("done", "failed"):
                break
    except WebSocketDisconnect:
        pass
    finally:
        job.unsubscribe(q)
        try:
            await ws.close()
        except RuntimeError:
            pass


# ------------------------------------------------------------------------------------ live capture
@app.websocket("/ws/capture/{skill_id}")
async def capture_ws(ws: WebSocket, skill_id: str):
    await capture.run(ws, skill_id)


# ------------------------------------------------------------------------------------ speech
@app.post("/api/speech/tts")
async def tts_(body: dict):
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "text is required")
    path, dur, sb = await speech.tts(text[:600], body.get("voice", "default"))
    return {"audio": media_url(path), "duration": round(dur, 2), "served_by": [sb]}


@app.get("/api/speech/tts/stream")
async def tts_stream_(text: str):
    """Streaming WAV for low-latency playback (`<audio src=...>`)."""
    return StreamingResponse(speech.tts_stream(text[:600]), media_type="audio/wav")


@app.post("/api/speech/stt")
async def stt_(file: UploadFile = File(...)):
    text, sb = await speech.stt(await file.read(), file.filename or "speech.wav")
    return {"text": text, "served_by": [sb]}


# ------------------------------------------------------------------------------------ learn
@app.get("/api/learn/lessons")
async def lessons(x_tacit_user: str | None = Header(default=None), include_test: bool = False):
    uid = user_id(x_tacit_user)
    with session() as s:
        rows = [r for r in s.exec(select(SkillRow).where(SkillRow.status == "ready")).all() if include_test or not r.test]
        prog = {p.skill_id: p for p in s.exec(select(LessonProgress).where(LessonProgress.trainee_id == uid)).all()}
    out = []
    for r in rows:
        p = prog.get(r.id)
        out.append({**summary(r), "skill_id": r.id,
                    "progress": {"steps_done": p.steps_done, "steps_total": p.steps_total, "best_score": p.best_score,
                                 "passed": p.passed} if p else None})
    return out


@app.get("/api/learn/lessons/{skill_id}")
async def lesson(skill_id: str, lang: str = "en"):
    sk = load_skill(skill_id)
    if not sk:
        return err(404, "not_found", f"no skill {skill_id}")
    nar = sk.get("narration") or {}
    if lang != "en":
        tr = await i18n.translate(skill_id, lang)
        by_i = {s["index"]: s for s in tr.get("steps", [])}
        sk = {**sk, "title": tr.get("title") or sk.get("title"), "summary": tr.get("summary") or sk.get("summary"),
              "quiz": tr.get("quiz") or sk.get("quiz"), "safety": tr.get("safety") or sk.get("safety"),
              "steps": [{**st, **{k: by_i.get(st["index"], {}).get(k) or st.get(k) for k in ("title", "instruction", "why", "tips")}}
                        for st in sk.get("steps", [])]}
        nar = tr.get("narration") or {}
    return {"skill_id": skill_id, "title": sk.get("title"), "summary": sk.get("summary"), "expert": sk.get("expert"),
            "video": (sk.get("source") or {}).get("video"), "intro_audio": (nar.get("intro") or {}).get("audio"),
            "steps": [{**{k: st.get(k) for k in ("id", "index", "title", "instruction", "why", "why_source", "keyframe", "t_start",
                                                  "t_end", "tips", "objects", "hand", "gaze_target")},
                       "narration_audio": (nar.get(st["id"]) or {}).get("audio"), "narration_text": (nar.get(st["id"]) or {}).get("text")}
                      for st in sk.get("steps", [])],
            "quiz": sk.get("quiz", []), "safety": sk.get("safety", []), "lang": lang,
            "languages": [{"code": k, "name": v} for k, v in writer.LANGS.items()]}


@app.post("/api/learn/sessions")
async def learn_session(body: dict, x_tacit_user: str | None = Header(default=None)):
    sid = new_id("ls")
    practice.SESSIONS[sid] = {"skill_id": body["skill_id"], "trainee_id": user_id(x_tacit_user) if x_tacit_user else "u_sam",
                              "lang": body.get("lang", "en")}
    return {"session_id": sid}


@app.websocket("/ws/learn/{session_id}")
async def learn_ws(ws: WebSocket, session_id: str):
    await practice.run(ws, session_id)


@app.post("/api/learn/sessions/{session_id}/complete")
async def learn_complete(session_id: str, body: dict):
    from .db import now
    meta = practice.SESSIONS.get(session_id)
    if not meta:
        return err(404, "not_found", "unknown session")
    sk = load_skill(meta["skill_id"]) or {}
    quiz = sk.get("quiz", [])
    answers = body.get("quiz_answers", [])
    right = sum(1 for q, a in zip(quiz, answers) if q.get("answer") == a)
    score = right / len(quiz) if quiz else 1.0
    passed = score >= 0.66
    cert = None
    with session() as s:
        row = s.exec(select(LessonProgress).where(LessonProgress.trainee_id == meta["trainee_id"],
                                                  LessonProgress.skill_id == meta["skill_id"])).first()
        row = row or LessonProgress(trainee_id=meta["trainee_id"], skill_id=meta["skill_id"], steps_total=len(sk.get("steps", [])))
        row.quiz_score, row.passed, row.updated_at = round(score, 3), passed or row.passed, now()
        if passed:
            u = s.get(User, meta["trainee_id"])
            cert = _certificate(u.name if u else meta["trainee_id"], sk, score)
            row.certificate = cert
        s.add(row)
        s.commit()
    return {"score": round(score, 3), "passed": passed, "certificate": cert}


def _certificate(name: str, sk: dict, score: float) -> str:
    from .db import now
    d = MEDIA / "certs"
    d.mkdir(parents=True, exist_ok=True)
    slug = new_id("cert")
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
<rect width="1200" height="800" fill="#07080b"/><rect x="24" y="24" width="1152" height="752" rx="20" fill="none" stroke="#2b3240"/>
<text x="80" y="140" fill="#7cf5d4" font-family="Inter,Arial" font-size="22" letter-spacing="6">TACIT · SKILL CERTIFICATE</text>
<text x="80" y="300" fill="#f2f4f8" font-family="Inter,Arial" font-size="64" font-weight="600">{_x(name)}</text>
<text x="80" y="380" fill="#aab3c2" font-family="Inter,Arial" font-size="30">has learned</text>
<text x="80" y="450" fill="#f2f4f8" font-family="Inter,Arial" font-size="44">{_x(sk.get('title', 'a skill'))}</text>
<text x="80" y="520" fill="#aab3c2" font-family="Inter,Arial" font-size="26">taught by {_x((sk.get('expert') or {}).get('name', 'an expert'))} · quiz {round(score * 100)}%</text>
<text x="80" y="700" fill="#6b7586" font-family="JetBrains Mono,monospace" font-size="20">{now()} · {slug}</text></svg>"""
    p = d / f"{slug}.svg"
    p.write_text(svg)
    return media_url(p)


def _x(s: str) -> str:
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


@app.get("/api/learn/progress")
async def learn_progress():
    with session() as s:
        rows = s.exec(select(LessonProgress)).all()
        out = []
        for p in rows:
            u = s.get(User, p.trainee_id)
            sk = s.get(SkillRow, p.skill_id)
            out.append({"trainee": {"id": p.trainee_id, "name": u.name if u else p.trainee_id, "title": u.title if u else ""},
                        "skill_id": p.skill_id, "skill_title": sk.title if sk else "", "steps_done": p.steps_done,
                        "steps_total": p.steps_total, "best_score": p.best_score, "quiz_score": p.quiz_score, "passed": p.passed,
                        "certificate": p.certificate, "updated_at": p.updated_at})
    return sorted(out, key=lambda r: r["updated_at"], reverse=True)


@app.post("/api/tutor/{skill_id}/ask")
async def tutor_ask(skill_id: str, request: Request):
    sk = load_skill(skill_id)
    if not sk:
        return err(404, "not_found", f"no skill {skill_id}")
    ctype = request.headers.get("content-type", "")
    transcript = None
    if ctype.startswith("multipart/"):
        form = await request.form()
        lang = form.get("lang") or "en"
        f = form.get("audio") or form.get("file")
        question = form.get("question") or ""
        history = json.loads(form.get("history") or "[]")
        if f is not None:
            transcript, _ = await speech.stt(await f.read(), getattr(f, "filename", None) or "question.wav")
            question = transcript
    else:
        body = await request.json()
        question, lang, history = body.get("question", ""), body.get("lang", "en"), body.get("history", [])
    if not question.strip():
        raise HTTPException(400, "question is required")
    msgs = writer.tutor_messages(sk, question, lang, history)

    async def events():
        """Text deltas as they stream; each finished sentence is spoken right away (`event: audio`, in order)."""
        if transcript is not None:
            yield f"event: transcript\ndata: {json.dumps({'text': transcript})}\n\n"
        text, pending = "", ""
        voices: list[asyncio.Task] = []
        sent = 0

        def speak(sentence: str) -> None:
            if sentence.strip() and len(voices) < 4:
                voices.append(asyncio.create_task(speech.tts(_speakable(sentence))))

        def ready_audio():
            nonlocal sent
            out = []
            while sent < len(voices) and voices[sent].done():
                t = voices[sent]
                if not t.cancelled() and t.exception() is None:
                    path, dur, _ = t.result()
                    out.append({"index": sent, "audio": media_url(path), "duration": round(dur, 2)})
                sent += 1
            return out

        try:
            async for delta in llm.chat_stream(msgs, max_tokens=400):
                text += delta
                pending += delta
                for cut in _sentence_cuts(pending):
                    speak(pending[:cut])
                    pending = pending[cut:]
                yield f"event: delta\ndata: {json.dumps({'text': delta})}\n\n"
                for a in ready_audio():
                    yield f"event: audio\ndata: {json.dumps(a)}\n\n"
        except ModelUnavailable as e:
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
            return
        speak(pending)
        sources = [f"st{st['index']}" for st in sk.get("steps", []) if st.get("title") and st["title"].lower()[:12] in text.lower()]
        # The text is final now; the remaining sentences' audio follows, then `end` closes the stream.
        yield f"event: done\ndata: {json.dumps({'text': text.strip(), 'audio_parts': len(voices), 'sources': sources, 'question': question})}\n\n"
        for i in range(sent, len(voices)):
            try:
                await voices[i]
            except ModelUnavailable:
                pass
            for a in ready_audio():
                yield f"event: audio\ndata: {json.dumps(a)}\n\n"
        yield "event: end\ndata: {}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _sentence_cuts(s: str) -> list[int]:
    """End offsets of complete sentences in a streaming buffer (cut after '. ', '? ', '! ')."""
    cuts, last = [], 0
    for i in range(1, len(s)):
        if s[i - 1] in ".?!" and s[i] == " " and i - last > 12:
            cuts.append(i - last)
            last = i
    return cuts


def _speakable(text: str, max_chars: int = 320) -> str:
    text = text.replace("*", "").replace("#", "").strip()
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars]
    return cut[: max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! ")) + 1] or cut


# ------------------------------------------------------------------------------------ robot lab
@app.get("/api/robot/scene")
async def robot_scene(skill_id: str | None = None):
    return lab.scene(skill_id)


@app.get("/api/robot/{skill_id}")
async def robot_get(skill_id: str):
    sk = load_skill(skill_id)
    if not sk:
        return err(404, "not_found", f"no skill {skill_id}")
    r = sk.get("robot") or {}
    try:
        lab.sim()
        available = True
    except lab.SimUnavailable:
        available = False
    return {"program": lab.program_for(sk), "policy": r.get("policy") or {"status": "untrained"}, "runs": r.get("runs", []),
            "sim_available": available}


@app.post("/api/robot/{skill_id}/train")
async def robot_train(skill_id: str, body: dict | None = None):
    body = body or {}
    lab.sim()
    job = jobs.run(jobs.create("train", skill_id, ["demos", "train"]),
                   lambda j: lab.train(j, skill_id, int(body.get("demos", 200)), int(body.get("epochs", 30))))
    return {"job_id": job.id}


@app.post("/api/robot/{skill_id}/evaluate")
async def robot_evaluate(skill_id: str, body: dict | None = None):
    body = body or {}
    lab.sim()
    job = jobs.run(jobs.create("evaluate", skill_id, ["evaluate"]),
                   lambda j: lab.evaluate(j, skill_id, int(body.get("trials", 20)), int(body.get("seed", 0))))
    return {"job_id": job.id}


@app.post("/api/robot/{skill_id}/run")
async def robot_run(skill_id: str, body: dict):
    try:
        rid = lab.start_run(skill_id, body.get("mode", "scripted"), int(body.get("seed", 0)), bool(body.get("realtime", True)))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"run_id": rid}


@app.websocket("/ws/robot/{run_id}")
async def robot_ws(ws: WebSocket, run_id: str):
    try:
        await lab.stream(ws, run_id)
    except lab.SimUnavailable as e:
        await ws.accept()
        await ws.send_json({"type": "error", "message": str(e)})
        await ws.close()


# ------------------------------------------------------------------------------------ exchange
@app.get("/api/exchange/listings")
async def ex_list(q: str = "", industry: str = "", robot: str = "", verified: bool | None = None, include_test: bool = False):
    return market.list_listings(q, industry, robot, verified, include_test)


@app.get("/api/exchange/listings/{listing_id}")
async def ex_get(listing_id: str):
    d = market.get_listing(listing_id)
    return d if d else err(404, "not_found", f"no listing {listing_id}")


@app.post("/api/exchange/listings")
async def ex_create(body: dict, x_tacit_user: str | None = Header(default=None)):
    return market.create_listing(body["skill_id"], body, user_id(x_tacit_user))


@app.post("/api/exchange/listings/{listing_id}/license")
async def ex_license(listing_id: str, body: dict, x_tacit_user: str | None = Header(default=None)):
    return market.license_listing(listing_id, body.get("license_type", "robot_deploy"), x_tacit_user or "u_atlas")


@app.get("/api/exchange/library")
async def ex_library(x_tacit_user: str | None = Header(default=None)):
    return market.library(x_tacit_user or "u_atlas")


@app.get("/api/exchange/licenses/{license_id}/pack.zip")
async def ex_pack(license_id: str):
    data, name = await asyncio.to_thread(market.build_pack, license_id)
    return Response(content=data, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@app.get("/api/earnings")
async def earnings_(x_tacit_user: str | None = Header(default=None)):
    return market.earnings(user_id(x_tacit_user))


# ------------------------------------------------------------------------------------ reflex glove
@app.get("/api/reflex/status")
async def reflex_status():
    return await reflex.Client().status()


@app.get("/api/skills/{skill_id}/fingers")
async def skill_fingers(skill_id: str, step: int | None = None, hand: str | None = None):
    if not load_skill(skill_id):
        return err(404, "not_found", f"no skill {skill_id}")
    return reflex.finger_track(skill_id, step, hand)


@app.get("/api/skills/{skill_id}/reflex.py")
async def skill_reflex_file(skill_id: str, step: int | None = None, speed: float = 1.0):
    sk = load_skill(skill_id)
    if not sk:
        return err(404, "not_found", f"no skill {skill_id}")
    track = reflex.finger_track(skill_id, step)
    steps = reflex.movement_steps(track, speed=speed)
    title = sk.get("title", "Tacit skill") + (f", step {step}" if step else "")
    name = reflex.movement_name(skill_id, step)
    src = reflex.movement_file(title, f"{len(steps)} poses from {(sk.get('expert') or {}).get('name', 'an expert')}'s {track['hand']} hand", steps)
    return Response(content=src, media_type="text/x-python", headers={"Content-Disposition": f'attachment; filename="{name}.py"'})


@app.post("/api/reflex/guide")
async def reflex_guide(body: dict):
    """Teach the expert's finger motion (whole skill or one step) to a Reflex glove and play it."""
    skill_id, step = body["skill_id"], body.get("step_index")
    sk = load_skill(skill_id)
    if not sk:
        return err(404, "not_found", f"no skill {skill_id}")
    track = reflex.finger_track(skill_id, step)
    steps = reflex.movement_steps(track, speed=float(body.get("speed", 1.0)))
    if not steps:
        raise HTTPException(400, "no hand motion recorded for that part of the skill")
    client = reflex.Client(body.get("url"))
    st = await client.status()
    name = reflex.movement_name(skill_id, step)
    if not st["connected"]:
        return {"connected": False, "name": name, "steps": steps, "seconds": round(sum(s["seconds"] for s in steps), 2),
                "message": f"No Reflex backend at {client.url}; the virtual glove plays the same steps."}
    title = sk.get("title", "Tacit skill") + (f", step {step}" if step else "")
    await client.teach(name, title, "taught by Tacit", steps)
    await client.play(name)
    return {"connected": True, "name": name, "steps": steps, "seconds": round(sum(s["seconds"] for s in steps), 2)}


@app.post("/api/reflex/stop")
async def reflex_stop():
    client = reflex.Client()
    if (await client.status())["connected"]:
        await client.stop()
    return {"ok": True}


# ------------------------------------------------------------------------------------ static
app.mount("/media", StaticFiles(directory=str(MEDIA)), name="media")
_sim_dir = WEB_DIST / "sim" if (WEB_DIST / "sim").exists() else WEB_PUBLIC / "sim"
if _sim_dir.exists():
    app.mount("/sim", StaticFiles(directory=str(_sim_dir)), name="sim")
if (WEB_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(WEB_DIST / "assets")), name="assets")


@app.get("/{path:path}", include_in_schema=False)
async def spa(path: str):
    if path.startswith(("api/", "ws/", "media/")):
        return err(404, "not_found", f"/{path}")
    f = WEB_DIST / path
    if path and f.is_file():
        return FileResponse(f)
    index = WEB_DIST / "index.html"
    if index.exists():
        return FileResponse(index)
    return JSONResponse({"tacit": VERSION, "web": "not built yet: run npm run build in web/"})


__all__ = ["app", "SAMPLES"]
