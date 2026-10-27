"""Turn rendered 2x frames into a 1080p H.264 file.

Sub-frames (f_00012_s0.jpg ...) are averaged in linear light (motion blur); every frame is then
downsampled 3840x2160 -> 1920x1080 with Lanczos and piped to x264 (High, yuv420p, BT.709).
Audio, if given, is cut to the clip's time range and muxed as AAC.

    .venv/bin/python tools/encode.py FRAMES_DIR OUT.mp4 [--fps 30] [--audio master.wav --start 0]
        [--first N --count M] [--fade-in S] [--fade-out S]
"""

import argparse
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 1920, 1080
LUT_LIN = ((np.arange(256) / 255.0 + 0.055) / 1.055) ** 2.4
LUT_LIN[: 11] = np.arange(11) / 255.0 / 12.92


def to_srgb(lin):
    lin = np.clip(lin, 0, 1)
    out = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    return (out * 255 + 0.5).astype(np.uint8)


def load_frame(paths):
    if len(paths) == 1:
        img = Image.open(paths[0]).convert("RGB")
    else:
        acc = None
        for p in paths:
            a = LUT_LIN[np.asarray(Image.open(p).convert("RGB"))]
            acc = a if acc is None else acc + a
        img = Image.fromarray(to_srgb(acc / len(paths)))
    if img.size != (W, H):
        img = img.resize((W, H), Image.LANCZOS)
    return np.asarray(img)


def index(frames_dir: Path):
    groups = {}
    for p in sorted(frames_dir.glob("f_*.jpg")):
        m = re.match(r"f_(\d+)(?:_s(\d+))?\.jpg", p.name)
        groups.setdefault(int(m.group(1)), []).append(p)
    return [groups[k] for k in sorted(groups)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("frames", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--fps", type=float, default=30)
    ap.add_argument("--audio", type=Path)
    ap.add_argument("--start", type=float, default=0.0, help="time of the first frame on the audio's timeline")
    ap.add_argument("--first", type=int, default=0)
    ap.add_argument("--count", type=int)
    ap.add_argument("--fade-in", type=float, default=0)
    ap.add_argument("--fade-out", type=float, default=0)
    ap.add_argument("--crf", type=float, default=14)
    a = ap.parse_args()

    frames = index(a.frames)[a.first:]
    if a.count:
        frames = frames[: a.count]
    dur = len(frames) / a.fps
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(a.fps), "-i", "-"]
    if a.audio:
        cmd += ["-ss", f"{a.start:.4f}", "-t", f"{dur:.4f}", "-i", str(a.audio)]
    afilt = []
    if a.fade_in:
        afilt.append(f"afade=t=in:d={a.fade_in}")
    if a.fade_out:
        afilt.append(f"afade=t=out:st={dur - a.fade_out:.3f}:d={a.fade_out}")
    cmd += ["-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
            "-c:v", "libx264", "-preset", "slow", "-crf", str(a.crf), "-profile:v", "high",
            "-x264-params", "aq-mode=3:aq-strength=0.9:deblock=-1,-1",
            "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-movflags", "+faststart"]
    if a.audio:
        cmd += ["-c:a", "aac", "-b:a", "320k", "-ar", "48000"] + (["-af", ",".join(afilt)] if afilt else []) + ["-shortest"]
    cmd += [str(a.out)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with ThreadPoolExecutor(8) as ex:
        for i, arr in enumerate(ex.map(load_frame, frames)):
            proc.stdin.write(arr.tobytes())
            if i % 150 == 0:
                print(f"  {i}/{len(frames)}", flush=True)
    proc.stdin.close()
    proc.wait()
    print(f"wrote {a.out} ({len(frames)} frames, {dur:.2f} s)")


if __name__ == "__main__":
    main()
