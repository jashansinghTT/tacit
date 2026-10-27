"""GR00T N1.7 in the loop on chip 3. Runs only with TACIT_LIVE=1 and the model serving."""

import os

import pytest

from tacit_sim import Runner

pytestmark = pytest.mark.gr00t
live = pytest.mark.skipif(os.environ.get("TACIT_LIVE") != "1", reason="set TACIT_LIVE=1 with GR00T serving")


@live
def test_gr00t_closed_loop_streams(sort2):
    msgs = list(Runner(sort2, "gr00t", seed=0, max_seconds=4).frames(realtime=False))
    kinds = {m["type"] for m in msgs}
    assert kinds == {"meta", "state", "camera", "gr00t", "done"}
    calls = [m for m in msgs if m["type"] == "gr00t"]
    assert len(calls) >= 7 and all(c["ms"] > 0 for c in calls)
    cams = [m for m in msgs if m["type"] == "camera"]
    assert {c["name"] for c in cams} == {"exterior", "wrist"}
    done = msgs[-1]
    assert done["type"] == "done" and done["gr00t"]["calls"] == len(calls)
    # GR00T moved the arm.
    states = [m for m in msgs if m["type"] == "state"]
    q0, q1 = states[0]["qpos"], states[-1]["qpos"]
    assert max(abs(a - b) for a, b in zip(q0, q1)) > 0.01
