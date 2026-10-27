"""Speech on chip 1: Whisper (speech to text) and S2 Pro (text to speech), with a TTS cache."""
from __future__ import annotations

import asyncio
import hashlib
import heapq
import io
import re
import time
import wave
from pathlib import Path
from typing import AsyncIterator

import httpx

from .base import ModelUnavailable, client, served, stats
from ..config import MEDIA, endpoints

TTS_DIR = MEDIA / "tts"
VOICE_SEED = 7  # one stable voice for the product


class _Gate:
    """One S2 Pro request at a time; interactive callers (coach, tutor) go before batch narration.

    S2 Pro serves one utterance at a time at about half real time, so without this a lesson being
    narrated in the background would keep the coach silent for minutes.
    """

    LISTEN, INTERACTIVE, BATCH = -1, 0, 1   # transcription first: a person is waiting on it

    def __init__(self):
        self._busy = False
        self._waiting: list[tuple[int, int, asyncio.Future]] = []
        self._seq = 0

    async def acquire(self, priority: int) -> None:
        if not self._busy and not self._waiting:
            self._busy = True
            return
        fut = asyncio.get_running_loop().create_future()
        self._seq += 1
        heapq.heappush(self._waiting, (priority, self._seq, fut))
        try:
            await fut
        except asyncio.CancelledError:
            if fut.done() and not fut.cancelled():
                self.release()  # we were handed the slot while being cancelled
            else:
                self._waiting = [w for w in self._waiting if w[2] is not fut]
                heapq.heapify(self._waiting)
            raise

    def release(self) -> None:
        while self._waiting:
            _, _, fut = heapq.heappop(self._waiting)
            if not fut.done():
                fut.set_result(None)
                return
        self._busy = False

    def waiting(self) -> dict:
        return {"listen": sum(1 for p, _, _ in self._waiting if p == -1),
                "interactive": sum(1 for p, _, _ in self._waiting if p == 0),
                "batch": sum(1 for p, _, _ in self._waiting if p == 1), "busy": self._busy}


GATE = _Gate()


def _tts_key(text: str, voice: str) -> str:
    return hashlib.sha1(f"{voice}|{VOICE_SEED}|{text.strip()}".encode()).hexdigest()[:20]


def wav_duration(data: bytes) -> float:
    try:
        with wave.open(io.BytesIO(data)) as w:
            return w.getnframes() / float(w.getframerate())
    except (wave.Error, EOFError):
        return 0.0


async def tts(text: str, voice: str = "default", batch: bool = False) -> tuple[Path, float, dict]:
    """Speak `text`; returns (wav path under /media/tts, duration s, served_by). Cached by text.
    `batch=True` (lesson narration) yields to every interactive request waiting for the voice."""
    path = TTS_DIR / f"{_tts_key(text, voice)}.wav"
    if path.exists() and path.stat().st_size > 44:
        return path, wav_duration(path.read_bytes()), served(endpoints()["tts"], 0.0, "cache")
    ep = endpoints()["tts"]
    st = stats("tts")
    await GATE.acquire(GATE.BATCH if batch else GATE.INTERACTIVE)
    try:
        if path.exists() and path.stat().st_size > 44:  # spoken while we waited
            return path, wav_duration(path.read_bytes()), served(ep, 0.0, "cache")
        t0 = time.perf_counter()
        try:
            r = await client().post(ep.url + "/v1/tts", json={"text": text, "format": "wav", "seed": VOICE_SEED,
                                                             "latency": "balanced", "normalize": True}, timeout=120)
            r.raise_for_status()
        except httpx.HTTPError as e:
            st.errors += 1
            st.last_error = str(e)
            raise ModelUnavailable(ep, str(e)) from e
    finally:
        GATE.release()
    ms = (time.perf_counter() - t0) * 1000
    st.calls += 1
    st.latencies.append(ms)
    tmp = path.with_suffix(".part")
    tmp.write_bytes(r.content)
    tmp.replace(path)
    return path, wav_duration(r.content), served(ep, ms)


def _sentences(text: str, max_chars: int = 60) -> list[str]:
    parts, cur = [], ""
    for tok in re.split(r"(?<=[.!?])\s+", text.strip()):
        if cur and len(cur) + len(tok) + 1 > max_chars:
            parts.append(cur)
            cur = tok
        else:
            cur = f"{cur} {tok}".strip()
    if cur:
        parts.append(cur)
    return parts or [text]


def _concat_wavs(chunks: list[bytes]) -> bytes:
    """Join WAVs of one format, with 120 ms of silence between sentences."""
    params, frames = None, []
    for c in chunks:
        with wave.open(io.BytesIO(c)) as w:
            params = params or w.getparams()
            frames.append(w.readframes(w.getnframes()))
    assert params is not None
    gap = b"\x00" * int(params.framerate * 0.12) * params.sampwidth * params.nchannels
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setparams(params)
        w.writeframes(gap.join(frames))
    return out.getvalue()


async def tts_sentences(text: str, voice: str = "default") -> tuple[Path, float, dict]:
    """Batch narration: speak a line sentence by sentence (each a short hold on the chip), then join them."""
    path = TTS_DIR / f"{_tts_key(text, voice)}.wav"
    if path.exists() and path.stat().st_size > 44:
        return path, wav_duration(path.read_bytes()), served(endpoints()["tts"], 0.0, "cache")
    parts = _sentences(text)
    if len(parts) == 1:
        return await tts(text, voice, batch=True)
    t0 = time.perf_counter()
    chunks = [(await tts(p, voice, batch=True))[0].read_bytes() for p in parts]
    data = _concat_wavs(chunks)
    tmp = path.with_suffix(".part")
    tmp.write_bytes(data)
    tmp.replace(path)
    return path, wav_duration(data), served(endpoints()["tts"], (time.perf_counter() - t0) * 1000)


async def tts_stream(text: str) -> AsyncIterator[bytes]:
    """Stream S2 Pro's WAV as it is generated (first audio well before the sentence is done)."""
    ep = endpoints()["tts"]
    st = stats("tts")
    await GATE.acquire(GATE.INTERACTIVE)
    t0 = time.perf_counter()
    try:
        async with client().stream("POST", ep.url + "/v1/tts", json={"text": text, "format": "wav", "seed": VOICE_SEED,
                                                                     "latency": "balanced", "streaming": True}, timeout=120) as r:
            r.raise_for_status()
            async for chunk in r.aiter_bytes():
                yield chunk
    except httpx.HTTPError as e:
        st.errors += 1
        st.last_error = str(e)
        raise ModelUnavailable(ep, str(e)) from e
    finally:
        GATE.release()
    st.calls += 1
    st.latencies.append((time.perf_counter() - t0) * 1000)


async def stt(audio: bytes, filename: str = "speech.wav") -> tuple[str, dict]:
    """Transcribe one utterance with Whisper large-v3."""
    ep = endpoints()["whisper"]
    st = stats("whisper")
    await GATE.acquire(GATE.LISTEN)   # Whisper shares chip 1 with S2 Pro: one request on the chip at a time
    t0 = time.perf_counter()
    try:
        r = await client().post(ep.url + "/v1/audio/transcriptions", files={"file": (filename, audio, "audio/wav")},
                                data={"response_format": "json"}, timeout=60)
        r.raise_for_status()
    except httpx.HTTPError as e:
        st.errors += 1
        st.last_error = str(e)
        raise ModelUnavailable(ep, str(e)) from e
    finally:
        GATE.release()
    ms = (time.perf_counter() - t0) * 1000
    st.calls += 1
    st.latencies.append(ms)
    text = r.json().get("text", "").strip()
    return text, served(ep, ms)
