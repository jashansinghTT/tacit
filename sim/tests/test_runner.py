"""The runner yields the WS /ws/robot/{run_id} messages documented in docs/API.md."""

import threading

import numpy as np
import pytest

from tacit_sim import Runner, retarget_wrist_path


def _check_state(msg, objects):
    assert set(msg) >= {"type", "t", "qpos", "objects", "ee", "gripper", "phase"}
    assert len(msg["qpos"]) == 9 and len(msg["ee"]) == 3
    assert 0.0 <= msg["gripper"] <= 0.0401
    assert [o["name"] for o in msg["objects"]] == objects
    for o in msg["objects"]:
        assert len(o["pos"]) == 3 and len(o["quat"]) == 4


def test_scripted_stream_messages(sort2):
    msgs = list(Runner(sort2, "scripted", seed=2).frames(realtime=False))
    meta, states, done = msgs[0], [m for m in msgs if m["type"] == "state"], msgs[-1]
    assert meta["type"] == "meta"
    assert meta["joints"][0] == "panda_joint1" and len(meta["joints"]) == 9
    assert meta["objects"] == ["bracket", "bolt"]
    assert abs(meta["dt"] - 1 / 30) < 1e-6
    assert {m["type"] for m in msgs} == {"meta", "state", "done"}
    for s in states[::50]:
        _check_state(s, ["bracket", "bolt"])
    ts = [s["t"] for s in states]
    assert np.allclose(np.diff(ts), 1 / 30, atol=1e-3)
    phases = [s["phase"] for s in states]
    assert phases[0] == "pick bracket" and "place left bin" in phases and phases[-1] == "done"
    assert done["type"] == "done" and done["success"] is True and done["reason"] is None


def test_realtime_pacing(sort2):
    import time

    gen = Runner(sort2, "scripted", seed=0).frames(realtime=True)
    t0 = time.perf_counter()
    n = 0
    for msg in gen:
        n += msg["type"] == "state"
        if n == 31:
            break
    gen.close()
    assert 0.85 < time.perf_counter() - t0 < 1.6     # 30 steps at 30 Hz


def test_frames_can_be_consumed_from_other_threads(sort2):
    gen = Runner(sort2, "scripted", seed=0, max_seconds=1).frames(realtime=False)
    got = []

    def pull():
        got.append(next(gen))

    for _ in range(5):
        th = threading.Thread(target=pull)
        th.start()
        th.join()
    assert got[0]["type"] == "meta" and all(m["type"] == "state" for m in got[1:])
    gen.close()


def test_replay_follows_the_human_path(sort2):
    t = np.linspace(0, 4, 41)
    # A wrist sweeping left to right over a table 0.6 m in front of a camera, lifting midway.
    cam = np.stack([0.25 * np.sin(t / 4 * np.pi) - 0.1, 0.3 - 0.06 * np.sin(t / 2 * np.pi) ** 2,
                    0.6 + 0.1 * t / 4], axis=1)
    path = retarget_wrist_path(cam, t)
    msgs = list(Runner(sort2, "replay", seed=0, human_path=path).frames(realtime=False))
    human = msgs[0]["human"]
    assert human["points"] == path["points"] and human["transform"]["matrix"] == path["transform"]["matrix"]
    phases = [m["phase"] for m in msgs if m["type"] == "state"]
    assert phases[0] == "approach" and phases[-1] == "replay"
    done = msgs[-1]
    assert done["type"] == "done" and done["success"], done
    assert done["tracking_error_m"] < 0.02


def test_bad_modes(sort2):
    with pytest.raises(ValueError):
        Runner(sort2, "teleport")
    with pytest.raises(ValueError):
        Runner(sort2, "policy")
    with pytest.raises(ValueError):
        Runner(sort2, "replay")
