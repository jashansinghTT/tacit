"""GR00T's DROID state conventions, checked against the model's shipped demo request."""

import mujoco
import numpy as np

from tacit_sim.droid import eef_9d, gripper_position
from tacit_sim.env import SimEnv
from tacit_sim.gr00t import droid_state, truncate_instruction

# GET /demo on changh95/GR00T-N1.7-3B-p150: request.state (DROID sample episode 1, step 40).
DEMO_JOINTS = [0.005957817658782005, 0.004599574487656355, 0.004506907891482115, -1.9568910598754883,
               0.17143909633159637, 1.5955125093460083, 0.09054799377918243]
DEMO_EEF_9D = [0.514685332775116, 0.023262452334165573, 0.44867658615112305, -0.08361628651618958,
               0.37099626660346985, -0.9248622059822083, 0.9914003014564514, 0.12472928315401077,
               -0.039598457515239716]


def test_eef_9d_reproduces_the_demo_state(sort2):
    env = SimEnv(sort2)
    m, d = env.model, env.data
    d.qpos[env.ids.arm_qpos] = DEMO_JOINTS
    mujoco.mj_kinematics(m, d)
    got = eef_9d(d.xpos[m.body("panda_hand").id], d.xmat[m.body("panda_link7").id].reshape(3, 3))
    assert np.abs(got - np.array(DEMO_EEF_9D)).max() < 1e-6


def test_droid_state_shapes(sort2):
    env = SimEnv(sort2, seed=0)
    s = droid_state(env)
    assert len(s["eef_9d"]) == 9 and len(s["gripper_position"]) == 1 and len(s["joint_position"]) == 7
    assert s["gripper_position"][0] < 1e-6           # open at reset
    assert gripper_position(0.0) == 1.0


def test_instruction_is_bounded():
    assert len(truncate_instruction("word " * 100).split()) == 30
