"""F1 live capture: analyse webcam frames, mark steps, ask the expert why out loud, transcribe the answer."""
from __future__ import annotations

import asyncio
import base64
import binascii
import logging
import os
import subprocess
import time

import numpy as np
from fastapi import WebSocket, WebSocketDisconnect

from .. import jobs
from ..models import speech, vision
from ..models.base import ModelUnavailable, decode_image
from ..perception.frame import analyze
from ..perception.mediapipe_runner import MediaPipeRunner
from ..perception.timeline import LiveSegmenter
from ..pipeline import writer
from ..pipeline.process import STAGES, process_skill, source_video
from ..storage import load_skill, media_url, save_skill, tracks_path, write_json

log = logging.getLogger("tacit.capture")

MAX_QUESTIONS = 6
MAX_FRAMES = 6000
MIN_GAP_S = 9.0


class CaptureSession:
    def __init__(self, ws: WebSocket, skill_id: str):
        self.ws = ws
        self.skill_id = skill_id
        self.runner = MediaPipeRunner(video=True)
        self.seg = LiveSegmenter()
        self.frames: list[dict] = []
        self.jpegs: list[bytes] = []
        self.latest: tuple[float, bytes] | None = None
        self.new_frame = asyncio.Event()
        self.questions: list[dict] = []
        self.last_q_t = -1e9
        self.closed = False
        self.send_lock = asyncio.Lock()
        self.tasks: set[asyncio.Task] = set()
        self.size: tuple[int, int] | None = None
        self.prepared: dict | None = None
        self.jpeg_ts: list[float] = []
        self.next_q = 0

    async def send(self, msg: dict) -> None:
        if self.closed:
            return
        async with self.send_lock:
            try:
                await self.ws.send_json(msg)
            except (RuntimeError, WebSocketDisconnect):
                self.closed = True

    def spawn(self, coro) -> None:
        t = asyncio.create_task(coro)
        self.tasks.add(t)
        t.add_done_callback(self.tasks.discard)

    # analysis loop: always the newest frame, so a slow chip never builds a backlog --------------
    async def analysis_loop(self) -> None:
        while not self.closed:
            await self.new_frame.wait()
            self.new_frame.clear()
            if self.latest is None:
                continue
            t, jpeg = self.latest
            try:
                rgb = await asyncio.to_thread(decode_jpeg, jpeg)
                self.size = (rgb.shape[1], rgb.shape[0])
                f = await analyze(rgb, t, self.runner, priority=vision.LIVE)
            except Exception as e:  # noqa: BLE001
                log.exception("analyze")
                await self.send({"type": "error", "message": f"analysis failed: {e}"})
                continue
            self.frames.append(f)
            msg = {"type": "analysis", **{k: f[k] for k in ("t", "hands", "pose", "head", "gaze", "objects", "size", "timing_ms",
                                                         "served_by", "unavailable")}}
            for hd in msg["hands"]:
                hd.pop("rotmats", None)
            await self.send(msg)
            for ev in self.seg.update(f):
                await self.send(ev)
                if ev["type"] == "event" and ev["kind"] == "grasp":
                    self.maybe_prepare(ev)
                elif ev["type"] == "step":
                    self.maybe_ask(ev["step"])

    # The LLM and TTS take ~8 s together, so the question is written while the step is still under way
    # (at the grasp) and spoken as soon as the step ends.
    def maybe_prepare(self, ev: dict) -> None:
        if self.prepared is not None or len(self.questions) >= MAX_QUESTIONS or ev["t"] - self.last_q_t < MIN_GAP_S:
            return
        step = {"draft": f"Pick up the {ev['object']} with the {ev['hand']} hand", "hand": ev["hand"], "objects": [ev["object"]],
                "gaze_target": self.seg.gaze_target, "t_start": ev["t"], "t_end": ev["t"] + 2.0}
        self.prepared = {"t": ev["t"], **self._compose(step)}

    def _compose(self, step: dict) -> dict:
        """Start writing the question and speaking it; returns the two tasks."""
        text_task = asyncio.create_task(writer.coach_question(step, [q["question"] for q in self.questions]))

        async def voice():
            text, _ = await text_task
            path, dur, _ = await speech.tts(text)
            return media_url(path), round(dur, 2)

        return {"text": text_task, "audio": asyncio.create_task(voice())}

    def maybe_ask(self, step: dict) -> None:
        if len(self.questions) >= MAX_QUESTIONS or step["t_end"] - self.last_q_t < MIN_GAP_S:
            return
        self.last_q_t = step["t_end"]
        prepared, self.prepared = self.prepared, None
        if prepared is None or step["t_end"] - prepared["t"] > 25:
            if prepared is not None:
                prepared["text"].cancel()
                prepared["audio"].cancel()
            prepared = self._compose(step)
        self.spawn(self.deliver(step, prepared))

    async def deliver(self, step: dict, prepared: dict) -> None:
        """Text first (the expert can read it at once), then the voice when S2 Pro finishes."""
        self.next_q += 1
        qid = f"q{self.next_q}"
        try:
            text, _ = await prepared["text"]
        except (ModelUnavailable, ValueError, asyncio.CancelledError) as e:
            prepared["audio"].cancel()
            await self.send({"type": "error", "message": f"coach unavailable: {e}"})
            return
        q = {"id": qid, "t": step["t_end"], "question": text, "step": step, "answer": None, "question_audio": None}
        self.questions.append(q)
        audio = prepared["audio"]
        ready = audio.done() and not audio.cancelled() and audio.exception() is None
        await self.send({"type": "coach", "id": qid, "t": step["t_end"], "text": text,
                         "audio": audio.result()[0] if ready else None, "pending_audio": not ready})
        if ready:
            q["question_audio"] = audio.result()[0]
            return
        try:
            url, dur = await audio
        except (ModelUnavailable, asyncio.CancelledError) as e:
            await self.send({"type": "error", "message": f"speech unavailable: {e}"})
            return
        q["question_audio"] = url
        await self.send({"type": "coach_audio", "id": qid, "audio": url, "duration": dur})

    async def answer(self, msg: dict) -> None:
        qid = msg.get("question_id") or (self.questions[-1]["id"] if self.questions else None)
        q = next((x for x in self.questions if x["id"] == qid), None)
        text, ms = msg.get("text"), 0.0
        if msg.get("wav"):
            t0 = time.perf_counter()
            try:
                text, _ = await speech.stt(base64.b64decode(msg["wav"]))
            except ModelUnavailable as e:
                await self.send({"type": "error", "message": f"transcription unavailable: {e}"})
                return
            ms = (time.perf_counter() - t0) * 1000
        if not text:
            return
        if q is None:
            self.next_q += 1
            q = {"id": f"q{self.next_q}", "t": msg.get("t", 0.0), "question": "(volunteered)", "answer": None, "step": None}
            self.questions.append(q)
        q["answer"] = (q["answer"] + " " + text).strip() if q.get("answer") else text
        await self.send({"type": "transcript", "question_id": q["id"], "text": text, "ms": round(ms)})

    async def finish(self) -> None:
        """Save the recording and tracks, then start processing."""
        last = self.seg.finish(self.frames[-1]["t"] if self.frames else 0.0)
        if last:
            await self.send({"type": "step", "step": last})
        skill = load_skill(self.skill_id)
        if not self.jpegs or skill is None:
            await self.send({"type": "error", "message": "nothing was recorded"})
            return
        dst = source_video(self.skill_id)
        await asyncio.to_thread(write_jpegs_video, self.jpegs, self._fps(), dst)
        w, h = self.size or (1280, 720)
        write_json(tracks_path(self.skill_id), {"fps": 10.0, "width": w, "height": h, "frames": self.frames})
        skill["qa"] = [{"t": q["t"], "question": q["question"], "question_audio": q.get("question_audio"), "answer": q.get("answer")}
                       for q in self.questions]
        skill["source"].update({"kind": "live", "video": media_url(dst), "raw_path": str(dst)})
        save_skill(skill)
        job = jobs.run(jobs.create("process", self.skill_id, STAGES), lambda j: process_skill(j, self.skill_id))
        await self.send({"type": "saved", "skill_id": self.skill_id, "job_id": job.id})

    def _fps(self) -> float:
        if len(self.jpeg_ts) >= 2:
            span = self.jpeg_ts[-1] - self.jpeg_ts[0]
            if span > 0:
                return max(2.0, min(30.0, (len(self.jpeg_ts) - 1) / span))
        return 10.0

    jpeg_ts: list[float]


def decode_jpeg(data: bytes) -> np.ndarray:
    return decode_image(base64.b64encode(data).decode())


def write_jpegs_video(jpegs: list[bytes], fps: float, dst) -> None:
    part = dst.with_name(dst.stem + ".part.mp4")
    proc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", f"{fps:.3f}",
                             "-i", "-", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast",
                             "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(part)], stdin=subprocess.PIPE)
    assert proc.stdin is not None
    for j in jpegs:
        proc.stdin.write(j)
    proc.stdin.close()
    if proc.wait() != 0:
        part.unlink(missing_ok=True)
        raise RuntimeError("ffmpeg failed to write the capture")
    os.replace(part, dst)


async def run(ws: WebSocket, skill_id: str) -> None:
    await ws.accept()
    if load_skill(skill_id) is None:
        await ws.send_json({"type": "error", "message": f"no skill {skill_id}"})
        await ws.close()
        return
    s = CaptureSession(ws, skill_id)
    s.jpeg_ts = []
    loop = asyncio.create_task(s.analysis_loop())
    try:
        while True:
            try:
                msg = await ws.receive_json()
                kind = msg.get("type")
                if kind == "frame":
                    jpeg = base64.b64decode(msg["jpeg"], validate=True)
                    if jpeg[:2] != b"\xff\xd8":
                        raise ValueError("not a JPEG")
                    t = float(msg.get("t", time.time()))
            except (KeyError, ValueError, TypeError, binascii.Error) as e:
                await s.send({"type": "error", "message": f"ignored a malformed message: {e}"})
                continue
            if kind == "frame":
                if len(s.jpegs) < MAX_FRAMES:   # about 10 minutes at 10 fps
                    s.jpegs.append(jpeg)
                    s.jpeg_ts.append(t)
                s.latest = (t, jpeg)
                s.new_frame.set()
            elif kind in ("answer", "say"):
                s.spawn(s.answer(msg))
            elif kind == "stop":
                # A coach question still being voiced must not hold the recording: wait briefly, then save.
                if s.tasks:
                    await asyncio.wait(list(s.tasks), timeout=3.0)
                await s.finish()
                break
    except WebSocketDisconnect:
        pass
    finally:
        s.closed = True
        s.new_frame.set()
        loop.cancel()
        if s.prepared:
            for k in ("text", "audio"):
                s.prepared[k].cancel()
        await asyncio.to_thread(s.runner.close)
        try:
            await ws.close()
        except (RuntimeError, WebSocketDisconnect):
            pass
