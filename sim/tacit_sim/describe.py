"""Scene description for the web viewer (`GET /api/robot/scene`, `web/public/sim/scene.json`).

The viewer poses the robot itself from streamed `qpos` with forward kinematics:
for each body in `robot.bodies` (parents come first), world = parent_world * T(pos, quat) and,
if the body has a joint, * R(axis, q) for a hinge or * T(axis * q) for a slide. Link meshes are
GLB files in the body's own frame. Frames are MuJoCo's: metres, z up (the viewer converts to
three.js y-up with one root rotation of -90 degrees about x). Quaternions are [w, x, y, z].
"""

from __future__ import annotations

import mujoco
import numpy as np

from .env import BIN_FLOOR, SimEnv
from .program import parse_program
from .scene import (ARM_JOINTS, CONTROL_HZ, FINGER_JOINTS, HOME_QPOS, ROBOT_BODIES, SPAWN_X,
                    SPAWN_Y, TABLE_HEIGHT, TABLE_X, TABLE_Y, build_model)

ASSET_BASE = "/sim"
FORMAT = "tacit-sim-scene/1"


def _r(v, n=5):
    return [round(float(x), n) for x in np.asarray(v).ravel()]


def robot_description(model: mujoco.MjModel) -> dict:
    bodies = []
    for name in ROBOT_BODIES:
        b = model.body(name)
        parent = model.body(model.body_parentid[b.id]).name
        entry = {
            "name": name,
            "parent": None if parent == "world" else parent,
            "pos": _r(model.body_pos[b.id]),
            "quat": _r(model.body_quat[b.id]),
            "mesh": f"{ASSET_BASE}/panda/{name}.glb",
            "joint": None,
        }
        if model.body_jntnum[b.id] > 0:
            j = model.body_jntadr[b.id]
            jt = model.jnt_type[j]
            entry["joint"] = {
                "name": model.joint(j).name,
                "type": "hinge" if jt == mujoco.mjtJoint.mjJNT_HINGE else "slide",
                "axis": _r(model.jnt_axis[j]),
                "range": _r(model.jnt_range[j]),
                "qpos_index": (ARM_JOINTS + FINGER_JOINTS).index(model.joint(j).name),
            }
        bodies.append(entry)
    return {
        "urdf_glb": f"{ASSET_BASE}/panda.glb",
        "joints": ARM_JOINTS + FINGER_JOINTS,
        "home_qpos": _r(np.concatenate([HOME_QPOS, [0.04, 0.04]])),
        "bodies": bodies,
        "source": "MuJoCo Menagerie franka_emika_panda (Apache-2.0)",
    }


def _camera(model, name):
    c = model.camera(name)
    parent = model.body(model.cam_bodyid[c.id]).name
    return {"parent": None if parent == "world" else parent, "pos": _r(model.cam_pos[c.id]),
            "quat": _r(model.cam_quat[c.id]), "fovy": float(model.cam_fovy[c.id]),
            "note": "MuJoCo camera: looks along its -z axis, +y up in the image"}


def scene_description(program=None, seed: int = 0) -> dict:
    """Everything the viewer needs to draw the Robot Lab scene for `program`.

    Object poses are the start poses for `seed` (the stream's `state` messages move them).
    """
    program = program or []
    layout = parse_program(program)
    env = SimEnv(program, seed=seed)
    model = env.model
    cx, hx = (TABLE_X[0] + TABLE_X[1]) / 2, (TABLE_X[1] - TABLE_X[0]) / 2
    cy, hy = (TABLE_Y[0] + TABLE_Y[1]) / 2, (TABLE_Y[1] - TABLE_Y[0]) / 2
    bodies = [
        {"name": "table", "shape": "box", "pos": _r([cx, cy, -0.02]), "size": _r([2 * hx, 2 * hy, 0.04]),
         "rgba": [0.62, 0.55, 0.46, 1.0], "legs_height": TABLE_HEIGHT},
        {"name": "floor", "shape": "plane", "pos": [0.0, 0.0, -TABLE_HEIGHT], "size": [6.0, 6.0]},
    ]
    targets = []
    for t in layout.targets:
        wall = 0.006
        targets.append({
            "name": t.name, "id": t.uid, "shape": "bin",
            "pos": _r([t.pos[0], t.pos[1], 0.0]),
            "inner_size": _r([2 * t.inner_half, 2 * t.inner_half]),
            "outer_size": _r([2 * (t.inner_half + wall), 2 * (t.inner_half + wall), t.wall_height]),
            "wall": wall, "floor": BIN_FLOOR, "height": t.wall_height,
            "rgba": _r(t.rgba, 3),
        })
    objects = []
    for o in layout.objects:
        s = env.object_state(o.name)
        size = ([2 * o.size[0], 2 * o.size[1], 2 * o.size[2]] if o.kind == "box"
                else [2 * o.size[0], 2 * o.size[1]])
        objects.append({
            "name": o.name, "id": o.uid, "shape": o.kind,
            "size": _r(size),       # box: [x, y, z]; cylinder: [diameter, height] (axis z)
            "rgba": _r(o.rgba, 3), "mass": o.mass,
            "pos": _r(s.pos, 4), "quat": _r(s.quat, 4),
        })
    return {
        "format": FORMAT,
        "frame": {"units": "m", "up": [0, 0, 1], "robot_base": [0, 0, 0]},
        "dt": round(1.0 / CONTROL_HZ, 6),
        "program": layout.ops,
        "tasks": [{"index": t.index, "object": t.object, "target": t.target} for t in layout.tasks],
        "ignored_ops": layout.ignored_ops,
        "bodies": bodies,
        "robot": robot_description(model),
        "objects": objects,
        "targets": targets,
        "spawn": {"x": list(SPAWN_X), "y": list(SPAWN_Y)},
        "cameras": {name: _camera(model, name) for name in ("exterior", "wrist", "overview")},
    }


def robot_model() -> mujoco.MjModel:
    model, _, _ = build_model([])
    return model
