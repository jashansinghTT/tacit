"""The seven E2E flows of SPEC section 9, at the API level, on the real stack (backend 8710, models on 4 chips).

Run: `uv run --project tests/e2e pytest tests/e2e` (see tests/e2e/README.md). Each test records its timings
and flags anything slower than a person would accept; evidence goes to .orchestration/evidence/qa/runs/<run>/.
"""
from __future__ import annotations

import asyncio
import io
import json
import os
import statistics
import time
import zipfile
from pathlib import Path

import pytest

import e2e_lib as lib

TT_MODELS = {"HaMeR", "Gaze-LLE", "RF-DETR", "VGGT-1B", "gpt-oss-20b", "S2 Pro"}
VIDEO_EXT = (".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".y4m")
ANSWER = "Because the parts on the left are already sorted, so I check them before I place them in the tray."


# ------------------------------------------------------------------------------------ 1. landing and navigation
@pytest.mark.flow(1)
def test_1_landing_and_navigation(api, rec):
    """The backend serves the built web app on every route, and the data the landing page needs."""
    with rec.time("GET /", limit_s=1.0):
        r = api.get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers.get("content-type", ""), f"/ is not the web app: {r.text[:200]}"
    html = r.text
    assert '<div id="root"' in html or "<script" in html, "index.html has no app mount point"
    rec.save("index.html", html)
    scripts = [s.split('"')[0] for s in html.split('src="')[1:] if s.split('"')[0].startswith("/")]
    for src in scripts:
        a = api.get(src)
        assert a.status_code == 200, f"asset {src} -> {a.status_code}"
    for path in ("/studio", "/learn", "/robot", "/exchange", "/box", "/some/deep/link"):
        with rec.time(f"GET {path} (SPA fallback)", limit_s=1.0):
            p = api.get(path)
        assert p.status_code == 200 and "text/html" in p.headers.get("content-type", ""), f"{path} -> {p.status_code}"
    with rec.time("GET /api/health", limit_s=0.5):
        assert api.get("/api/health").json()["ok"] is True
    with rec.time("GET /api/users", limit_s=1.0):
        users = {u["id"]: u for u in api.get("/api/users").json()}
    assert {"u_maria", "u_sam", "u_priya", "u_atlas"} <= set(users), f"personas missing: {sorted(users)}"
    assert users["u_maria"]["role"] == "expert" and users["u_atlas"]["role"] == "buyer"
    with rec.time("GET /api/samples", limit_s=1.0):
        samples = api.get("/api/samples").json()
    rec.save("samples.json", samples)
    kinds = {s.get("kind") for s in samples}
    assert "real" in kinds, f"no real sample: {samples}"
    assert "ai-generated" in kinds, "no AI-made sample for the Check page"
    for s in samples:
        for key in ("video", "thumb"):
            if s.get(key):
                h = api.get(s[key], headers={"Range": "bytes=0-1023"})
                assert h.status_code in (200, 206), f"sample {s['id']} {key} {s[key]} -> {h.status_code}"
    with rec.time("GET /api/skills", limit_s=1.0):
        api.get("/api/skills").raise_for_status()
    with rec.time("GET /api/exchange/listings", limit_s=1.0):
        api.get("/api/exchange/listings").raise_for_status()


# ------------------------------------------------------------------------------------ 2. sample -> process -> ready
@pytest.mark.flow(2)
def test_2_sample_process_ready(api, rec, processed):
    """F2/F3: a sample becomes a ready skill with steps, a verification verdict, an SOP and narration."""
    job, sid = processed.job, processed.skill_id
    rec.note(f"skill {sid} from sample {processed.sample.get('id')}")
    rec.mark("create skill from sample", processed.created_s, limit_s=2)
    for f in getattr(processed, "flags", []):
        rec.flag(f)
    if not job.get("reused"):
        dur = (api.get(f"/api/skills/{sid}").json().get("source") or {}).get("duration") or 30
        # A person waits for a few minutes at most; scale with the clip (about 4x its length, at least 3 min).
        rec.mark(f"process (clip {dur:.0f} s)", processed.process_s, limit_s=max(180.0, 4 * dur))
        for name, s in lib.stage_times(job).items():
            rec.mark(f"stage {name}", s)
        rec.save("job.json", job)
        assert job["status"] == "done", f"process job {job['id']} {job['status']}: {job.get('error')}"
        stages = {s["name"]: s for s in job["stages"]}
        for name in ("decode", "perceive", "steps", "write", "verify", "twin", "narrate", "ready"):
            assert stages.get(name, {}).get("status") == "done", f"stage {name}: {stages.get(name)}"
        assert "unavailable" not in (stages["perceive"].get("detail") or ""), f"perceive ran degraded: {stages['perceive']}"
        assert "unavailable" not in json.dumps(stages["write"]).lower(), f"writer fell back: {stages['write']}"
    sk = api.get(f"/api/skills/{sid}").json()
    rec.save("skill.json", sk)
    assert sk["status"] == "ready"
    steps = sk["steps"]
    assert len(steps) >= 3, f"only {len(steps)} steps"
    for st in steps:
        assert st["title"] and st["instruction"] and st["why"], f"step {st['index']} incomplete: {st}"
        assert st["why_source"] in ("expert", "inferred")
        assert st["t_end"] > st["t_start"]
        assert st["keyframe"], f"step {st['index']} has no keyframe"
    assert lib.fetch(api, steps[0]["keyframe"]).headers["content-type"].startswith("image/")
    v = sk["verification"]
    assert v["status"] in ("verified", "suspect"), f"verification did not run: {v}"
    assert isinstance(v.get("score"), (int, float)) and 0 <= v["score"] <= 1
    rec.note(f"verification {v['status']} score {v['score']:.2f}")
    if processed.sample.get("kind", "real") == "real":
        assert v["status"] == "verified", f"a real recording was judged {v['status']} ({v['score']:.2f}): {v.get('details')}"
    pc = api.get(v["pointcloud"])
    assert pc.status_code == 200 and int(pc.headers.get("x-points", 0)) > 1000, f"point cloud: {pc.status_code} {pc.headers.get('x-points')}"
    assert sk["sop_markdown"].lstrip().startswith("#") and len(sk["sop_markdown"]) > 200, "SOP missing or empty"
    quiz = sk.get("quiz") or []
    assert len(quiz) >= 3, f"quiz has {len(quiz)} questions"
    for q in quiz:
        assert q.get("q") and len(q.get("choices") or []) >= 2 and 0 <= q.get("answer", -1) < len(q["choices"]), f"bad quiz item {q}"
    # The writer puts the right choice first and the backend shuffles each question (seeded by its text), so one
    # skill can legitimately have all answers at one index; across every quiz on the box they must not all be 0.
    answers = [q["answer"] for q in quiz]
    for other in api.get("/api/skills", params={"status": "ready", "include_test": 1}).json():
        if other["id"] != sid:
            answers += [q.get("answer") for q in (api.get(f"/api/skills/{other['id']}").json().get("quiz") or [])]
    rec.note(f"quiz answer indexes: this skill {[q['answer'] for q in quiz]}; {len(answers)} questions on the box")
    if len(answers) >= 6:
        assert any(a != 0 for a in answers), f"all {len(answers)} quiz answers on the box are the first choice"
    assert sk.get("safety") is not None
    assert (sk.get("robot") or {}).get("program"), "no robot program"
    used = {m["model"]: m for m in sk.get("models_used", [])}
    rec.save("models_used.json", sk.get("models_used"))
    missing = {"HaMeR", "RF-DETR", "VGGT-1B", "gpt-oss-20b", "S2 Pro"} - set(used)
    assert not missing, f"models_used lacks {missing}: {sorted(used)}"
    off_chip = [m for m in sk["models_used"] if m["model"] in TT_MODELS and m.get("backend") != "tt"]
    assert not off_chip, f"results not served by the TT chips: {off_chip}"
    got = {}
    for name in ("tracks", "twin"):
        with rec.time(f"GET {name}", limit_s=2.0):
            r = api.get(f"/api/skills/{sid}/{name}")
        assert r.status_code == 200, f"{name} -> {r.status_code}"
        got[name] = r.json()
    tracks = got["tracks"]
    with_hands = sum(1 for f in tracks["frames"] if f.get("hands"))
    rec.note(f"{len(tracks['frames'])} analysed frames, {with_hands} with hands")
    assert with_hands > 0.2 * len(tracks["frames"]), f"hands found in only {with_hands}/{len(tracks['frames'])} frames"
    # Narration: the intro and first steps are voiced before ready, the rest in the background.
    t0, deadline = time.perf_counter(), time.monotonic() + float(os.environ.get("QA_NARRATION_TIMEOUT", 600))
    while True:
        lesson = api.get(f"/api/learn/lessons/{sid}").json()
        narrated = [s for s in lesson["steps"] if s.get("narration_audio")]
        if (lesson.get("intro_audio") and len(narrated) == len(lesson["steps"])) or time.monotonic() > deadline:
            break
        time.sleep(3)
    rec.mark("all narration voiced (after ready)", time.perf_counter() - t0, limit_s=120)
    assert lesson.get("intro_audio"), "no intro narration"
    assert len(narrated) == len(lesson["steps"]), f"narration for {len(narrated)}/{len(lesson['steps'])} steps after {time.perf_counter() - t0:.0f} s"
    # F3, the Check page: VGGT tells a real recording from an AI-made clip.
    for smp in api.get("/api/samples").json():
        with rec.time(f"verify sample {smp['id']}", limit_s=60):
            r = api.get(f"/api/samples/{smp['id']}/verify", timeout=300)
        assert r.status_code == 200, f"sample verify {smp['id']} -> {r.status_code} {r.text[:200]}"
        sv = r.json()
        rec.note(f"sample {smp['id']} ({smp.get('kind')}): {sv['status']} {sv['score']:.2f}")
        want = "verified" if smp.get("kind", "real") == "real" else "suspect"
        assert sv["status"] == want, f"sample {smp['id']} ({smp.get('kind')}) judged {sv['status']} ({sv['score']:.2f})"


# ------------------------------------------------------------------------------------ 3. live capture
async def _capture(sid: str, frames: list[Path], wav: bytes, rec: lib.Recorder, max_s: float) -> dict:
    """Stream frames at 10 fps like the browser, answer the first coach question by voice, then stop."""
    ws = await lib.ws_connect(f"/ws/capture/{sid}")
    log: dict = {"analysis": [], "events": [], "steps": [], "coach": [], "coach_audio": [], "transcript": [], "errors": [],
                 "saved": None}
    sent_at: dict[float, float] = {}
    lat: list[float] = []
    state = {"step_at": None, "coach_at": None, "answer_at": None, "t": 0.0, "stop": False}
    t_start = time.perf_counter()

    async def sender():
        k = 0
        while not state["stop"] and time.perf_counter() - t_start < max_s:
            jpeg = frames[k % len(frames)].read_bytes()
            t = round(k / 10.0, 2)
            state["t"] = t
            sent_at[t] = time.perf_counter()
            await ws.send(json.dumps({"type": "frame", "t": t, "jpeg": lib.b64(jpeg)}))
            k += 1
            await asyncio.sleep(max(0.0, t_start + k / 10.0 - time.perf_counter()))

    async def receiver():
        async for raw in ws:
            m = json.loads(raw)
            kind = m.get("type")
            now = time.perf_counter()
            if kind == "analysis":
                if m["t"] in sent_at:
                    lat.append(now - sent_at[m["t"]])
                log["analysis"].append({k: m.get(k) for k in ("t", "timing_ms", "served_by", "unavailable")} |
                                       {"hands": len(m.get("hands") or []), "objects": [o["label"] for o in m.get("objects") or []]})
            elif kind == "event":
                log["events"].append(m)
            elif kind == "step":
                log["steps"].append(m["step"])
                state["step_at"] = state["step_at"] or now
            elif kind == "coach":
                log["coach"].append(m | {"_at": now - t_start})
                if state["coach_at"] is None:
                    state["coach_at"] = now
                    if state["step_at"]:
                        rec.mark("coach question text after the step closed", now - state["step_at"], limit_s=6)
                    if m.get("audio"):
                        rec.mark("coach question voice after the text", 0.0, limit_s=10)
                        await answer(m["id"])
            elif kind == "coach_audio":
                log["coach_audio"].append(m | {"_at": now - t_start})
                if state["answer_at"] is None and log["coach"] and m["id"] == log["coach"][0]["id"]:
                    rec.mark("coach question voice after the text", now - state["coach_at"], limit_s=10)
                    await answer(m["id"])
            elif kind == "transcript":
                log["transcript"].append(m)
                if state["answer_at"]:
                    rec.mark("answer transcript after sending the voice answer", now - state["answer_at"], limit_s=3)
                # Keep streaming a little after the answer, as a person would, then stop.
                await asyncio.sleep(2.0)
                state["stop"] = True
                await ws.send(json.dumps({"type": "stop"}))
                state["stop_at"] = time.perf_counter()
            elif kind == "saved":
                log["saved"] = m
                rec.mark("saved after stop", time.perf_counter() - state.get("stop_at", now), limit_s=10)
                break
            elif kind == "error":
                log["errors"].append(m)

    async def answer(qid: str):
        state["answer_at"] = time.perf_counter()
        await ws.send(json.dumps({"type": "answer", "t": state["t"], "question_id": qid, "wav": lib.b64(wav)}))

    send_task = asyncio.create_task(sender())
    try:
        await asyncio.wait_for(receiver(), timeout=max_s + 60)
    except asyncio.TimeoutError:
        log["timeout"] = True
    finally:
        state["stop"] = True
        send_task.cancel()
        await ws.close()
    log["analysis_latency_s"] = {"n": len(lat), "p50": round(statistics.median(lat), 3) if lat else None,
                                 "p90": round(sorted(lat)[int(0.9 * len(lat))], 3) if lat else None}
    log["frames_sent"] = len(sent_at)
    log["seconds"] = round(time.perf_counter() - t_start, 1)
    return log


@pytest.mark.flow(3)
def test_3_live_capture_coach_and_answer(api, rec, scratch):
    """F1: frames over WS /ws/capture, a coach question with voice, a spoken answer transcribed and kept with a step."""
    if os.environ.get("QA_CAPTURE_VIDEO"):
        video = Path(os.environ["QA_CAPTURE_VIDEO"])
    else:
        video = lib.sample_file(api, lib.pick_sample(api, os.environ.get("QA_CAPTURE_SAMPLE")), scratch)
    frames = lib.jpeg_frames(video, scratch / "capture_frames", seconds=float(os.environ.get("QA_CAPTURE_SECONDS", 90)))
    assert len(frames) > 30, f"only {len(frames)} frames from {video}"
    wav, tts = lib.tts_wav(api, ANSWER, scratch / "answer.wav", rec, pad_before=0.3, pad_after=0.5)
    rec.note(f"capture video {video.name}, {len(frames)} frames; answer wav {lib.wav_seconds(wav):.1f} s")
    with rec.time("create live skill", limit_s=2):
        sid = api.post("/api/skills", json={"source": "live", "title": lib.QA_PREFIX + "live capture"},
                       headers={"X-Tacit-User": "u_maria"}).json()["skill_id"]
    lib.CREATED["skills"].append(sid)
    log = lib.run(_capture(sid, frames, wav.read_bytes(), rec, max_s=float(os.environ.get("QA_CAPTURE_MAX_S", 150))))
    summary = {k: (v if not isinstance(v, list) else len(v)) for k, v in log.items()}
    rec.save("capture_log.json", log)
    rec.note(f"capture: {json.dumps(summary)}")
    rec.mark("analysis latency p50 (frame sent -> analysis back)", log["analysis_latency_s"]["p50"] or 99, limit_s=0.5)
    assert len(log["analysis"]) > 0.3 * log["frames_sent"], f"analysed {len(log['analysis'])} of {log['frames_sent']} frames"
    degraded = [a for a in log["analysis"] if a.get("unavailable")]
    assert len(degraded) < 0.1 * len(log["analysis"]), f"{len(degraded)} frames analysed without a model: {degraded[:3]}"
    off_chip = {s["model"] for a in log["analysis"] for s in lib.non_tt(a.get("served_by"))}
    assert not off_chip, f"live analysis not on the TT chips: {off_chip}"
    assert log["steps"], f"no step closed in {log['seconds']} s ({len(log['events'])} events)"
    assert log["coach"], f"no coach question ({len(log['steps'])} steps, errors {log['errors']})"
    q = log["coach"][0]
    assert q["text"].strip().endswith("?") or len(q["text"]) > 10, f"odd question: {q['text']}"
    audio = q.get("audio") or next((a["audio"] for a in log["coach_audio"] if a["id"] == q["id"]), None)
    assert audio, f"the coach question was never spoken: {q}"
    assert lib.fetch(api, audio).content[:4] == b"RIFF"
    assert log["transcript"], f"no transcript for the spoken answer (errors {log['errors']})"
    tr = log["transcript"][0]
    assert tr["question_id"] == q["id"]
    overlap = lib.words(tr["text"]) & lib.words(ANSWER)
    assert len(overlap) >= 0.5 * len(lib.words(ANSWER)), f"transcript does not match the answer: {tr['text']!r}"
    assert log["saved"] and log["saved"].get("job_id"), f"no saved message after stop: errors {log['errors']}"
    with rec.time("process the live capture", limit_s=180):
        job = lib.wait_process(api, sid, log["saved"]["job_id"], 900, rec)
    rec.save("job.json", job)
    assert job["status"] == "done", f"processing the capture failed: {job.get('error')}"
    sk = api.get(f"/api/skills/{sid}").json()
    rec.save("skill.json", sk)
    if not sk["title"].startswith(lib.QA_PREFIX):
        api.patch(f"/api/skills/{sid}", json={"title": lib.QA_PREFIX + sk["title"]})
    qa = [x for x in sk.get("qa", []) if x.get("answer")]
    assert qa, f"the answer was not kept with the skill: {sk.get('qa')}"
    assert qa[0].get("step_index"), f"the answer is not attached to a step: {qa[0]}"
    st = next(s for s in sk["steps"] if s["index"] == qa[0]["step_index"])
    assert st["why_source"] == "expert" and lib.words(tr["text"]) & lib.words(st["why"]), f"step why is not the expert's answer: {st}"
    if log["errors"]:
        rec.flag(f"server errors during capture: {log['errors'][:3]}")


# ------------------------------------------------------------------------------------ 4. learn
async def _practice(session_id: str, frames: list[Path], step_index: int, rec: lib.Recorder) -> dict:
    ws = await lib.ws_connect(f"/ws/learn/{session_id}")
    log: dict = {"analysis": 0, "feedback": [], "step_done": [], "errors": [], "saved": None}
    t0 = time.perf_counter()
    await ws.send(json.dumps({"type": "step", "index": step_index}))

    async def sender():
        for k, f in enumerate(frames):
            await ws.send(json.dumps({"type": "frame", "t": round(k / 10, 2), "jpeg": lib.b64(f.read_bytes())}))
            await asyncio.sleep(max(0.0, t0 + (k + 1) / 10 - time.perf_counter()))
        await asyncio.sleep(1.0)
        await ws.send(json.dumps({"type": "stop"}))

    async def receiver():
        async for raw in ws:
            m = json.loads(raw)
            if m["type"] == "analysis":
                log["analysis"] += 1
            elif m["type"] == "feedback":
                if not log["feedback"]:
                    rec.mark("first practice feedback", time.perf_counter() - t0, limit_s=2)
                log["feedback"].append({k: m.get(k) for k in ("step_index", "score", "phase", "hint", "done")})
            elif m["type"] == "step_done":
                log["step_done"].append(m)
            elif m["type"] == "saved":
                log["saved"] = m
                break
            elif m["type"] == "error":
                log["errors"].append(m)
                break

    s = asyncio.create_task(sender())
    try:
        await asyncio.wait_for(receiver(), timeout=len(frames) / 10 + 30)
    finally:
        s.cancel()
        await ws.close()
    return log


def _sse(api, path: str, rec: lib.Recorder, label: str, **kw) -> dict:
    out: dict = {"delta": [], "audio": [], "done": None, "end": False, "transcript": None, "error": None}
    t0 = time.perf_counter()
    with api.stream("POST", path, timeout=120, **kw) as r:
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.read()[:300]}"
        assert r.headers["content-type"].startswith("text/event-stream")
        event = None
        for line in r.iter_lines():
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:") and event:
                data = json.loads(line[5:])
                now = time.perf_counter() - t0
                if event == "delta":
                    if not out["delta"]:
                        rec.mark(f"{label}: first text", now, limit_s=3)
                    out["delta"].append(data["text"])
                elif event == "audio":
                    if not out["audio"]:
                        rec.mark(f"{label}: first spoken sentence", now, limit_s=8)
                    out["audio"].append(data)
                elif event == "transcript":
                    rec.mark(f"{label}: question transcribed", now, limit_s=3)
                    out["transcript"] = data
                elif event == "done":
                    rec.mark(f"{label}: answer text complete", now, limit_s=30)
                    out["done"] = data
                elif event == "end":
                    rec.mark(f"{label}: last sentence spoken (stream end)", now, limit_s=45)
                    out["end"] = True
                elif event == "error":
                    out["error"] = data
    return out


@pytest.mark.flow(4)
def test_4_learn_narration_practice_tutor(api, rec, scratch, ready_skill):
    """F4: narration plays, practice gives a score and a hint, the tutor answers by text and by voice."""
    sid = ready_skill.skill_id
    sam = {"X-Tacit-User": "u_sam"}
    with rec.time("GET /api/learn/lessons", limit_s=1):
        lessons = api.get("/api/learn/lessons", params={"include_test": 1}, headers=sam).json()
    offered = {x["skill_id"] for x in lessons}
    assert sid in offered, "the ready skill is not offered as a lesson (with include_test=1)"
    ready = {x["id"] for x in api.get("/api/skills", params={"status": "ready"}).json()}
    assert ready <= offered, f"ready skills not offered as lessons: {sorted(ready - offered)}"
    with rec.time("GET lesson", limit_s=1):
        lesson = api.get(f"/api/learn/lessons/{sid}").json()
    rec.save("lesson.json", lesson)
    with rec.time("fetch the first narration clip", limit_s=1):
        a = lib.fetch(api, lesson["steps"][0]["narration_audio"])
    assert a.content[:4] == b"RIFF" and len(a.content) > 8000, "narration is not a playable WAV"
    assert lib.fetch(api, lesson["intro_audio"]).content[:4] == b"RIFF"

    # the lesson in the trainee's language (use case 6)
    with rec.time("lesson in Spanish (first request translates)", limit_s=30):
        es = api.get(f"/api/learn/lessons/{sid}", params={"lang": "es"}, timeout=180).json()
    assert es["steps"] and es["steps"][0]["instruction"] != lesson["steps"][0]["instruction"], "the Spanish lesson is not translated"
    rec.note(f"es step 1: {es['steps'][0]['instruction'][:80]}")

    # practice: the expert's own clip for step 1 should score well and get a concrete hint
    with rec.time("POST /api/learn/sessions", limit_s=1):
        ls = api.post("/api/learn/sessions", json={"skill_id": sid, "lang": "en"}, headers=sam).json()["session_id"]
    sk = api.get(f"/api/skills/{sid}").json()
    st = sk["steps"][0]
    video = scratch / "learn_src.mp4"
    video.write_bytes(lib.fetch(api, sk["source"]["video"]).content)
    frames = lib.jpeg_frames(video, scratch / "learn_frames", start=st["t_start"],
                             seconds=max(4.0, min(20.0, st["t_end"] - st["t_start"] + 1)))
    log = lib.run(_practice(ls, frames, st["index"], rec))
    rec.save("practice_log.json", log)
    assert not log["errors"], f"practice errors: {log['errors']}"
    assert log["analysis"] > 0 and log["feedback"], f"no feedback ({log['analysis']} analyses)"
    best = max(f["score"] for f in log["feedback"])
    hints = {f["hint"] for f in log["feedback"] if f.get("hint")}
    rec.note(f"practice: {len(log['feedback'])} feedback messages, best score {best:.2f}, hints {sorted(hints)[:3]}")
    assert all(0 <= f["score"] <= 1 for f in log["feedback"])
    assert hints, "no hint in the feedback"
    assert best > 0.3, f"the expert's own motion scored only {best:.2f}"
    assert log["saved"] is not None, "practice did not save progress on stop"

    # tutor by text
    q = "Why does the first step matter, and what should I watch out for?"
    text = _sse(api, f"/api/tutor/{sid}/ask", rec, "tutor (text)", json={"question": q, "lang": "en"})
    rec.save("tutor_text.json", text)
    assert not text["error"], f"tutor error: {text['error']}"
    assert text["delta"] and text["done"] and len(text["done"]["text"]) > 20, "tutor gave no answer"
    assert text["audio"], "the tutor's answer was not spoken"
    assert text["end"], "the tutor stream did not send end"
    assert lib.fetch(api, text["audio"][0]["audio"]).content[:4] == b"RIFF"

    # tutor by voice
    vq = "What should I check before I start this task?"
    wav, _ = lib.tts_wav(api, vq, scratch / "question.wav", None, pad_before=0.3, pad_after=0.3)
    voice = _sse(api, f"/api/tutor/{sid}/ask", rec, "tutor (voice)",
                 files={"audio": ("question.wav", wav.read_bytes(), "audio/wav")}, data={"lang": "en"})
    rec.save("tutor_voice.json", voice)
    assert not voice["error"], f"tutor error: {voice['error']}"
    assert voice["transcript"], "no transcript event for a spoken question"
    overlap = lib.words(voice["transcript"]["text"]) & lib.words(vq)
    assert len(overlap) >= 0.5 * len(lib.words(vq)), f"question transcribed as {voice['transcript']['text']!r}"
    assert voice["delta"] and voice["done"] and voice["audio"], "the spoken question got no spoken answer"

    # quiz and certificate, then the manager sees the progress
    right = [x["answer"] for x in sk.get("quiz", [])]
    with rec.time("complete the lesson (quiz)", limit_s=2):
        done = api.post(f"/api/learn/sessions/{ls}/complete", json={"quiz_answers": right}).json()
    assert done["passed"] and done["certificate"], f"quiz not passed with the right answers: {done}"
    assert lib.fetch(api, done["certificate"]).status_code == 200
    prog = api.get("/api/learn/progress", headers={"X-Tacit-User": "u_priya"}).json()
    mine = [p for p in prog if p["skill_id"] == sid and p["trainee"]["id"] == "u_sam"]
    assert mine and mine[0]["passed"], f"manager does not see Sam's progress: {mine}"


# ------------------------------------------------------------------------------------ 5. robot lab
async def _robot_run(run_id: str, timeout_s: float) -> dict:
    ws = await lib.ws_connect(f"/ws/robot/{run_id}")
    log: dict = {"meta": None, "states": 0, "state_t": [], "cameras": {}, "gr00t": [], "done": None, "errors": [], "phases": []}
    t0 = time.perf_counter()

    async def receiver():
        async for raw in ws:
            m = json.loads(raw)
            k = m.get("type")
            if k == "meta":
                log["meta"] = m
                log["first_msg_s"] = round(time.perf_counter() - t0, 2)
            elif k == "state":
                log["states"] += 1
                log["state_t"].append(time.perf_counter() - t0)
                assert len(m["qpos"]) == 9 and len(m["ee"]) == 3
                if m.get("phase") and (not log["phases"] or log["phases"][-1] != m["phase"]):
                    log["phases"].append(m["phase"])
            elif k == "camera":
                c = log["cameras"].setdefault(m["name"], {"n": 0, "bytes": 0})
                c["n"] += 1
                c["bytes"] = max(c["bytes"], len(m["jpeg"]))
                if "first_camera_s" not in log:
                    log["first_camera_s"] = round(time.perf_counter() - t0, 2)
            elif k == "gr00t":
                log["gr00t"].append(m.get("ms"))
            elif k == "done":
                log["done"] = m
                break
            elif k == "error":
                log["errors"].append(m)
                break

    try:
        await asyncio.wait_for(receiver(), timeout=timeout_s)
    except asyncio.TimeoutError:
        log["timeout"] = True
    finally:
        await ws.close()
    ts = log.pop("state_t")
    log["seconds"] = round(time.perf_counter() - t0, 1)
    log["state_hz"] = round((len(ts) - 1) / (ts[-1] - ts[0]), 1) if len(ts) > 2 and ts[-1] > ts[0] else None
    return log


@pytest.mark.flow(5)
def test_5_robot_lab_train_evaluate_run(api, rec, ready_skill):
    """F5: train a BC policy, evaluate (>= 80% over 20 trials), run it, and run GR00T N1.7 on chip 3."""
    sid = ready_skill.skill_id
    with rec.time("GET robot", limit_s=2):
        info = api.get(f"/api/robot/{sid}").json()
    assert info["program"], "no robot program"
    assert info.get("sim_available", True), "the sim is not available to the backend"
    with rec.time("GET robot scene", limit_s=3):
        scene = api.get("/api/robot/scene", params={"skill_id": sid}).json()
    rec.save("scene.json", scene)
    rec.note(f"program: {info['program']}")
    demos, epochs = int(os.environ.get("QA_DEMOS", 200)), int(os.environ.get("QA_EPOCHS", 30))
    with rec.time(f"train ({demos} demos, {epochs} epochs)", limit_s=300):
        tj = lib.wait_job(api, api.post(f"/api/robot/{sid}/train", json={"demos": demos, "epochs": epochs}).json()["job_id"], 1800)
    rec.save("train_job.json", tj)
    assert tj["status"] == "done", f"training failed: {tj.get('error')}"
    curve = tj["result"]["loss_curve"]
    assert len(curve) == epochs and curve[-1][1] < curve[0][1], f"loss did not fall: {curve[:2]} .. {curve[-2:]}"
    with rec.time("evaluate (20 trials)", limit_s=180):
        ej = lib.wait_job(api, api.post(f"/api/robot/{sid}/evaluate", json={"trials": 20, "seed": 0}).json()["job_id"], 1800)
    rec.save("evaluate_job.json", ej)
    assert ej["status"] == "done", f"evaluation failed: {ej.get('error')}"
    res = ej["result"]
    fails = [t for t in res["trials"] if not t["success"]]
    rec.note(f"evaluation: {res['success_rate']:.0%} over {len(res['trials'])} trials; failures {[t.get('reason') for t in fails]}")
    assert len(res["trials"]) == 20
    assert res["success_rate"] >= 0.8, f"policy success {res['success_rate']:.0%} < 80%: {[t.get('reason') for t in fails]}"

    with rec.time("start policy run", limit_s=2):
        rid = api.post(f"/api/robot/{sid}/run", json={"mode": "policy", "seed": 3, "realtime": True}).json()["run_id"]
    pol = lib.run(_robot_run(rid, 180))
    rec.save("policy_run.json", pol)
    assert not pol["errors"] and pol["meta"] and pol["states"] > 30 and pol["done"], f"policy run: {pol}"
    rec.mark("policy run: first message", pol["first_msg_s"], limit_s=3)
    rec.note(f"policy run: {pol['states']} states at {pol['state_hz']} Hz, success {pol['done'].get('success')}")
    if pol["state_hz"] and pol["state_hz"] < 20:
        rec.flag(f"policy run streams at {pol['state_hz']} Hz (contract 30 Hz)")

    with rec.time("start GR00T run", limit_s=2):
        gid = api.post(f"/api/robot/{sid}/run", json={"mode": "gr00t", "seed": 3, "realtime": True}).json()["run_id"]
    gr = lib.run(_robot_run(gid, float(os.environ.get("QA_GR00T_TIMEOUT", 300))))
    rec.save("gr00t_run.json", gr)
    assert not gr["errors"], f"GR00T run errors: {gr['errors']}"
    assert gr["meta"] and gr["states"] > 30, f"GR00T run did not stream state: {gr}"
    assert {"exterior", "wrist"} <= set(gr["cameras"]), f"GR00T run did not stream both cameras: {gr['cameras']}"
    assert gr["gr00t"], "no GR00T inference messages"
    p50 = statistics.median([x for x in gr["gr00t"] if x is not None])
    rec.mark("GR00T inference p50 (ms -> s)", p50 / 1000, limit_s=0.5)
    rec.mark("GR00T run: first camera frame", gr.get("first_camera_s", 99), limit_s=10)
    lib.CREATED["gr00t_queries"] = [len(gr["gr00t"])]
    rec.note(f"GR00T run: {gr['states']} states, cameras {gr['cameras']}, {len(gr['gr00t'])} queries, p50 {p50:.0f} ms, "
             f"done {gr['done']}, timeout {gr.get('timeout', False)}")
    assert gr["done"] is not None or gr.get("timeout"), "GR00T run ended without done"
    runs = api.get(f"/api/robot/{sid}").json()["runs"]
    assert any(r["id"] == rid for r in runs), "the policy run is not in the skill's run history"


# ------------------------------------------------------------------------------------ 6. exchange
@pytest.mark.flow(6)
def test_6_exchange_list_license_pack_earnings(api, rec, ready_skill):
    """F6: list the verified skill, license it as a buyer, download the pack (no video), royalty in earnings."""
    sid = ready_skill.skill_id
    maria, atlas = {"X-Tacit-User": "u_maria"}, {"X-Tacit-User": "u_atlas"}
    sk = api.get(f"/api/skills/{sid}").json()
    expert = sk["expert"]["id"]
    before = api.get("/api/earnings", headers={"X-Tacit-User": expert}).json()
    body = {"skill_id": sid, "price": {"training": 49, "robot_deploy": 499, "exclusive": 9900},
            "royalty_split": {"expert": 0.7, "plant": 0.3}, "industry": "Manufacturing", "robot_types": ["franka"],
            "consent": {"expert_confirmed": True, "motion": True, "gaze": True, "voice_text": True}}
    with rec.time("publish listing", limit_s=2):
        r = api.post("/api/exchange/listings", json=body, headers={"X-Tacit-User": expert})
    assert r.status_code == 200, f"listing refused: {r.status_code} {r.text[:300]}"
    listing = r.json()
    lib.CREATED["listings"].append(listing["id"])
    rec.save("listing.json", listing)
    assert listing["verified"] and listing["consent"]["raw_video"] is False
    assert listing["thumb"] and listing["thumb"] != sk.get("thumb"), "the listing shows a video frame to buyers, not the motion thumb"
    if sk.get("motion_thumb"):
        assert listing["thumb"] == sk["motion_thumb"]
    with rec.time("browse verified listings", limit_s=1):
        found = api.get("/api/exchange/listings", params={"verified": "true", "q": "QA", "include_test": 1}).json()
    assert any(x["id"] == listing["id"] for x in found), "the new listing is not in the verified listings"
    with rec.time("open listing", limit_s=2):
        detail = api.get(f"/api/exchange/listings/{listing['id']}").json()
    assert detail.get("contents") and detail.get("terms"), "listing lacks contents or terms"
    pub = json.dumps(detail.get("skill", {}))
    assert "raw_path" not in pub and not any(e in pub for e in (".mp4\"", ".webm\"")), "listing exposes the raw video"
    with rec.time("license (robot_deploy)", limit_s=2):
        lic = api.post(f"/api/exchange/listings/{listing['id']}/license", json={"license_type": "robot_deploy"}, headers=atlas).json()
    rec.save("license.json", lic)
    assert lic["receipt"]["amount"] == 499
    roy = {x["to"]: x["amount"] for x in lic["receipt"]["royalties"]}
    assert abs(roy[expert] - 349.3) < 0.01 and abs(roy["plant"] - 149.7) < 0.01, f"royalties {roy}"
    lib_ = api.get("/api/exchange/library", headers=atlas).json()
    assert any(x["license"]["id"] == lic["license_id"] for x in lib_), "the license is not in the buyer's library"
    with rec.time("download pack.zip", limit_s=10):
        z = api.get(lic["download"])
    assert z.status_code == 200 and z.headers["content-type"] == "application/zip"
    names = zipfile.ZipFile(io.BytesIO(z.content)).namelist()
    rec.save("pack_contents.txt", "\n".join(names))
    rec.note(f"pack: {len(z.content) / 1e6:.1f} MB, {len(names)} files")
    need = ("skill.json", "motion/tracks.json", "SOP.md", "certificates/verification.json", "certificates/consent.json", "LICENSE.txt")
    for n in need:
        assert any(x.endswith(n) for x in names), f"pack lacks {n}"
    videos = [n for n in names if n.lower().endswith(VIDEO_EXT)]
    assert not videos, f"the pack contains video: {videos}"
    zf = zipfile.ZipFile(io.BytesIO(z.content))
    sj = json.loads(zf.read(next(n for n in names if n.endswith("skill.json"))))
    assert "raw_path" not in json.dumps(sj) and not str((sj.get("source") or {}).get("video", "")).endswith(VIDEO_EXT), \
        "skill.json in the pack points at the video"
    has_policy = any(n.endswith(".pt") for n in names)
    has_demos = any("/demos/" in n or "lerobot" in n.lower() for n in names)
    rec.note(f"pack has policy: {has_policy}, demonstrations: {has_demos}")
    if (sk.get("robot") or {}).get("policy", {}).get("status") == "trained":
        assert has_policy and has_demos, "the skill has a trained policy but the pack lacks the policy or the demonstrations"
    with rec.time("earnings", limit_s=1):
        after = api.get("/api/earnings", headers={"X-Tacit-User": expert}).json()
    assert abs(after["total"] - before["total"] - 349.3) < 0.01, f"earnings {before['total']} -> {after['total']}"
    assert any(e["listing_id"] == listing["id"] and abs(e["amount"] - 349.3) < 0.01 for e in after["entries"]), \
        "no ledger entry for this license"


# ------------------------------------------------------------------------------------ 7. box
@pytest.mark.flow(7)
def test_7_box_nine_models_four_chips(api, rec):
    """F7: nine models healthy on four chips, with latency and cohost memory."""
    with rec.time("GET /api/box", limit_s=1.0):
        box = api.get("/api/box").json()
    rec.save("box.json", box)
    t = box["totals"]
    summary = {c["id"]: (c["group"], c["status"], {m["name"]: m["healthy"] for m in c["models"]}) for c in box["chips"]}
    rec.note(f"box: {t}; {summary}")
    assert t["chips"] == 4 and len(box["chips"]) == 4
    assert t["models"] == 9, f"{t['models']} models"
    down = [(c["id"], m["name"]) for c in box["chips"] for m in c["models"] if not m["healthy"]]
    assert not down, f"unhealthy: {down}"
    assert t["healthy"] == 9
    for c in box["chips"]:
        assert c["status"] == "ok", f"chip {c['id']} {c['status']}"
        assert all(m.get("backend") == "tt" for m in c["models"]), f"chip {c['id']} has non-TT members"
    cohosts = [c for c in box["chips"] if c.get("memory")]
    assert cohosts, "no cohost memory reported"
    q = box.get("speech_queue")
    assert q is not None and {"interactive", "batch", "busy"} <= set(q), f"no speech_queue in /api/box: {q}"
    rec.note(f"speech queue: {q}")
    gr = next(m for c in box["chips"] for m in c["models"] if m["name"].startswith("GR00T"))
    rec.note(f"GR00T on the Box: {gr['calls']} calls, p50 {gr['p50_ms']} ms")
    if lib.CREATED.get("gr00t_queries"):
        assert gr["calls"] > 0 and gr["p50_ms"], f"the Box does not count the GR00T run F5 just made: {gr}"
    idle = [m["name"] for c in box["chips"] for m in c["models"] if m.get("p50_ms") is None]
    if idle:
        rec.note(f"no latency yet (no calls since start): {idle}")
