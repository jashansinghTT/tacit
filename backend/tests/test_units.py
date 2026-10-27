"""Pure-logic tests: JSON extraction, step segmentation, practice alignment and hints, verification math."""
from __future__ import annotations

import json

import numpy as np
import pytest

from tacit.learn.practice import hint, subsequence_dtw
from tacit.models.llm import extract_json
from tacit.perception.timeline import LiveSegmenter, carried_intervals, segment_steps
from tacit.pipeline import geometry


def test_extract_json_tolerates_fences_and_prose():
    assert extract_json('Sure!\n```json\n{"a": [1, 2]}\n```\nDone') == {"a": [1, 2]}
    assert extract_json('Here: {"t": "a } inside", "n": {"x": 1}} trailing') == {"t": "a } inside", "n": {"x": 1}}
    with pytest.raises(ValueError):
        extract_json("no json here")


def _hand(side, x, y, closed=False):
    # 21 landmarks around (x, y): wrist at the bottom, fingertips spread (open) or tucked (closed).
    lm = [[x, y + 40]]
    reach = 20 if closed else 70
    for k in range(20):
        finger = k // 4
        lm.append([x - 30 + finger * 15, y + 40 - (k % 4 + 1) * reach / 4])
    lm[9] = [x, y]  # middle MCP sets the palm size
    return {"side": side, "score": 0.95, "bbox": [x - 60, y - 60, x + 60, y + 80], "lm2d": lm, "world": [[0, 0, 0]] * 21}


def _frames_cup_left_to_right(n=60):
    frames = []
    for i in range(n):
        t = i / 10
        if i < 15:
            cup_x, hand_x = 300, 700
        elif i < 45:  # carried from x=300 to x=900
            cup_x = 300 + (i - 15) * 20
            hand_x = cup_x
        else:
            cup_x, hand_x = 900, 700
        frames.append({"t": t, "size": [1280, 720],
                       "hands": [_hand("right", hand_x, 420, closed=15 <= i < 45)],
                       "objects": [{"label": "cup", "score": 0.9, "box": [cup_x - 40, 380, cup_x + 40, 460]},
                                   {"label": "bowl", "score": 0.9, "box": [860, 400, 1000, 480]}],
                       "gaze": {"x": cup_x, "y": 420, "target": "cup"}})
    return frames


def test_carried_object_becomes_a_step():
    frames = _frames_cup_left_to_right()
    carried = carried_intervals(frames)
    assert carried and carried[0]["label"] == "cup"
    assert carried[0]["target"] == "bowl"
    steps = segment_steps(frames)
    assert len(steps) >= 1
    assert any("cup" in s["objects"] for s in steps)


def test_segment_steps_falls_back_to_thirds_without_signal():
    frames = [{"t": i / 10, "size": [1280, 720], "hands": [], "objects": []} for i in range(60)]
    steps = segment_steps(frames)
    assert len(steps) == 3
    assert steps[0]["t_start"] == 0.0


def test_live_segmenter_emits_grasp_release_and_step():
    seg = LiveSegmenter()
    events = []
    for f in _frames_cup_left_to_right(80):
        events += seg.update(f)
    kinds = [e.get("kind") for e in events if e["type"] == "event"]
    assert "grasp" in kinds and "release" in kinds
    assert any(e["type"] == "step" for e in events)


def test_subsequence_dtw_finds_the_matching_phase():
    ref = np.stack([np.array([i / 10, 0, 1, 0.5], dtype=np.float32) for i in range(20)])
    cost, j = subsequence_dtw(ref, ref[5:12])
    assert cost < 1e-5 and j == 11
    far, _ = subsequence_dtw(ref, ref[5:12] + 3)
    assert far > 1.0


def test_hints_speak_in_the_trainees_frame():
    expert = {"side": "right", "x": 0.0, "y": 0.5, "closure": 1.2, "pinch": 0.3, "object": "cup"}
    step = {"hand": "right", "tips": []}
    assert hint({**expert, "side": "left"}, expert, step) == "Use your right hand for this step."
    assert "your right" in hint({**expert, "x": 0.8}, expert, step)   # image +x is the trainee's own left
    assert "your left" in hint({**expert, "x": -0.8}, expert, step)
    assert hint({**expert, "closure": 1.9}, expert, step).startswith("Close your grip")


def _fake_vggt(S=4, drift=0.0, noise=0.0, seed=0):
    rng = np.random.default_rng(seed)
    pp = {"orig_w": 1280, "orig_h": 720, "resized_w": 518, "resized_h": 291, "scale_x": 518 / 1280, "scale_y": 291 / 720,
          "pad_left": 0, "pad_top": 113}
    f = 500.0
    K = np.array([[f, 0, 259], [0, f, 259], [0, 0, 1]], dtype=np.float32)
    v, u = np.mgrid[0:518, 0:518].astype(np.float32)
    depth0 = 2.0 + 0.5 * (v / 518)
    pts = np.stack([(u - 259) * depth0 / f, (v - 259) * depth0 / f, depth0], axis=-1)
    depth, wp, ext = [], [], []
    for i in range(S):
        t = np.array([drift * i, 0, 0], dtype=np.float32)
        ext.append(np.concatenate([np.eye(3, dtype=np.float32), t[:, None]], axis=1))
        Pc = pts + t
        d = Pc[..., 2] * (1 + noise * rng.standard_normal(Pc[..., 2].shape) * (i > 0))
        depth.append(d)
        wp.append(pts)
    return {"depth": np.stack(depth).astype(np.float32), "depth_conf": np.ones((S, 518, 518), np.float32),
            "world_points": np.stack(wp).astype(np.float32), "world_points_conf": np.ones((S, 518, 518), np.float32),
            "extrinsic": np.stack(ext), "intrinsic": np.stack([K] * S), "preprocess": {"per_view": [pp] * S}}


def test_consistency_separates_rigid_from_drifting_scenes():
    times = [1.0, 2.0, 3.0, 4.0]
    real = geometry.consistency(_fake_vggt(), [], times)
    fake = geometry.consistency(_fake_vggt(noise=0.25, seed=3), [], times)
    assert real["score"] > 0.9 and geometry.verdict(real["score"]) == "verified"
    assert fake["score"] < real["score"] and geometry.verdict(fake["score"]) == "suspect"
    json.dumps(real)


def test_reflex_curls_open_vs_fist_and_movement_file():
    from tacit import reflex
    # A straight hand: every finger's points on a line from the wrist.
    straight = [[0.0, 0.0, 0.0]]
    for k in range(5):
        d = np.array([0.3 * (k - 2), 1.0, 0.0]) / np.linalg.norm([0.3 * (k - 2), 1.0, 0.0])
        for j in range(1, 5):
            straight.append((0.03 * j * d).tolist())
    c_open = reflex.curls(straight)
    assert max(c_open) == 0.0
    # Curl every finger: each bone turns 75 degrees from the last one.
    bent = [[0.0, 0.0, 0.0]]
    for k in range(5):
        p, ang = np.zeros(3), 0.0
        for j in range(1, 5):
            p = p + 0.03 * np.array([0.0, np.cos(ang), -np.sin(ang)])
            bent.append((p + [0.02 * (k - 2), 0, 0]).tolist())
            ang += np.deg2rad(75)
    c_fist = reflex.curls(bent)
    assert all(v > 0.5 for v in c_fist[1:])
    track = {"frames": [[0.0, *c_open], [0.5, *c_fist], [1.0, *c_fist], [1.5, *c_open]], "hand": "right"}
    steps = reflex.movement_steps(track)
    assert steps[-1]["pose"] == [0.15] * 5 and all(max(s["pose"]) <= reflex.GUIDE_MAX for s in steps)
    src = reflex.movement_file("Sort the cup", "test", steps)
    ns: dict = {}
    exec(compile(src, "movement.py", "exec"), ns)  # the generated module must be valid Reflex input
    assert ns["TITLE"] == "Sort the cup" and len(ns["steps"]()) == len(steps)
    assert reflex.movement_name("sk_ab12cd", 2) == "tacit_sk_ab12cd_step2"


def test_merge_groups_follows_covers_and_falls_back():
    from tacit.pipeline.process import merge_groups
    obs = [{"index": i, "t_start": float(i), "t_end": i + 0.8} for i in range(1, 6)]
    written = [{"index": 1, "covers": [1, 2], "title": "A"}, {"index": 2, "covers": [3], "title": "B"},
               {"index": 3, "covers": [5], "title": "C"}]
    groups = merge_groups(written, obs)
    assert [w["title"] for w, _ in groups] == ["A", "B", "C"]
    assert [[s["index"] for s in g] for _, g in groups] == [[1, 2], [3, 4], [5]]   # 4 joins the nearest earlier group
    fallback = merge_groups([{"index": 1, "title": "A"}], obs)
    assert len(fallback) == 5 and fallback[0][0]["title"] == "A" and fallback[1][0] == {}


async def test_tts_gate_serves_interactive_before_batch():
    import asyncio
    from tacit.models.speech import _Gate
    gate, order = _Gate(), []

    async def use(name, prio, hold=0.02):
        await gate.acquire(prio)
        order.append(name)
        await asyncio.sleep(hold)
        gate.release()

    await gate.acquire(gate.BATCH)          # a narration line holds the voice
    tasks = [asyncio.create_task(use("batch-2", gate.BATCH)), asyncio.create_task(use("batch-3", gate.BATCH))]
    await asyncio.sleep(0)
    tasks.append(asyncio.create_task(use("coach", gate.INTERACTIVE)))
    await asyncio.sleep(0)
    gate.release()
    await asyncio.gather(*tasks)
    assert order == ["coach", "batch-2", "batch-3"]
    assert gate.waiting() == {"interactive": 0, "batch": 0, "busy": False}
