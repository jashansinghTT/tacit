import pytest

from tacit_sim import run_episode


@pytest.mark.parametrize("seed", [0, 1, 2, 3, 4])
def test_scripted_sort2_succeeds(sort2, seed):
    r = run_episode(sort2, "scripted", seed)
    assert r["success"], r
    assert r["reason"] is None
    assert r["tasks_done"] == 2


def test_scripted_shared_bin_and_mixed_shapes():
    program = [
        {"op": "pick", "object": "scissors"}, {"op": "place", "target": "kit tray"},
        {"op": "pick", "object": "bottle"}, {"op": "place", "target": "kit tray"},
        {"op": "pick", "object": "cup"}, {"op": "place", "target": "left bin"},
    ]
    results = [run_episode(program, "scripted", s) for s in range(3)]
    assert all(r["success"] for r in results), results


def test_failure_has_a_reason(sort2):
    r = run_episode(sort2, "scripted", 0, max_seconds=2.0)
    assert not r["success"]
    assert r["reason"].startswith("timed out during pick")
