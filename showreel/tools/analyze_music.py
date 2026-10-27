"""Beat grid, energy arc and sections of a soundtrack take, to judge takes and cut the reel on the music.

Writes <take>.analysis.json (tempo, beats, downbeat phase, per-bar energy, onsets, section
boundaries, loudness) and <take>.analysis.png (spectrogram, RMS, onset strength, beats, sections).

    .venv/bin/python tools/analyze_music.py ~/tacit/data/showreel/music/take_11.wav
"""

import json
import sys
from pathlib import Path

import librosa
import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HOP = 512


def analyze(path: Path) -> dict:
    y, sr = librosa.load(path, sr=44100, mono=False)
    peak = float(np.abs(y).max())
    mono = librosa.to_mono(y) if y.ndim > 1 else y
    dur = len(mono) / sr

    onset_env = librosa.onset.onset_strength(y=mono, sr=sr, hop_length=HOP)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, hop_length=HOP, units="frames")
    beat_t = librosa.frames_to_time(beats, sr=sr, hop_length=HOP)
    ibi = np.diff(beat_t)

    # Downbeat phase: the beat offset (0..3) whose beats carry the most low-frequency onset energy.
    mel = librosa.feature.melspectrogram(y=mono, sr=sr, hop_length=HOP, n_mels=64, fmax=8000)
    low = librosa.onset.onset_strength(S=librosa.power_to_db(mel[:8]), sr=sr, hop_length=HOP)
    strength = [float(np.mean(low[beats[k::4]])) for k in range(4)]
    phase = int(np.argmax(strength))
    downbeats = beat_t[phase::4]

    rms = librosa.feature.rms(y=mono, hop_length=HOP)[0]
    rms_t = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=HOP)
    bar_energy = []
    for a, b in zip(downbeats[:-1], downbeats[1:]):
        m = (rms_t >= a) & (rms_t < b)
        bar_energy.append(round(float(20 * np.log10(np.mean(rms[m]) + 1e-9)), 1))

    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, hop_length=HOP, units="time")
    strong = onsets[onset_env[librosa.time_to_frames(onsets, sr=sr, hop_length=HOP)] >
                    np.percentile(onset_env, 97)]

    # Sections: agglomerative segmentation of beat-synchronous chroma + MFCC.
    chroma = librosa.feature.chroma_cqt(y=mono, sr=sr, hop_length=HOP)
    mfcc = librosa.feature.mfcc(y=mono, sr=sr, hop_length=HOP, n_mfcc=13)
    feats = librosa.util.sync(np.vstack([librosa.util.normalize(chroma), librosa.util.normalize(mfcc)]), beats)
    k = max(4, min(9, int(dur // 9)))
    bounds = librosa.segment.agglomerative(feats, k)
    sec_t = [round(float(beat_t[min(b, len(beat_t) - 1)]), 2) for b in bounds]

    return {
        "file": str(path), "duration": round(dur, 3), "sample_rate": sr, "peak": round(peak, 3),
        "clipping": bool(peak >= 0.999), "loudness_rms_db": round(float(20 * np.log10(np.sqrt(np.mean(mono ** 2)))), 1),
        "tempo": round(float(np.atleast_1d(tempo)[0]), 2), "ibi_mean": round(float(ibi.mean()), 4),
        "ibi_std": round(float(ibi.std()), 4), "beats": [round(float(t), 3) for t in beat_t],
        "downbeat_phase": phase, "downbeat_strength": [round(s, 2) for s in strength],
        "downbeats": [round(float(t), 3) for t in downbeats], "bar_energy_db": bar_energy,
        "strong_onsets": [round(float(t), 3) for t in strong], "sections": sec_t,
        "_plot": (mono, sr, onset_env, rms, rms_t),
    }


def plot(a: dict, out: Path):
    mono, sr, onset_env, rms, rms_t = a.pop("_plot")
    fig, ax = plt.subplots(3, 1, figsize=(22, 10), sharex=True, gridspec_kw={"height_ratios": [3, 1, 1]})
    S = librosa.amplitude_to_db(np.abs(librosa.stft(mono, hop_length=HOP)), ref=np.max)
    librosa.display.specshow(S, sr=sr, hop_length=HOP, x_axis="time", y_axis="log", ax=ax[0], cmap="magma")
    ax[1].plot(rms_t, 20 * np.log10(rms + 1e-9), lw=0.8)
    ax[1].set_ylabel("RMS dB")
    ot = librosa.frames_to_time(np.arange(len(onset_env)), sr=sr, hop_length=HOP)
    ax[2].plot(ot, onset_env, lw=0.5)
    for t in a["downbeats"]:
        for x in ax:
            x.axvline(t, color="cyan", lw=0.5, alpha=0.6)
    for t in a["sections"]:
        for x in ax:
            x.axvline(t, color="lime", lw=2, alpha=0.9)
    for t in a["strong_onsets"]:
        ax[2].axvline(t, color="red", lw=0.8, alpha=0.7)
    ax[0].set_title(f"{Path(a['file']).name}: {a['tempo']} BPM, peak {a['peak']}, sections {a['sections']}")
    ax[2].set_xticks(np.arange(0, a["duration"] + 1, 2))
    fig.tight_layout()
    fig.savefig(out, dpi=80)


if __name__ == "__main__":
    import librosa.display  # noqa: F401  (registers specshow)

    for p in sys.argv[1:]:
        p = Path(p).expanduser()
        a = analyze(p)
        plot(a, p.with_suffix(".analysis.png"))
        p.with_suffix(".analysis.json").write_text(json.dumps(a, indent=1))
        print(json.dumps({k: v for k, v in a.items() if k not in ("beats", "downbeats", "strong_onsets")}, indent=1))
