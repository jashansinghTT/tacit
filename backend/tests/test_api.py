"""The whole backend flow against mocked model endpoints (real response shapes from fixtures)."""
from __future__ import annotations

import base64
import io
import json
import time
import wave
import zipfile

import cv2
import httpx
import numpy as np
import pytest
import respx
from fastapi.testclient import TestClient

from conftest import FIXTURES
from tacit import config
from test_units import _fake_vggt

H = {"X-Tacit-User": "u_maria"}


def _wav(seconds=1.0, rate=16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * int(seconds * rate))
    return buf.getvalue()


def _video(path, seconds=4.0, fps=30):
    out = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (640, 360))
    for i in range(int(seconds * fps)):
        img = np.full((360, 640, 3), 40, np.uint8)
        x = 80 + i * 3
        cv2.rectangle(img, (x, 150), (x + 60, 210), (30, 160, 230), -1)
        out.write(img)
    out.release()


def _vggt_response() -> dict:
    v = _fake_vggt()
    buf = io.BytesIO()
    np.savez_compressed(buf, depth=v["depth"].astype(np.float16), depth_conf=v["depth_conf"].astype(np.float16),
                        world_points=v["world_points"], world_points_conf=v["world_points_conf"].astype(np.float16))
    return {"extrinsic": v["extrinsic"].tolist(), "intrinsic": v["intrinsic"].tolist(),
            "preprocess": v["preprocess"], "dense": {"data": base64.b64encode(buf.getvalue()).decode()}, "timing_ms": {}}


STRUCTURE = {"title": "Sort the cup into the bowl", "summary": "Moves the cup into the bowl so the bench stays clear.",
             "steps": [{"index": 1, "title": "Pick up the cup", "instruction": "Lift the cup from the left of the bench.",
                        "why": "It is closest to your right hand.", "why_source": "inferred", "tips": ["Hold it by the body."]}],
             "robot_program": [{"op": "pick", "object": "cup"}, {"op": "place", "target": "bowl"}],
             "pending_questions": [{"index": 1, "question": "Why the cup first?"}]}
DOCS = {"sop_markdown": "# Sort the cup\n1. **Pick up the cup**", "quiz": [{"q": "Why?", "choices": ["a", "b", "c"], "answer": 1, "explain": "b"}],
        "safety": ["Keep the bench clear."]}


def _llm(request: httpx.Request) -> httpx.Response:
    body = json.loads(request.content)
    prompt = body["messages"][-1]["content"]
    if body.get("stream"):
        chunks = "".join(f"data: {json.dumps({'choices': [{'delta': {'content': w}}]})}\n\n" for w in ["Maria ", "says ", "hold it by the body. ", "Then place it."])
        return httpx.Response(200, text=chunks + "data: [DONE]\n\n", headers={"content-type": "text/event-stream"})
    if "translate" in body["messages"][0]["content"]:
        content = prompt  # identity "translation": same JSON back
    elif "quality lead" in body["messages"][0]["content"]:
        content = "You did the first step well. Do not skip setting the cup in the bowl."
    elif "pending_questions" in prompt:
        content = json.dumps(STRUCTURE)
    elif "standard work instruction in Markdown" in prompt:
        content = DOCS["sop_markdown"]
    elif '"quiz"' in prompt:
        content = "```json\n" + json.dumps({"quiz": DOCS["quiz"], "safety": DOCS["safety"]}) + "\n```"
    else:
        content = "Why did you pick the cup first?"
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


@pytest.fixture()
def api(tmp_path):
    vid = config.SAMPLES / "unit.mp4"
    _video(vid)
    (config.SAMPLES / "samples.json").write_text(json.dumps([{"id": "smp_unit", "title": "Unit sample", "video": "/media/samples/unit.mp4",
                                                              "thumb": "/media/samples/unit.jpg", "duration": 4.0, "kind": "real"}]))
    with respx.mock(assert_all_called=False) as mock:
        mock.post("http://127.0.0.1:21002/predict").respond(json=json.loads((FIXTURES / "rfdetr/response.json").read_text()))
        mock.post("http://127.0.0.1:21001/predict").respond(json=json.loads((FIXTURES / "gaze/response.json").read_text()))
        mock.post("http://127.0.0.1:21000/predict").respond(json=json.loads((FIXTURES / "hamer/response.json").read_text()))
        mock.post("http://127.0.0.1:21003/predict").respond(json=_vggt_response())
        mock.post("http://127.0.0.1:21020/v1/chat/completions").mock(side_effect=_llm)
        mock.post("http://127.0.0.1:21011/v1/tts").respond(content=_wav(1.2), headers={"content-type": "audio/wav"})
        mock.post("http://127.0.0.1:21010/v1/audio/transcriptions").respond(json={"text": "Because it is closest."})
        mock.get(url__regex=r"http://127\.0\.0\.1:210\d\d/.*").respond(json={"ok": True})
        mock.route(host="testserver").pass_through()
        from tacit.app import app
        with TestClient(app) as client:
            yield client


def _wait(client, job_id, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = client.get(f"/api/jobs/{job_id}").json()
        if j["status"] in ("done", "failed"):
            return j
        time.sleep(0.2)
    raise AssertionError("job timed out")


def test_full_flow_process_list_license_pack(api):
    sid = api.post("/api/skills", json={"source": "sample", "sample_id": "smp_unit"}, headers=H).json()["skill_id"]
    job = _wait(api, api.post(f"/api/skills/{sid}/process").json()["job_id"])
    assert job["status"] == "done", job
    assert [s["name"] for s in job["stages"]] == ["decode", "perceive", "steps", "write", "verify", "twin", "narrate", "ready"]
    sk = api.get(f"/api/skills/{sid}").json()
    assert sk["status"] == "ready" and sk["title"] == STRUCTURE["title"]
    assert sk["steps"] and sk["steps"][0]["keyframe"].startswith("/media/")
    assert sk["verification"]["status"] == "verified"
    assert sk["robot"]["program"][0] == {"op": "pick", "object": "cup"}
    assert any(m["model"] == "VGGT-1B" and m["chip"] == 0 for m in sk["models_used"])
    assert "raw_path" not in sk["source"]
    assert api.get(f"/api/skills/{sid}/twin").status_code == 200
    pc = api.get(f"/api/skills/{sid}/pointcloud")
    assert int(pc.headers["X-Points"]) > 1000

    # The expert answers the pending why by voice; the step's why becomes theirs.
    r = api.post(f"/api/skills/{sid}/answer", files={"file": ("a.wav", _wav(), "audio/wav")}, data={"step_index": "1"})
    assert r.status_code == 200 and r.json()["skill"]["steps"][0]["why_source"] == "expert"

    # Listing needs consent; licensing writes royalties; the pack has no video or keyframes.
    assert api.post("/api/exchange/listings", json={"skill_id": sid}, headers=H).status_code == 400
    lst = api.post("/api/exchange/listings", json={"skill_id": sid, "consent": {"expert_confirmed": True}}, headers=H).json()
    assert lst["verified"] and lst["consent"]["raw_video"] is False
    lic = api.post(f"/api/exchange/listings/{lst['id']}/license", json={"license_type": "robot_deploy"},
                   headers={"X-Tacit-User": "u_atlas"}).json()
    assert lic["receipt"]["amount"] == 499 and lic["receipt"]["royalties"][0]["amount"] == pytest.approx(349.3)
    pack = api.get(lic["download"])
    names = zipfile.ZipFile(io.BytesIO(pack.content)).namelist()
    assert any(n.endswith("skill.json") for n in names) and any(n.endswith("SOP.md") for n in names)
    assert not any(n.endswith((".mp4", ".jpg")) for n in names)
    skill_json = json.loads(zipfile.ZipFile(io.BytesIO(pack.content)).read(next(n for n in names if n.endswith("skill.json"))))
    assert all("keyframe" not in s for s in skill_json["steps"]) and "video" not in skill_json["source"]
    earn = api.get("/api/earnings", headers=H).json()
    assert earn["total"] == pytest.approx(349.3)
    assert api.get("/api/exchange/library", headers={"X-Tacit-User": "u_atlas"}).json()[0]["license"]["license_type"] == "robot_deploy"


def test_tutor_streams_text_and_sentence_audio(api):
    sid = api.post("/api/skills", json={"source": "sample", "sample_id": "smp_unit"}, headers=H).json()["skill_id"]
    _wait(api, api.post(f"/api/skills/{sid}/process").json()["job_id"])
    with api.stream("POST", f"/api/tutor/{sid}/ask", json={"question": "How do I hold it?"}) as r:
        body = "".join(r.iter_text())
    events = [line.split(": ", 1)[1] for line in body.splitlines() if line.startswith("event: ")]
    assert events[0] == "delta" and "audio" in events and "done" in events and events[-1] == "end"
    done_line = next(l for l in body.splitlines() if l.startswith("data: ") and '"audio_parts"' in l)
    done = json.loads(done_line.split("data: ", 1)[1])
    assert done["text"].startswith("Maria says")


def test_box_and_lessons(api):
    box = api.get("/api/box").json()
    assert [c["id"] for c in box["chips"]] == [0, 1, 2, 3]
    assert box["totals"]["models"] == 9
    assert isinstance(api.get("/api/learn/lessons", headers={"X-Tacit-User": "u_sam"}).json(), list)


def test_restart_recovers_interrupted_jobs(api):
    from tacit import app as appmod
    from tacit.db import JobRow, session
    from tacit.storage import load_skill, save_skill
    sid = api.post("/api/skills", json={"source": "sample", "sample_id": "smp_unit"}, headers=H).json()["skill_id"]
    sk = load_skill(sid)
    sk["status"] = "processing"
    save_skill(sk)
    with session() as s:
        s.add(JobRow(id="job_orphan", kind="process", skill_id=sid, status="running", payload="{}"))
        s.commit()
    assert appmod.recover_interrupted_jobs() == [sid]
    assert api.get("/api/jobs/job_orphan").json()["status"] == "failed"
    assert load_skill(sid)["status"] == "draft"


def test_listing_preview_never_shows_video_pixels(api):
    sid = api.post("/api/skills", json={"source": "sample", "sample_id": "smp_unit"}, headers=H).json()["skill_id"]
    _wait(api, api.post(f"/api/skills/{sid}/process").json()["job_id"])
    sk = api.get(f"/api/skills/{sid}").json()
    assert sk["motion_thumb"].endswith("/motion.jpg") and sk["thumb"].endswith("/thumb.jpg")
    lst = api.post("/api/exchange/listings", json={"skill_id": sid, "consent": {"expert_confirmed": True}}, headers=H).json()
    assert lst["thumb"] == sk["motion_thumb"]
    assert all(l["thumb"] != sk["thumb"] for l in api.get("/api/exchange/listings").json())



def test_audit_and_translated_lesson(api):
    sid = api.post("/api/skills", json={"source": "sample", "sample_id": "smp_unit"}, headers=H).json()["skill_id"]
    _wait(api, api.post(f"/api/skills/{sid}/process").json()["job_id"])
    vid = config.SAMPLES / "unit.mp4"
    r = api.post(f"/api/skills/{sid}/audit", files={"file": ("run.mp4", vid.read_bytes(), "video/mp4")}, data={"worker": "Sam Okafor"}).json()
    job = _wait(api, r["job_id"])
    assert job["status"] == "done", job
    rep = api.get(f"/api/skills/{sid}/audits/{r['audit_id']}").json()
    assert rep["summary"]["steps_total"] == len(api.get(f"/api/skills/{sid}").json()["steps"])
    assert {row["status"] for row in rep["steps"]} <= {"done", "missing", "out_of_order"}
    assert rep["narrative"].startswith("You did")
    assert api.get(f"/api/skills/{sid}/audits").json()[0]["id"] == r["audit_id"]
    les = api.get(f"/api/learn/lessons/{sid}?lang=es").json()
    assert les["lang"] == "es" and les["steps"] and any(l["code"] == "es" for l in les["languages"])


def test_rename_during_processing_survives(api):
    from tacit.storage import load_skill, save_skill
    sid = api.post("/api/skills", json={"source": "sample", "sample_id": "smp_unit"}, headers=H).json()["skill_id"]
    stale = load_skill(sid)                       # a job's copy, loaded before the rename
    api.patch(f"/api/skills/{sid}", json={"title": "QA renamed mid-run"})
    stale["title"] = "Writer's title"
    save_skill(stale)                             # the job saves its stale copy
    sk = load_skill(sid)
    assert sk["title"] == "QA renamed mid-run" and sk["test"] is True


def test_test_listings_can_be_cleaned_up(api):
    sid = api.post("/api/skills", json={"source": "sample", "sample_id": "smp_unit", "title": "QA cleanup"}, headers=H).json()["skill_id"]
    _wait(api, api.post(f"/api/skills/{sid}/process").json()["job_id"])
    lst = api.post("/api/exchange/listings", json={"skill_id": sid, "consent": {"expert_confirmed": True}}, headers=H).json()
    api.post(f"/api/exchange/listings/{lst['id']}/license", json={"license_type": "training"}, headers={"X-Tacit-User": "u_atlas"})
    before = api.get("/api/earnings", headers=H).json()["total"]
    r = api.delete(f"/api/exchange/listings/{lst['id']}").json()
    assert r["licenses_removed"] == 1
    assert api.get("/api/earnings", headers=H).json()["total"] == pytest.approx(before - 34.3)
    real = api.post("/api/skills", json={"source": "sample", "sample_id": "smp_unit"}, headers=H).json()["skill_id"]
    _wait(api, api.post(f"/api/skills/{real}/process").json()["job_id"])
    real_lst = api.post("/api/exchange/listings", json={"skill_id": real, "consent": {"expert_confirmed": True}}, headers=H).json()
    assert api.delete(f"/api/exchange/listings/{real_lst['id']}").status_code == 400   # never a real listing
