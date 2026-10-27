import mujoco
import numpy as np
import pytest

from tacit_sim.env import SimEnv
from tacit_sim.program import object_primitive, parse_program
from tacit_sim.scene import ARM_JOINTS, FINGER_JOINTS, HOME_QPOS, build_model


def test_sort2_scene_loads(sort2):
    model, layout, ids = build_model(sort2)
    assert [model.joint(n).name for n in ARM_JOINTS + FINGER_JOINTS] == ARM_JOINTS + FINGER_JOINTS
    assert model.nu == 8
    assert {o.name for o in layout.objects} == {"bracket", "bolt"}
    assert {t.name for t in layout.targets} == {"left bin", "right bin"}
    # The robot's left is +y: "left bin" sits at positive y.
    assert layout.target("left bin").pos[1] > 0 > layout.target("right bin").pos[1]
    for cam in ("exterior", "wrist", "overview"):
        model.camera(cam)


def test_objects_rest_on_the_table(sort2):
    env = SimEnv(sort2, seed=1)
    for _ in range(30):
        env.step_joints(HOME_QPOS, 0.0)
    for o in env.layout.objects:
        s = env.object_state(o.name)
        assert s.upright
        assert abs(s.pos[2] - o.half_height) < 0.003
        assert np.linalg.norm(env.object_velocity(o.name)) < 0.01


def test_spawn_is_randomised_and_reproducible(sort2):
    a, b = SimEnv(sort2, seed=5), SimEnv(sort2, seed=5)
    c = SimEnv(sort2, seed=6)
    pa = a.object_state("bracket").pos
    assert np.allclose(pa, b.object_state("bracket").pos)
    assert not np.allclose(pa, c.object_state("bracket").pos)


def test_program_parsing_is_tolerant():
    layout = parse_program([
        {"op": "inspect", "object": "gauge"},
        {"op": "pick", "object": "Cup"},
        {"op": "pick", "object": "scissors"},
        {"op": "place", "target": "right bin"},
        {"op": "place", "target": "orphan"},
    ])
    assert [(t.object, t.target) for t in layout.tasks] == [("Cup", None), ("scissors", "right bin")]
    assert [o["op"] for o in layout.ignored_ops] == ["inspect", "place"]
    assert layout.object("Cup").kind == "cylinder"
    assert object_primitive("scissors")[0] == "box"
    # Slim parts are grasped across their short side, which must fit the 8 cm gripper.
    assert all(2 * o.grasp_half_width < 0.06 for o in layout.objects)


def test_program_limits():
    too_many = [x for i in range(7) for x in ({"op": "pick", "object": f"p{i}"}, {"op": "place", "target": "bin"})]
    with pytest.raises(ValueError):
        parse_program(too_many)


def test_empty_program_builds():
    model, layout, _ = build_model([])
    assert not layout.objects and not layout.targets
    mujoco.mj_step(model, mujoco.MjData(model))
