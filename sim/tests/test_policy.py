import json

import numpy as np
import pyarrow.parquet as pq

from tacit_sim import run_episode
from tacit_sim.features import ACT_DIM, CHUNK, OBS_DIM
from tacit_sim.policy import PolicyController


def test_demos_are_written(tiny_policy):
    ds = tiny_policy["demos"]
    assert ds.n == 6 and ds.frames > 0 and 0 < ds.success_rate <= 1
    z = np.load(f"{ds.path}/episodes.npz")
    assert z["obs"].shape[1] == OBS_DIM
    assert len(z["starts"]) == 6 and z["ends"][-1] == len(z["obs"])
    meta = json.loads(open(f"{ds.path}/meta.json").read())
    assert meta["instruction"].startswith("Put the bracket in the left bin")


def test_lerobot_dataset(tiny_policy):
    root = tiny_policy["demos"].lerobot_path
    info = json.loads(open(f"{root}/meta/info.json").read())
    assert info["total_episodes"] == tiny_policy["demos"].episodes_ok
    t = pq.read_table(f"{root}/data/chunk-000/episode_000000.parquet")
    for col in ("observation.state", "observation.environment_state", "action", "action.ee",
                "timestamp", "frame_index", "episode_index", "index", "task_index", "next.done"):
        assert col in t.column_names
    assert len(t["action"][0]) == 8
    assert t["next.done"][-1].as_py() is True


def test_policy_trains_on_a_tiny_set(tiny_policy):
    tr = tiny_policy["train"]
    assert [e for e, _ in tiny_policy["epochs"]] == [1, 2]
    assert [e for e, _ in tr["loss_curve"]] == [1, 2]
    assert tr["loss_curve"][1][1] < tr["loss_curve"][0][1]
    ctrl = PolicyController(tr["policy_path"])
    assert ctrl.predict(np.zeros(OBS_DIM, dtype=np.float32)).shape == (CHUNK, ACT_DIM)


def test_policy_episode_runs(sort2, tiny_policy):
    r = run_episode(sort2, "policy", 0, policy_path=tiny_policy["train"]["policy_path"], max_seconds=3)
    assert set(r) >= {"success", "steps", "reason"}
    assert r["steps"] == 90
