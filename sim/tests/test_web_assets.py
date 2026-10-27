"""Web assets: the scene.json kinematic tree and GLB meshes reproduce MuJoCo's robot pose."""

import json
from pathlib import Path

import mujoco
import numpy as np
import pytest

from tacit_sim import scene_description
from tacit_sim.describe import robot_model
from tacit_sim.export import export_web_assets

WEB_SIM = Path(__file__).resolve().parents[2] / "web" / "public" / "sim"


def _mat(q):
    m = np.zeros(9)
    mujoco.mju_quat2Mat(m, np.asarray(q, float))
    return m.reshape(3, 3)


def _viewer_fk(desc, q9):
    """Forward kinematics exactly as scene.json documents it for the web viewer."""
    world = {}
    for b in desc["robot"]["bodies"]:
        T = np.eye(4)
        T[:3, :3] = _mat(b["quat"])
        T[:3, 3] = b["pos"]
        if b["joint"]:
            q = q9[b["joint"]["qpos_index"]]
            J = np.eye(4)
            if b["joint"]["type"] == "hinge":
                quat = np.zeros(4)
                mujoco.mju_axisAngle2Quat(quat, np.asarray(b["joint"]["axis"], float), q)
                J[:3, :3] = _mat(quat)
            else:
                J[:3, 3] = np.asarray(b["joint"]["axis"]) * q
            T = T @ J
        world[b["name"]] = (world[b["parent"]] if b["parent"] else np.eye(4)) @ T
    return world


@pytest.fixture(scope="module")
def exported(tmp_path_factory):
    return export_web_assets(tmp_path_factory.mktemp("websim"))


def test_export_is_small_and_complete(exported):
    files = exported["files"]
    assert "panda.glb" in files and "scene.json" in files
    assert sum(1 for k in files if k.startswith("panda/")) == 11
    assert exported["total_bytes"] < 15e6


def test_committed_assets_match_a_fresh_export(exported):
    out = Path(exported["out_dir"])
    assert (WEB_SIM / "scene.json").exists(), "run python -m tacit_sim.export"
    fresh = json.loads((out / "scene.json").read_text())
    committed = json.loads((WEB_SIM / "scene.json").read_text())
    assert fresh["robot"] == committed["robot"]
    for name in exported["files"]:
        assert (WEB_SIM / name).exists(), name


def test_viewer_fk_matches_mujoco():
    desc = scene_description([])
    model = robot_model()
    data = mujoco.MjData(model)
    rng = np.random.default_rng(0)
    adr = [model.jnt_qposadr[model.joint(n).id] for n in desc["robot"]["joints"]]
    for _ in range(5):
        q9 = np.array([rng.uniform(*b["joint"]["range"]) for b in desc["robot"]["bodies"] if b["joint"]])
        data.qpos[adr] = q9
        mujoco.mj_kinematics(model, data)
        for name, W in _viewer_fk(desc, q9).items():
            bid = model.body(name).id
            assert np.abs(W[:3, 3] - data.xpos[bid]).max() < 1e-4
            assert np.abs(W[:3, :3] - data.xmat[bid].reshape(3, 3)).max() < 1e-4


def test_scene_description_for_a_program(sort2):
    d = scene_description(sort2, seed=3)
    assert [o["name"] for o in d["objects"]] == ["bracket", "bolt"]
    assert {t["name"] for t in d["targets"]} == {"left bin", "right bin"}
    assert d["robot"]["joints"][:7] == [f"panda_joint{i}" for i in range(1, 8)]
    assert d["robot"]["urdf_glb"] == "/sim/panda.glb"
    assert set(d["cameras"]) == {"exterior", "wrist", "overview"}
    json.dumps(d)
