"""Speech on chip 1: Whisper (speech to text) and S2 Pro (text to speech), with a TTS cache."""
from __future__ import annotations

import hashlib
import io
import time
import wave
from pathlib import Path
from typing import AsyncIterator

import httpx

from .base import ModelUnavailable, client, served, stats
from ..config import MEDIA, endpoints

TTS_DIR = MEDIA / "tts"
VOICE_SEED = 7  # one stable voice for the product


def _tts_key(text: str, voice: str) -> str:
    return hashlib.sha1(f"{voice}|{VOICE_SEED}|{text.strip()}".encode()).hexdigest()[:20]


def wav_duration(data: bytes) -> float:
    try:
        with wave.open(io.BytesIO(data)) as w:
            return w.getnframes() / float(w.getframerate())
    except (wave.Error, EOFError):
        return 0.0


async def tts(text: str, voice: str = "default") -> tuple[Path, float, dict]:
    """Speak `text`; returns (wav path under /media/tts, duration s, served_by). Cached by text."""
    path = TTS_DIR / f"{_tts_key(text, voice)}.wav"
    if path.exists() and path.stat().st_size > 44:
        return path, wav_duration(path.read_bytes()), served(endpoints()["tts"], 0.0, "cache")
    ep = endpoints()["tts"]
    st = stats("tts")
    t0 = time.perf_counter()
    try:
        r = await client().post(ep.url + "/v1/tts", json={"text": text, "format": "wav", "seed": VOICE_SEED,
                                                         "latency": "balanced", "normalize": True}, timeout=120)
        r.raise_for_status()
    except httpx.HTTPError as e:
        st.errors += 1
        st.last_error = str(e)
        raise ModelUnavailable(ep, str(e)) from e
    ms = (time.perf_counter() - t0) * 1000
    st.calls += 1
    st.latencies.append(ms)
    tmp = path.with_suffix(".part")
    tmp.write_bytes(r.content)
    tmp.replace(path)
    return path, wav_duration(r.content), served(ep, ms)


async def tts_stream(text: str) -> AsyncIterator[bytes]:
    """Stream S2 Pro's WAV as it is generated (first audio well before the sentence is done)."""
    ep = endpoints()["tts"]
    st = stats("tts")
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
    st.calls += 1
    st.latencies.append((time.perf_counter() - t0) * 1000)


async def stt(audio: bytes, filename: str = "speech.wav") -> tuple[str, dict]:
    """Transcribe one utterance with Whisper large-v3."""
    ep = endpoints()["whisper"]
    st = stats("whisper")
    t0 = time.perf_counter()
    try:
        r = await client().post(ep.url + "/v1/audio/transcriptions", files={"file": (filename, audio, "audio/wav")},
                                data={"response_format": "json"}, timeout=60)
        r.raise_for_status()
    except httpx.HTTPError as e:
        st.errors += 1
        st.last_error = str(e)
        raise ModelUnavailable(ep, str(e)) from e
    ms = (time.perf_counter() - t0) * 1000
    st.calls += 1
    st.latencies.append(ms)
    text = r.json().get("text", "").strip()
    return text, served(ep, ms)
