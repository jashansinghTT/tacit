"""Helpers for the E2E suite: the stack's URLs, jobs, media, WebSockets and the run recorder."""
from __future__ import annotations

import asyncio
import base64
import json
import os
import shutil
import subprocess
import time
from contextlib import contextmanager
from pathlib import Path

import httpx
import websockets

BASE = os.environ.get("TACIT_URL", "http://127.0.0.1:8710").rstrip("/")
WS_BASE = BASE.replace("http://", "ws://").replace("https://", "wss://")
REPO = Path(__file__).resolve().parents[2]
EVIDENCE = REPO / ".orchestration" / "evidence" / "qa"
DATA = Path(os.environ.get("TACIT_DATA", Path.home() / "tacit" / "data"))
MEDIA_DIR = Path(os.environ.get("TACIT_E2E_MEDIA", DATA / "e2e"))
QA_PREFIX = "QA "


class Recorder:
    """Timings, flags and notes for one test; written into the run's results.json."""

    def __init__(self, name: str, run_dir: Path):
        self.name = name
        self.run_dir = run_dir
        self.timings: list[dict] = []
        self.flags: list[str] = []
        self.notes: list[str] = []

    @contextmanager
    def time(self, step: str, limit_s: float | None = None):
        """Time a step. Over `limit_s` (what a person would accept) it is flagged as slow, not failed."""
        t0 = time.perf_counter()
        entry = {"step": step, "s": None, "limit_s": limit_s, "slow": False}
        self.timings.append(entry)
        try:
            yield entry
        finally:
            entry["s"] = round(time.perf_counter() - t0, 3)
            if limit_s is not None and entry["s"] > limit_s:
                entry["slow"] = True
                self.flags.append(f"slow: {step} took {entry['s']:.1f} s (limit {limit_s:g} s)")

    def mark(self, step: str, seconds: float, limit_s: float | None = None) -> None:
        """Record a duration measured elsewhere (for example the time to a WebSocket message)."""
        slow = limit_s is not None and seconds > limit_s
        self.timings.append({"step": step, "s": round(seconds, 3), "limit_s": limit_s, "slow": slow})
        if slow:
            self.flags.append(f"slow: {step} took {seconds:.1f} s (limit {limit_s:g} s)")

    def note(self, text: str) -> None:
        self.notes.append(text)

    def flag(self, text: str) -> None:
        self.flags.append(text)

    def save(self, name: str, data) -> Path:
        """Keep a small piece of evidence (JSON or text) next to results.json."""
        d = self.run_dir / self.name
        d.mkdir(parents=True, exist_ok=True)
        p = d / name
        if isinstance(data, (dict, list)):
            p.write_text(json.dumps(data, indent=2, ensure_ascii=False, default=str))
        elif isinstance(data, bytes):
            p.write_bytes(data)
        else:
            p.write_text(str(data))
        return p


# ------------------------------------------------------------------------------------ http and jobs
def client() -> httpx.Client:
    return httpx.Client(base_url=BASE, timeout=httpx.Timeout(120.0, connect=5.0))


def wait_job(api: httpx.Client, job_id: str, timeout_s: float, on_change=None) -> dict:
    """Poll `GET /api/jobs/{id}` until done or failed; `on_change(job)` sees each new stage or status.

    The lead restarts the backend when merging; a restart loses running jobs, so the wait rides out the
    restart and then fails with a clear message if the job stops moving.
    """
    deadline = time.monotonic() + timeout_s
    last, restarted_at, last_move, last_snap = None, None, time.monotonic(), None
    while True:
        try:
            r = api.get(f"/api/jobs/{job_id}")
        except httpx.TransportError:
            restarted_at = restarted_at or time.monotonic()
            if time.monotonic() - restarted_at > 180:
                raise
            time.sleep(2.0)
            continue
        r.raise_for_status()
        job = r.json()
        key = (job.get("status"), job.get("stage"))
        if key != last and on_change:
            on_change(job)
        last = key
        snap = (job.get("status"), job.get("stage"), job.get("progress"))
        if snap != last_snap:
            last_snap, last_move = snap, time.monotonic()
        if job["status"] in ("done", "failed"):
            return job
        if restarted_at and time.monotonic() - last_move > 60:
            raise RuntimeError(f"job {job_id} was lost when the backend restarted (still '{job['status']}' at stage "
                               f"{job.get('stage')}, no progress for 60 s)")
        if time.monotonic() > deadline:
            raise TimeoutError(f"job {job_id} still {job['status']} at stage {job.get('stage')} after {timeout_s:.0f} s")
        time.sleep(1.0)


def wait_process(api: httpx.Client, skill_id: str, job_id: str, timeout_s: float, rec: "Recorder | None" = None) -> dict:
    """Wait for a skill's process job. When a backend restart interrupts it, the backend re-runs it under a new
    job id; follow that one (at most 3 times) and flag the restart, since it is an operations event."""
    deadline = time.monotonic() + timeout_s
    for _ in range(4):
        job = wait_job(api, job_id, max(60.0, deadline - time.monotonic()))
        if job["status"] != "failed" or "interrupted" not in str(job.get("error") or ""):
            return job
        if rec:
            rec.flag(f"backend restarted during processing ({job_id} interrupted at {job.get('stage')}); followed the re-run")
        new = None
        for _ in range(60):
            new = (api.get(f"/api/skills/{skill_id}").json() or {}).get("job_id")
            if new and new != job_id:
                break
            time.sleep(2)
        if not new or new == job_id:
            return job
        job_id = new
    return job


def stage_times(job: dict) -> dict[str, float]:
    return {s["name"]: round((s.get("ms") or 0) / 1000, 2) for s in job.get("stages", [])}


def non_tt(served_by: list[dict]) -> list[dict]:
    """Results that did not come from a Tenstorrent chip (MediaPipe on CPU is expected and allowed)."""
    return [s for s in served_by or [] if s.get("backend") != "tt" and "mediapipe" not in str(s.get("model", "")).lower()]


def fetch(api: httpx.Client, url: str) -> httpx.Response:
    r = api.get(url)
    r.raise_for_status()
    return r


# ------------------------------------------------------------------------------------ media
def pick_sample(api: httpx.Client, prefer: str | None = None) -> dict:
    samples = api.get("/api/samples").json()
    real = [s for s in samples if s.get("kind", "real") == "real"]
    want = prefer or os.environ.get("QA_SAMPLE")
    if want:
        hit = [s for s in samples if s["id"] == want]
        assert hit, f"sample {want} not in /api/samples ({[s['id'] for s in samples]})"
        return hit[0]
    assert real, f"/api/samples has no real sample: {samples}"
    return real[0]


def sample_file(api: httpx.Client, sample: dict, dst_dir: Path) -> Path:
    """The sample's video on disk (downloaded from /media so the test sees what the browser sees)."""
    dst = dst_dir / Path(sample["video"]).name
    if not dst.exists():
        with api.stream("GET", sample["video"]) as r:
            r.raise_for_status()
            with dst.open("wb") as f:
                for chunk in r.iter_bytes():
                    f.write(chunk)
    return dst


def jpeg_frames(video: Path, out_dir: Path, fps: float = 10.0, max_w: int = 960, max_h: int = 540,
                start: float = 0.0, seconds: float | None = None) -> list[Path]:
    """Frames as the browser would send them: JPEG, at most 960x540, about 10 per second."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for p in out_dir.glob("f_*.jpg"):
        p.unlink()
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-ss", f"{start:.2f}", "-i", str(video)]
    if seconds:
        cmd += ["-t", f"{seconds:.2f}"]
    cmd += ["-vf", f"fps={fps},scale={max_w}:{max_h}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-q:v", "4", str(out_dir / "f_%05d.jpg")]
    subprocess.run(cmd, check=True)
    return sorted(out_dir.glob("f_*.jpg"))


def to_wav16k(src: Path, dst: Path, pad_before: float = 0.0, pad_after: float = 0.0) -> Path:
    """16 kHz mono PCM, the shape the browser's VAD cut sends; optional silence around the speech."""
    af = []
    if pad_before:
        af.append(f"adelay={int(pad_before * 1000)}:all=1")
    if pad_after:
        af.append(f"apad=pad_dur={pad_after}")
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"]
    if af:
        cmd += ["-af", ",".join(af)]
    subprocess.run(cmd + [str(dst)], check=True)
    return dst


def tts_wav(api: httpx.Client, text: str, dst: Path, rec: Recorder | None = None, **pad) -> tuple[Path, dict]:
    """Speak `text` with S2 Pro through the backend and keep it as a 16 kHz WAV."""
    t0 = time.perf_counter()
    r = api.post("/api/speech/tts", json={"text": text, "voice": "default", "lang": "en"})
    r.raise_for_status()
    meta = r.json()
    if rec:
        rec.mark("tts: make the test's spoken answer (setup, S2 Pro)", time.perf_counter() - t0)
    raw = dst.with_suffix(".tts.wav")
    raw.write_bytes(fetch(api, meta["audio"]).content)
    return to_wav16k(raw, dst, **pad), meta


def wav_seconds(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out or 0)


def words(s: str) -> set[str]:
    return {w.strip(".,!?;:'\"").lower() for w in s.split() if len(w.strip(".,!?;:'\"")) > 2}


# ------------------------------------------------------------------------------------ websockets
async def ws_connect(path: str):
    return await websockets.connect(WS_BASE + path, max_size=32 * 2**20, open_timeout=10, ping_interval=None)


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def run(coro):
    return asyncio.run(coro)


def have(cmd: str) -> bool:
    return shutil.which(cmd) is not None
