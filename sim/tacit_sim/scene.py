"""MuJoCo scene: the Menagerie Franka Panda on a table, with program objects and target bins.

World frame (MuJoCo): metres, z up, the robot base at the origin on the table top (z = 0),
the robot facing +x. Bins sit along the table's far edge (x = BIN_X); objects spawn between the
robot and the bins.
"""

from __future__ import annotations

import logging
import math
import os
from dataclasses import dataclass
from pathlib import Path

import mujoco
import numpy as np

# MuJoCo prints solver warnings (rare "linesearch objective is not convex" on hard contacts) to
# stdout and appends them to MUJOCO_LOG.TXT in the working directory. Route them to logging.
_log = logging.getLogger("tacit_sim.mujoco")
mujoco.set_mju_user_warning(lambda msg: _log.debug("mujoco: %s", msg.strip()))

from .program import BIN_X, Layout, parse_program

PKG_DIR = Path(__file__).resolve().parent
PANDA_DIR = Path(os.environ.get(
    "TACIT_SIM_PANDA_DIR",
    PKG_DIR.parent / "third_party" / "mujoco_menagerie" / "franka_emika_panda"))
PANDA_XML = PANDA_DIR / "panda.xml"

PREFIX = "panda_"
ARM_JOINTS = [f"{PREFIX}joint{i}" for i in range(1, 8)]
FINGER_JOINTS = [f"{PREFIX}finger_joint1", f"{PREFIX}finger_joint2"]
ROBOT_BODIES = [f"{PREFIX}link{i}" for i in range(8)] + [
    f"{PREFIX}hand", f"{PREFIX}left_finger", f"{PREFIX}right_finger"]

# 30 Hz control (the stream rate), 16 physics substeps per control step.
CONTROL_HZ = 30
SUBSTEPS = 16
TIMESTEP = 1.0 / (CONTROL_HZ * SUBSTEPS)

# Arm posture the robot starts from and returns to (TCP about 0.42 m above the table).
HOME_QPOS = np.array([0.0, -0.35, 0.0, -2.35, 0.0, 2.0, 0.785])
FINGER_OPEN = 0.04       # per finger joint; full opening 8 cm
TCP_OFFSET = 0.1034      # hand frame origin to the centre between the fingertip pads

TABLE_X = (-0.25, 0.78)
TABLE_Y = (-0.62, 0.62)
TABLE_HEIGHT = 0.76      # floor is at z = -TABLE_HEIGHT

# Region objects are spawned in (centres).
SPAWN_X = (0.32, 0.50)
SPAWN_Y = (-0.24, 0.24)

# Gripper: Menagerie's actuator8 is a position servo on the finger tendon with kp = 100 (about
# 2 N of squeeze on a 4 cm part). kp = 600 gives about 12 N on the tendon: parts survive fast
# moves, and soft contacts do not let the fingers sink into them (a deep pad penetration traps a
# cylinder on one finger after the gripper opens).
GRIPPER_KP = 600.0
GRIPPER_KV = 40.0

OBJECT_FRICTION = (1.2, 0.01, 0.0005)
PAD_FRICTION = (1.5, 0.02, 0.0005)
# Stiff, hard contacts between the finger pads and parts (timeconst >= 2 physics steps).
CONTACT_SOLREF = (0.005, 1.0)
CONTACT_SOLIMP = (0.95, 0.99, 0.001, 0.5, 2.0)


@dataclass
class SceneIds:
    """Index lookups into a compiled model, built once per scene."""

    arm_qpos: np.ndarray          # qpos addresses of the 7 arm joints
    arm_dof: np.ndarray           # dof addresses of the 7 arm joints
    finger_qpos: np.ndarray       # qpos addresses of the 2 finger joints
    arm_act: np.ndarray           # actuator ids 0..6
    grip_act: int
    tcp_site: int
    hand_body: int
    left_finger_body: int
    right_finger_body: int
    finger_geoms: dict            # "left"/"right" -> set of geom ids
    object_body: dict             # object name -> body id
    object_qpos: dict             # object name -> qpos address of its free joint
    object_geoms: dict            # object name -> set of geom ids
    target_body: dict             # target name -> body id
    robot_geoms: set
    table_geom: int


def _load_panda() -> mujoco.MjSpec:
    child = mujoco.MjSpec.from_file(str(PANDA_XML))
    for key in list(child.keys):
        child.delete(key)
    # The Menagerie light tracks the robot; the scene lights itself.
    for light in list(child.lights):
        child.delete(light)
    return child


def _add_box(body, name, size, pos, rgba, **kw):
    g = body.add_geom()
    g.name = name
    g.type = mujoco.mjtGeom.mjGEOM_BOX
    g.size = list(size)
    g.pos = list(pos)
    g.rgba = list(rgba)
    for k, v in kw.items():
        setattr(g, k, v)
    return g


def build_spec(layout: Layout) -> mujoco.MjSpec:
    spec = mujoco.MjSpec()
    spec.modelname = "tacit_robot_lab"
    spec.compiler.autolimits = True
    spec.option.integrator = mujoco.mjtIntegrator.mjINT_IMPLICITFAST
    # Attaching with a prefix renames the Panda's bodies, joints, actuators, tendon and equality
    # consistently (panda_joint1 ... as in docs/API.md).
    spec.worldbody.add_frame().attach_body(_load_panda().body("link0"), PREFIX, "")
    spec.option.timestep = TIMESTEP
    spec.option.cone = mujoco.mjtCone.mjCONE_ELLIPTIC
    spec.option.impratio = 10.0
    spec.option.noslip_iterations = 2
    spec.visual.global_.offwidth = 1280
    spec.visual.global_.offheight = 720
    spec.visual.headlight.ambient = [0.35, 0.35, 0.35]
    spec.visual.headlight.diffuse = [0.40, 0.40, 0.40]
    spec.visual.headlight.specular = [0.0, 0.0, 0.0]
    spec.visual.quality.shadowsize = 2048

    # Gravity compensation (the real Panda's controller does this) so the joint servos track
    # IK targets without a gravity sag.
    for name in ROBOT_BODIES:
        spec.body(name).gravcomp = 1.0

    grip = spec.actuator(f"{PREFIX}actuator8")
    grip.gainprm = [GRIPPER_KP * 0.04 / 255.0] + [0.0] * 9
    grip.biasprm = [0.0, -GRIPPER_KP, -GRIPPER_KV] + [0.0] * 7
    grip.forcerange = [-120.0, 120.0]

    hand = spec.body(f"{PREFIX}hand")
    tcp = hand.add_site()
    tcp.name = "tcp"
    tcp.pos = [0.0, 0.0, TCP_OFFSET]
    tcp.size = [0.004, 0.004, 0.004]
    tcp.rgba = [1.0, 0.2, 0.2, 0.0]

    for side in ("left", "right"):
        for g in spec.body(f"{PREFIX}{side}_finger").geoms:
            g.solref = list(CONTACT_SOLREF)
            g.solimp = list(CONTACT_SOLIMP)
            if g.type != mujoco.mjtGeom.mjGEOM_BOX:
                continue
            if g.size[0] < 0.005:
                # The four small ridge boxes stand 1.5 mm proud of the main pad. Pressed into a
                # curved part they lock it between them (the collider resolves the overlap
                # sideways), so the part stays stuck to the finger after the gripper opens.
                # The flat main pad and the finger mesh do the gripping instead.
                g.contype = 0
                g.conaffinity = 0
            else:
                g.friction = list(PAD_FRICTION)

    # Wrist camera, DROID style: on the hand, behind the fingers, looking down past them.
    # MuJoCo cameras look along their -z axis with +y up in the image.
    wrist = hand.add_camera()
    wrist.name = "wrist"
    wrist.fovy = 80.0
    _look(wrist, eye=np.array([0.075, 0.0, 0.045]), target=np.array([-0.02, 0.0, 0.18]),
          up=np.array([1.0, 0.0, 0.0]))

    sky = spec.add_texture()
    sky.name = "sky"
    sky.type = mujoco.mjtTexture.mjTEXTURE_SKYBOX
    sky.builtin = mujoco.mjtBuiltin.mjBUILTIN_GRADIENT
    sky.rgb1 = [0.78, 0.80, 0.82]
    sky.rgb2 = [0.45, 0.47, 0.50]
    sky.width = 64
    sky.height = 384

    world = spec.worldbody
    sun = world.add_light()
    sun.name = "sun"
    sun.pos = [0.4, -0.6, 2.2]
    sun.dir = list(_unit(np.array([-0.1, 0.25, -1.0])))
    sun.type = mujoco.mjtLightType.mjLIGHT_DIRECTIONAL
    sun.castshadow = True
    sun.diffuse = [0.6, 0.6, 0.6]
    sun.specular = [0.15, 0.15, 0.15]
    fill = world.add_light()
    fill.name = "fill"
    fill.pos = [1.5, 1.0, 1.5]
    fill.dir = list(_unit(np.array([-1.0, -0.7, -0.8])))
    fill.type = mujoco.mjtLightType.mjLIGHT_DIRECTIONAL
    fill.castshadow = False
    fill.diffuse = [0.25, 0.25, 0.27]

    floor = world.add_geom()
    floor.name = "floor"
    floor.type = mujoco.mjtGeom.mjGEOM_PLANE
    floor.size = [3.0, 3.0, 0.05]
    floor.pos = [0.0, 0.0, -TABLE_HEIGHT]
    floor.rgba = [0.42, 0.43, 0.45, 1.0]

    cx, hx = (TABLE_X[0] + TABLE_X[1]) / 2, (TABLE_X[1] - TABLE_X[0]) / 2
    cy, hy = (TABLE_Y[0] + TABLE_Y[1]) / 2, (TABLE_Y[1] - TABLE_Y[0]) / 2
    table = world.add_body()
    table.name = "table"
    _add_box(table, "table_top", (hx, hy, 0.02), (cx, cy, -0.02), (0.62, 0.55, 0.46, 1.0),
             friction=[1.0, 0.005, 0.0001])
    for i, (sx, sy) in enumerate([(-1, -1), (-1, 1), (1, -1), (1, 1)]):
        _add_box(table, f"table_leg{i}", (0.025, 0.025, (TABLE_HEIGHT - 0.04) / 2),
                 (cx + sx * (hx - 0.05), cy + sy * (hy - 0.05), -0.04 - (TABLE_HEIGHT - 0.04) / 2),
                 (0.30, 0.30, 0.32, 1.0), contype=0, conaffinity=0)

    for t in layout.targets:
        b = world.add_body()
        b.name = t.uid
        b.pos = [t.pos[0], t.pos[1], 0.0]
        wall, h, r = 0.006, t.wall_height, t.inner_half
        _add_box(b, f"{t.uid}_floor", (r + wall, r + wall, 0.004), (0, 0, 0.004), t.rgba)
        for i, (px, py, sx, sy) in enumerate([(r + wall / 2, 0, wall / 2, r + wall),
                                              (-r - wall / 2, 0, wall / 2, r + wall),
                                              (0, r + wall / 2, r, wall / 2),
                                              (0, -r - wall / 2, r, wall / 2)]):
            _add_box(b, f"{t.uid}_wall{i}", (sx, sy, h / 2), (px, py, h / 2), t.rgba)
        site = b.add_site()
        site.name = f"{t.uid}_centre"
        site.pos = [0, 0, 0.008]
        site.size = [0.005, 0.005, 0.005]
        site.rgba = [0, 0, 0, 0]

    for i, o in enumerate(layout.objects):
        b = world.add_body()
        b.name = o.uid
        # Parked off to the side until reset() places it.
        b.pos = [0.4, -0.9 - 0.1 * i, o.half_height]
        fj = b.add_freejoint()
        fj.name = f"{o.uid}_free"
        g = b.add_geom()
        g.name = f"{o.uid}_geom"
        if o.kind == "box":
            g.type = mujoco.mjtGeom.mjGEOM_BOX
            g.size = list(o.size)
        else:
            g.type = mujoco.mjtGeom.mjGEOM_CYLINDER
            g.size = [o.size[0], o.size[1], 0.0]
        g.rgba = list(o.rgba)
        g.mass = o.mass
        g.friction = list(OBJECT_FRICTION)
        g.condim = 4
        g.solref = list(CONTACT_SOLREF)
        g.solimp = list(CONTACT_SOLIMP)

    # Exterior camera, DROID style: on the robot's left, at shoulder height, looking across the
    # workspace (robot, objects and bins all in view).
    ext = world.add_camera()
    ext.name = "exterior"
    ext.fovy = 62.0
    _look(ext, eye=np.array([0.30, 0.66, 0.46]), target=np.array([0.48, -0.02, 0.04]))
    # Three-quarter overview for evidence videos and thumbnails.
    ov = world.add_camera()
    ov.name = "overview"
    ov.fovy = 45.0
    _look(ov, eye=np.array([1.55, -0.95, 0.85]), target=np.array([0.38, 0.0, 0.12]))
    return spec


def _unit(v: np.ndarray) -> np.ndarray:
    return v / np.linalg.norm(v)


def _look(cam, eye: np.ndarray, target: np.ndarray, up: np.ndarray | None = None) -> None:
    """Point a camera from `eye` at `target` (both in the camera's parent frame)."""
    up = np.array([0.0, 0.0, 1.0]) if up is None else up
    back = _unit(eye - target)            # camera +z points away from what it looks at
    right = _unit(np.cross(up, back))
    cam_up = np.cross(back, right)
    cam.pos = list(eye)
    cam.alt.type = mujoco.mjtOrientation.mjORIENTATION_XYAXES
    cam.alt.xyaxes = list(right) + list(cam_up)


def build_model(program_or_layout) -> tuple[mujoco.MjModel, Layout, SceneIds]:
    layout = program_or_layout if isinstance(program_or_layout, Layout) else parse_program(program_or_layout)
    spec = build_spec(layout)
    model = spec.compile()
    return model, layout, scene_ids(model, layout)


def scene_ids(model: mujoco.MjModel, layout: Layout) -> SceneIds:
    def jq(name):
        return model.jnt_qposadr[model.joint(name).id]

    def jd(name):
        return model.jnt_dofadr[model.joint(name).id]

    def geoms_of(body_id):
        return {g for g in range(model.ngeom) if model.geom_bodyid[g] == body_id}

    lf, rf = model.body(f"{PREFIX}left_finger").id, model.body(f"{PREFIX}right_finger").id
    robot_body_ids = {model.body(n).id for n in ROBOT_BODIES}
    return SceneIds(
        arm_qpos=np.array([jq(n) for n in ARM_JOINTS]),
        arm_dof=np.array([jd(n) for n in ARM_JOINTS]),
        finger_qpos=np.array([jq(n) for n in FINGER_JOINTS]),
        arm_act=np.array([model.actuator(f"{PREFIX}actuator{i}").id for i in range(1, 8)]),
        grip_act=model.actuator(f"{PREFIX}actuator8").id,
        tcp_site=model.site("tcp").id,
        hand_body=model.body(f"{PREFIX}hand").id,
        left_finger_body=lf,
        right_finger_body=rf,
        finger_geoms={"left": geoms_of(lf), "right": geoms_of(rf)},
        object_body={o.name: model.body(o.uid).id for o in layout.objects},
        object_qpos={o.name: model.jnt_qposadr[model.joint(f"{o.uid}_free").id] for o in layout.objects},
        object_geoms={o.name: geoms_of(model.body(o.uid).id) for o in layout.objects},
        target_body={t.name: model.body(t.uid).id for t in layout.targets},
        robot_geoms={g for g in range(model.ngeom) if model.geom_bodyid[g] in robot_body_ids},
        table_geom=model.geom("table_top").id,
    )


def yaw_to_quat(yaw: float) -> np.ndarray:
    return np.array([math.cos(yaw / 2), 0.0, 0.0, math.sin(yaw / 2)])


__all__ = ["build_model", "build_spec", "scene_ids", "SceneIds", "HOME_QPOS", "CONTROL_HZ",
           "SUBSTEPS", "TIMESTEP", "BIN_X", "SPAWN_X", "SPAWN_Y", "FINGER_OPEN", "TCP_OFFSET"]
