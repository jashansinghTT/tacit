"""Soundtrack takes from MiniMax Music 3 on chip 1 (speech co-host, port 21012).

A take holds chip 1 for its whole generation (about 3 s per second of music), so the coach's voice
and Whisper wait meanwhile: only run this inside a window the lead has given. Takes run one at a
time; each one's request, job status and timings are saved next to its WAV for the claims ledger.

    python3 showreel/tools/music.py 11 23 37
"""

import json
import sys
import time
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:21012"
OUT = Path.home() / "tacit/data/showreel/music"

STYLES = {
    11: "Instrumental cinematic electronic music for a technology showreel, 120 BPM, D minor. Opens sparse with a "
        "pulsing analog synth and soft felt piano, builds with tight drums, rising arpeggios and a riser, then a big "
        "punchy drop with deep sub bass, crisp claps and bright synth plucks. Driving and confident, a short "
        "breakdown, a final lift, and a clean, resolved ending. Modern, precise, premium. No vocals.",
    23: "Instrumental modern electronic score for a product film, 118 BPM, A minor. Starts minimal with a ticking "
        "hi-hat and a warm pad, then a pulsing bassline and staccato strings build to a powerful drop with big "
        "drums and shimmering synths. Rhythmic and tight with clear downbeats, ends cleanly on a final hit. "
        "No vocals.",
    37: "Instrumental cinematic hybrid trailer music, 120 BPM, C minor. Sparse piano and a deep heartbeat pulse, "
        "then building percussion and arpeggiated synths into an energetic, driving main section with punchy "
        "drums and bold synth bass. A brief pause before a final big hit and a short, clean outro. No vocals.",
}


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
        return json.loads(raw) if r.headers.get_content_type() == "application/json" else raw


def request(seed):
    return {"input": "[instrumental]", "instructions": STYLES[seed], "seed": seed, "audio_duration": 74,
            "sample_rate": 44100, "response_format": "wav"}


def take(seed):
    req = request(seed)
    t0 = time.time()
    job = call("POST", "/v1/music/jobs", req)
    print(f"seed {seed}: job {job['id']} queued at position {job.get('queue_position')}", flush=True)
    return finish(seed, job["id"], req, t0)


def finish(seed, job_id, req, t0):
    """Wait for a submitted job and save its audio and metadata (also used to pick up a job whose
    client was stopped)."""
    job = {"id": job_id}
    while True:
        time.sleep(10)
        st = call("GET", f"/v1/music/jobs/{job['id']}")
        print(f"  {st['status']} {st.get('stage', '')} {st.get('frames_done')}/{st.get('frames_max')} "
              f"{st.get('elapsed_s', 0):.0f}s", flush=True)
        if st["status"] in ("done", "error", "cancelled"):
            break
    wall = time.time() - t0
    meta = {"request": req, "job": st, "wall_s": round(wall, 1), "model": "MiniMaxAI/MiniMax-Music3",
            "served_by": "cohost-speech on Blackhole chip 1, port 21012",
            "finished_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    (OUT / f"take_{seed}.json").write_text(json.dumps(meta, indent=2))
    if st["status"] != "done":
        print(f"seed {seed}: {st['status']} {st.get('error')}", flush=True)
        return False
    audio = call("GET", f"/v1/music/jobs/{job['id']}/audio")
    (OUT / f"take_{seed}.wav").write_bytes(audio)
    print(f"seed {seed}: {len(audio)} bytes in {wall:.0f}s wall", flush=True)
    return True


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    if sys.argv[1] == "--resume":  # --resume SEED JOB_ID
        seed = int(sys.argv[2])
        finish(seed, sys.argv[3], request(seed), time.time())
    else:
        for s in [int(a) for a in sys.argv[1:]]:
            take(s)
