"""Tutor latency on a quiet chip 1 with questions it has not answered before (no TTS cache hits).

  uv run --project tests/e2e python scripts/e2e/tutor_probe.py <skill_id> <out.json> <scratch_dir>

Run from the repo root on a ready skill, with nothing else using the speech chip; waits for the chip-1 queue to be
idle before each question. report.py shows the newest runs/solo-f4-*/tutor_cold.json in RESULTS.md.
"""
import json, sys, time
from pathlib import Path
sys.path.insert(0, "tests/e2e")
import e2e_lib as lib

sid, out = sys.argv[1], Path(sys.argv[2])
scratch = Path(sys.argv[3])

def idle(api, timeout=180):
    t0 = time.time()
    while time.time() - t0 < timeout:
        q = api.get("/api/box").json()["speech_queue"]
        if not q["busy"] and q["interactive"] + q["batch"] + q["listen"] == 0:
            return round(time.time() - t0, 1)
        time.sleep(1)
    return None

def sse(api, **kw):
    t0, out, ev = time.perf_counter(), {"marks": {}, "text": ""}, None
    with api.stream("POST", f"/api/tutor/{sid}/ask", timeout=180, **kw) as r:
        for line in r.iter_lines():
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("data:") and ev:
                d, now = json.loads(line[5:]), round(time.perf_counter() - t0, 2)
                key = {"transcript": "transcribed", "delta": "first_text", "audio": "first_audio", "done": "text_done", "end": "end"}.get(ev)
                if key and key not in out["marks"]:
                    out["marks"][key] = now
                if ev == "done":
                    out["text"] = d.get("text", "")
                    out["question"] = d.get("question")
                if ev == "audio":
                    out.setdefault("audio_parts", []).append((now, d.get("duration")))
    return out

res = {"skill": sid, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
with lib.client() as api:
    vq = "How can I tell that the third stem is pushed in far enough?"
    wav, _ = lib.tts_wav(api, vq, scratch / "probe_q.wav", None, pad_before=0.3, pad_after=0.3)
    res["wait_idle_1_s"] = idle(api)
    res["text"] = sse(api, json={"question": "What is the most common mistake people make with the second stem?", "lang": "en"})
    res["wait_idle_2_s"] = idle(api)
    res["voice"] = sse(api, files={"audio": ("q.wav", wav.read_bytes(), "audio/wav")}, data={"lang": "en"})
    res["box"] = {m["name"]: {"p50_ms": m["p50_ms"], "calls": m["calls"]} for c in api.get("/api/box").json()["chips"] for m in c["models"] if c["id"] == 1}
out.write_text(json.dumps(res, indent=2))
print(json.dumps({k: res[k] for k in ("wait_idle_1_s", "wait_idle_2_s")}), "\ntext", res["text"]["marks"], "\nvoice", res["voice"]["marks"], "\n", res["text"]["text"][:200], "\n", res["voice"].get("question"))
