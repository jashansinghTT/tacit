"""Master the chosen soundtrack take for the reel.

The take (MiniMax Music 3, seed 11) runs past the cut and ends mid-phrase, so the master stops it
just after the final downbeat and lets the room ring: the last two seconds are convolved with a
decaying, darkening stereo noise impulse (a plain algorithmic reverb) to make a natural tail.
Also: -1 dB trim and a soft clip above -1 dBFS (identity below).

    .venv/bin/python tools/master_audio.py take_11.wav master.wav --stop 70.507 [--tail 3.6]
"""

import argparse
import json

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, sosfilt


def impulse(sr, seconds, rt60, seed=3):
    n = int(sr * seconds)
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)
    noise = rng.standard_normal((n, 2))
    env = np.power(10.0, -3.0 * t / rt60)  # -60 dB at rt60
    # Darker as it decays: blend a low-passed copy in over time.
    dark = sosfilt(butter(2, 1800, fs=sr, output="sos"), noise, axis=0)
    bright = sosfilt(butter(2, 7000, fs=sr, output="sos"), noise, axis=0)
    w = np.clip(t / (rt60 * 0.5), 0, 1)[:, None]
    ir = (bright * (1 - w) + dark * w) * env[:, None]
    ir[: int(0.012 * sr)] *= np.linspace(0, 1, int(0.012 * sr))[:, None]  # soft onset, no click
    return ir / np.sqrt((ir ** 2).sum(axis=0, keepdims=True))


def soft_clip(x, thr=0.89):
    """Identity below thr (about -1 dBFS); above it, a tanh knee that never exceeds 1."""
    m = np.abs(x)
    over = m > thr
    y = x.copy()
    y[over] = np.sign(x[over]) * (thr + (1 - thr) * np.tanh((m[over] - thr) / (1 - thr)))
    return y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("take")
    ap.add_argument("out")
    ap.add_argument("--stop", type=float, required=True, help="time of the final downbeat")
    ap.add_argument("--hold", type=float, default=0.22, help="keep this much after the downbeat")
    ap.add_argument("--tail", type=float, default=3.6)
    ap.add_argument("--rt60", type=float, default=3.0)
    ap.add_argument("--wet-db", type=float, default=-7.0, help="tail level vs the dry signal at the stop")
    ap.add_argument("--gain-db", type=float, default=-1.0)
    a = ap.parse_args()

    y, sr = sf.read(a.take, always_2d=True)
    cut = int((a.stop + a.hold) * sr)
    pre = y[cut - 2 * sr: cut].copy()
    pre *= np.sin(np.linspace(0, np.pi / 2, len(pre))) [:, None] ** 2  # weight the last moments
    wet = fftconvolve(pre, impulse(sr, a.tail + 1, a.rt60), axes=0)[len(pre):len(pre) + int(a.tail * sr)]
    wet = sosfilt(butter(2, 120, btype="highpass", fs=sr, output="sos"), wet, axis=0)  # no reverb on the sub
    # Level: the tail starts wet_db under the dry RMS of the last half second.
    dry_rms = np.sqrt(np.mean(y[cut - sr // 2: cut] ** 2))
    wet_rms = np.sqrt(np.mean(wet[: int(0.3 * sr)] ** 2)) + 1e-9
    wet *= dry_rms / wet_rms * 10 ** (a.wet_db / 20)
    fade = int(0.04 * sr)
    dry = y[:cut].copy()
    dry[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    out = np.concatenate([dry, np.zeros((len(wet), 2))])
    out[cut - fade: cut - fade + len(wet)] += wet
    out[-int(0.5 * sr):] *= np.linspace(1, 0, int(0.5 * sr))[:, None] ** 2
    out *= 10 ** (a.gain_db / 20)
    out = soft_clip(out)
    sf.write(a.out, out.astype(np.float32), sr, subtype="FLOAT")
    info = {"take": a.take, "stop": a.stop, "hold": a.hold, "tail": a.tail, "rt60": a.rt60, "wet_db": a.wet_db,
            "gain_db": a.gain_db, "duration": round(len(out) / sr, 3), "peak": round(float(np.abs(out).max()), 3)}
    open(a.out.rsplit(".", 1)[0] + ".json", "w").write(json.dumps(info, indent=1))
    print(info)


if __name__ == "__main__":
    main()
