import numpy as np

from tacit_sim.env import SimEnv
from tacit_sim.ik import gripper_yaw, top_down, wrap_period
from tacit_sim.scene import HOME_QPOS


def test_ik_reaches_top_down_targets(sort2):
    env = SimEnv(sort2)
    rng = np.random.default_rng(0)
    for _ in range(25):
        p = np.array([rng.uniform(0.32, 0.66), rng.uniform(-0.28, 0.28), rng.uniform(0.02, 0.35)])
        yaw = np.arctan2(p[1], p[0]) - np.pi / 4 + rng.uniform(-1.2, 1.2)
        q = HOME_QPOS.copy()
        for _ in range(30):
            q = env.ik.solve(q, p, top_down(yaw), iters=10)
        pos, R = env.ik.fk(q)
        assert np.linalg.norm(pos - p) < 2e-3, p
        assert abs(wrap_period(gripper_yaw(R) - yaw, np.pi)) < 0.02
        assert R[2, 2] < -0.999          # hand pointing straight down
        assert np.all(q >= env.ik.lo - 1e-9) and np.all(q <= env.ik.hi + 1e-9)


def test_servo_tracks_a_target(sort2):
    env = SimEnv(sort2, seed=0)
    goal = np.array([0.5, 0.15, 0.12])
    for _ in range(90):
        env.step_ee(goal, 0.3, 0.0)
    assert np.linalg.norm(env.tcp_pos() - goal) < 3e-3
    assert abs(wrap_period(env.gripper_yaw() - 0.3, np.pi)) < 0.03


def test_gripper_closes_and_opens(sort2):
    env = SimEnv(sort2, seed=0)
    for _ in range(30):
        env.step_ee(np.array([0.45, 0.0, 0.3]), 0.0, 1.0)
    assert env.finger_width() < 0.002
    for _ in range(30):
        env.step_ee(np.array([0.45, 0.0, 0.3]), 0.0, 0.0)
    assert env.finger_width() > 0.078
