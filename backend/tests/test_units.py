"""Pure-logic tests: JSON extraction, step segmentation, practice alignment and hints, verification math."""
from __future__ import annotations

import json
from pathlib import Path

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
    assert gate.waiting() == {"live_sessions": 0, "listen": 0, "interactive": 0, "batch": 0, "busy": False}


def test_sentence_split_and_wav_concat():
    import io, wave
    from tacit.models.speech import _concat_wavs, _sentences
    assert _sentences("Step 1. Pick up the cup. Hold it by the body so it does not slip.") == \
        ["Step 1. Pick up the cup.", "Hold it by the body so it does not slip."]
    def wav(n):
        b = io.BytesIO()
        with wave.open(b, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes(b"\x01\x00" * n)
        return b.getvalue()
    out = _concat_wavs([wav(1600), wav(3200)])
    with wave.open(io.BytesIO(out)) as w:
        assert w.getnframes() == 1600 + 3200 + int(16000 * 0.12)



def test_audit_compare_marks_done_missing_and_order():
    from tacit.learn.audit import compare
    skill = {"steps": [{"index": 1, "title": "cup", "t_start": 0.0, "t_end": 2.0, "objects": ["cup"], "hand": "right"},
                       {"index": 2, "title": "bowl", "t_start": 2.0, "t_end": 4.0, "objects": ["bowl"], "hand": "right"},
                       {"index": 3, "title": "spoon", "t_start": 4.0, "t_end": 6.0, "objects": ["spoon"], "hand": "right"}]}
    frames = _frames_cup_left_to_right(60)
    run_steps = [{"t_start": 0.0, "t_end": 2.0, "objects": ["cup"], "hand": "right"},
                 {"t_start": 2.0, "t_end": 4.0, "objects": ["bowl"], "hand": "right"}]
    rep = compare(skill, frames, frames, run_steps)
    statuses = [r["status"] for r in rep["steps"]]
    assert statuses[0] == "done" and statuses[1] == "done" and statuses[2] == "missing"
    assert rep["summary"]["missing"] == 1


# --------------------------------------------------------------------------------------------------------
# Perception: steps are hand-object interactions
# --------------------------------------------------------------------------------------------------------
PERCEPTION = Path(__file__).parent / "fixtures" / "perception"


def _pose(right_wrist, left_wrist, body_x=640.0):
    """An expert facing the camera: their right shoulder and wrist on the image's left (shoulder width 160 px)."""
    lm = [[body_x, 120.0, 0.9]] + [[body_x, 200.0, 0.5]] * 32
    lm[11], lm[12] = [body_x + 80, 200.0, 0.9], [body_x - 80, 200.0, 0.9]      # left, right shoulder
    lm[15], lm[16] = [*left_wrist, 0.9], [*right_wrist, 0.9]                    # left, right wrist
    lm[23], lm[24] = [body_x + 60, 420.0, 0.9], [body_x - 60, 420.0, 0.9]
    return {"lm2d": lm, "world": [[0, 0, 0]] * 33}


def _frames_insert_three_times():
    """The right hand goes from the chest to the opening of a tall vase on the expert's right three times (2 s each,
    3 s apart); the left hand rests on a bottle all along. MediaPipe's label calls the right hand 'left'."""
    frames = []
    vase = {"label": "vase", "score": 0.95, "box": [200, 400, 300, 700]}
    bottle = {"label": "bottle", "score": 0.9, "box": [740, 420, 800, 560]}
    for i in range(160):
        t = i / 10
        phase = t % 5.0
        at_vase = 0.5 <= t < 15 and 1.0 <= phase < 3.0
        rx, ry = (250, 300) if at_vase else (600, 450)
        right = _hand("left", rx, ry)             # mislabelled on purpose
        left = _hand("right", 770, 450)
        frames.append({"t": t, "size": [1280, 720], "hands": [right, left],
                       "pose": _pose((rx, ry + 40), (770, 490)), "objects": [vase, bottle], "gaze": None})
    return frames


def test_fix_sides_follows_the_pose_wrists():
    from tacit.perception.interactions import fix_sides
    f = _frames_insert_three_times()[15]
    fixed = fix_sides(f)
    assert [h["side"] for h in fixed["hands"]] == ["right", "left"]
    assert [h["side"] for h in f["hands"]] == ["left", "right"]           # the input frame is not changed


def test_repeated_insertions_are_one_step_each():
    steps = segment_steps(_frames_insert_three_times())
    assert len(steps) == 3
    for k, s in enumerate(steps, 1):
        assert s["action"] == "insert" and s["hand"] == "right"
        assert s["object"] == "vase" and (s["repeat"], s["repeats"]) == (k, 3)
        assert "vase" in s["draft"] and "right hand" in s["draft"]
    assert all(a["t_end"] < b["t_start"] for a, b in zip(steps, steps[1:]))   # never overlapping
    assert abs(steps[0]["t_start"] - 1.0) <= 0.3 and abs(steps[0]["t_end"] - 2.9) <= 0.3


def test_live_segmenter_closes_the_same_steps():
    seg = LiveSegmenter()
    events = [e for f in _frames_insert_three_times() for e in seg.update(f)]
    steps = [e["step"] for e in events if e["type"] == "step"]
    grasps = [e for e in events if e.get("kind") == "grasp"]
    assert len(steps) == 3 and len(grasps) == 3
    assert all(s["action"] == "insert" and s["hand"] == "right" and s["objects"][0] == "vase" for s in steps)
    assert all(g["hand"] == "right" for g in grasps)        # the resting left hand never opens a step


def test_the_object_that_moves_is_the_step_object():
    """In clutter the hand touches three cups; the one it lifts is the step's object."""
    frames = []
    for i in range(80):
        t = i / 10
        lifting = 20 <= i < 50
        y = 430 - (min(i, 35) - 20) * 10 if lifting else 460      # the middle cup goes up 150 px and back down
        cups = [{"label": "cup", "score": 0.9, "box": [x - 30, 430, x + 30, 490]} for x in (560, 720)]
        cups.append({"label": "cup", "score": 0.9, "box": [610, y - 30, 670, y + 30]})
        hx, hy = (640, y) if 15 <= i < 55 else (900, 300)
        frames.append({"t": t, "size": [1280, 720], "hands": [_hand("right", hx, hy - 40)],
                       "pose": _pose((900, 300), (hx, hy)), "objects": cups, "gaze": None})
    from tacit.perception.timeline import interaction_steps
    steps = interaction_steps(frames)
    assert len(steps) >= 1
    s = max(steps, key=lambda s: s["i_end"] - s["i_start"])
    assert s["object"] == "cup in front of you" and s["hand"] == "left"
    assert s["kind"] in ("lift_return", "pick", "lift")


def test_tracker_keeps_an_object_that_is_carried_and_put_back():
    from tacit.perception.interactions import ObjectTracker
    tr = ObjectTracker(scale=160)
    ids = []
    for i in range(40):
        t = i / 10
        if i < 10 or i >= 30:                     # on the bench, then put back 20 px off
            box = [400 + (20 if i >= 30 else 0), 400, 460 + (20 if i >= 30 else 0), 460]
        elif 12 <= i < 28 and i % 4 == 0:         # carried up through the air, seen only now and then
            box = [400, 400 - (i - 10) * 15, 460, 460 - (i - 10) * 15]
        else:
            ids.append(None)
            tr.update(i, t, [], [])
            continue
        hand = np.array([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2])
        present = tr.update(i, t, [{"label": "cup", "score": 0.9, "box": box}], [hand])
        ids.append(next(trk.id for trk, _ in present if trk.boxes.get(i)))
    seen = {x for x in ids if x is not None}
    assert seen == {0}, ids


def test_walking_contacts_do_not_make_steps():
    from tacit.perception.interactions import body_scale
    from tacit.perception.timeline import walking
    frames = [{"t": i / 10, "size": [1280, 720], "hands": [], "objects": [],
               "pose": _pose((0, 0), (0, 0), body_x=300 + 12 * i)} for i in range(30)]   # 120 px/s = 0.75 widths/s
    assert walking(frames, body_scale(frames)).mean() > 0.8
    still = [{**f, "pose": _pose((0, 0), (0, 0))} for f in frames]
    assert not walking(still, body_scale(still)).any()


def _eval_module():
    import importlib.util
    path = Path(__file__).resolve().parents[1] / "tools" / "eval_steps.py"
    spec = importlib.util.spec_from_file_location("eval_steps", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_eval_matches_steps_one_to_one_by_time_overlap():
    ev = _eval_module()
    gt = [{"t": [0, 4], "hand": "right", "objects": ["black vase"]}, {"t": [10, 14], "hand": "both", "objects": ["stems"]}]
    det = [{"t_start": 1, "t_end": 5, "hand": "right", "objects": ["vase"], "draft": ""},
           {"t_start": 1.5, "t_end": 4.5, "hand": "left", "objects": [], "draft": ""},
           {"t_start": 20, "t_end": 22, "hand": "left", "objects": [], "draft": ""}]
    r = ev.score(det, gt)
    assert (r["matched"], r["precision"], r["recall"]) == (1, 0.333, 0.5)
    assert r["hand_agree"] == 1.0 and r["objects_agree"] == 1.0


@pytest.mark.parametrize("clip", ["vase", "jars"])
def test_sample_clips_meet_the_step_quality_bar(clip):
    """The merge gate of the perception card, on the real tracks of the two sample clips (compact copies)."""
    import gzip
    ev = _eval_module()
    with gzip.open(PERCEPTION / f"{clip}.tracks.json.gz", "rt") as fh:
        frames = json.load(fh)["frames"]
    gt = json.loads((PERCEPTION / "ground_truth.json").read_text())[f"smp_{clip}"]["steps"]
    r = ev.score(segment_steps(frames), gt)
    assert r["precision"] >= 0.7 and r["recall"] >= 0.7, r
    if clip == "vase":
        assert r["hand_agree"] == 1.0                  # the insertions are the expert's right hand


def test_writer_gets_the_action_target_and_repeat():
    from tacit.pipeline.writer import _timeline_summary
    steps = segment_steps(_frames_insert_three_times())
    tl = _timeline_summary({"source": {"duration": 16.0}, "qa": [], "title_hint": "Stems in a vase"}, steps, ["vase"])
    s = tl["steps"][1]
    assert s["action"] == "insert" and s["target"] == "vase" and s["repeat"] == "2 of 3" and s["hand"] == "right"


def test_normalize_program_pairs_picks_with_places():
    from tacit.robot.lab import normalize_program
    assert normalize_program([{"op": "pick", "object": "knife"}, {"op": "pick", "object": "cup"}]) == [
        {"op": "pick", "object": "knife"}, {"op": "place", "target": "tray"},
        {"op": "pick", "object": "cup"}, {"op": "place", "target": "tray"}]
    assert normalize_program([{"op": "place", "target": "bin"}, {"op": "pick", "object": "cup"},
                              {"op": "place", "target": "bowl"}, {"op": "pick", "object": "fork"}]) == [
        {"op": "pick", "object": "cup"}, {"op": "place", "target": "bowl"},
        {"op": "pick", "object": "fork"}, {"op": "place", "target": "bowl"}]


async def test_priority_gate_lets_live_frames_jump_offline_work():
    import asyncio
    from tacit.models.base import PriorityGate
    gate, order = PriorityGate(capacity=1), []

    async def call(name, prio):
        await gate.acquire(prio)
        order.append(name)
        await asyncio.sleep(0.01)
        gate.release()

    await gate.acquire(2)   # a VGGT call holds the chip
    tasks = [asyncio.create_task(call("batch", 1)), asyncio.create_task(call("vggt", 2))]
    await asyncio.sleep(0)
    tasks.append(asyncio.create_task(call("live", 0)))
    await asyncio.sleep(0)
    gate.release()
    await asyncio.gather(*tasks)
    assert order == ["live", "batch", "vggt"] and gate.snapshot() == {"inflight": 0, "waiting": 0}


def test_program_names_lose_location_words():
    from tacit.robot.lab import clean_name, normalize_program
    assert clean_name("cup in front of you") == "cup" and clean_name("vase on your right") == "vase"
    assert clean_name("the item") == "part" and clean_name("bottle beside the carafe") == "bottle"
    assert normalize_program([{"op": "pick", "object": "the item"}, {"op": "place", "target": "vase on your right"}]) == [
        {"op": "pick", "object": "part"}, {"op": "place", "target": "vase"}]



async def test_narration_waits_while_a_capture_is_open():
    import asyncio
    from tacit.models.speech import _Gate
    gate = _Gate()
    gate.session_opened()
    waiter = asyncio.create_task(gate.wait_quiet(max_wait=5))
    await asyncio.sleep(0.05)
    assert not waiter.done()          # narration holds while the expert is recording
    gate.session_closed()
    await asyncio.wait_for(waiter, 1)
