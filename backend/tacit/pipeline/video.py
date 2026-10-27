"""Video in and out: browser-friendly transcode, frame sampling, stills."""
from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path
from typing import Iterator

import cv2
import numpy as np
from PIL import Image


def probe(path: Path) -> dict:
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    return {"fps": round(fps, 3), "frames": n, "width": w, "height": h, "duration": round(n / fps, 3) if fps else 0.0}


async def transcode(src: Path, dst: Path, max_width: int = 1280) -> None:
    """H.264 + yuv420p + faststart so every browser can play and seek it."""
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-vf", f"scale='min({max_width},iw)':-2,fps=30",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(dst)]
    proc = await asyncio.create_subprocess_exec(*cmd, stderr=subprocess.PIPE)
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {err.decode()[-400:]}")


def frames(path: Path, fps: float = 10.0, max_frames: int = 900) -> Iterator[tuple[float, np.ndarray]]:
    """(t seconds, RGB array) sampled at `fps`."""
    cap = cv2.VideoCapture(str(path))
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, round(src_fps / fps))
    i = kept = 0
    while kept < max_frames:
        ok = cap.grab()
        if not ok:
            break
        if i % step == 0:
            ok, bgr = cap.retrieve()
            if not ok:
                break
            yield i / src_fps, cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            kept += 1
        i += 1
    cap.release()


def frame_at(path: Path, t: float) -> np.ndarray | None:
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, t) * 1000)
    ok, bgr = cap.read()
    cap.release()
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB) if ok else None


def save_jpeg(rgb: np.ndarray, path: Path, width: int | None = None, quality: int = 85) -> Path:
    img = Image.fromarray(rgb)
    if width and img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="JPEG", quality=quality)
    return path


def write_frames_video(frames_rgb: list[np.ndarray], fps: float, dst: Path) -> None:
    """Encode in-memory frames (live capture) to an H.264 mp4."""
    if not frames_rgb:
        raise ValueError("no frames")
    h, w = frames_rgb[0].shape[:2]
    proc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}",
                             "-r", f"{fps}", "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                             "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dst)], stdin=subprocess.PIPE)
    assert proc.stdin is not None
    for f in frames_rgb:
        if f.shape[:2] != (h, w):
            f = cv2.resize(f, (w, h))
        proc.stdin.write(np.ascontiguousarray(f).tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("ffmpeg failed to write the capture")
