"""Export the Panda and the scene description for the web viewer (`web/public/sim/`).

    python -m tacit_sim.export [out_dir]          (default: <repo>/web/public/sim)

Writes:
- `panda/<body>.glb`: each link's visual meshes in the body's own frame (MuJoCo axes, z up),
  coloured with the Menagerie materials.
- `panda.glb`: the whole arm in its zero pose as one node tree; every node is named after its
  body (`panda_link0` ... `panda_right_finger`) and carries the body's local transform, so a
  viewer can also pose it by setting node rotations.
- `scene.json`: `scene_description()` for the example program (kinematic tree, table, bins,
  objects, cameras). The runtime equivalent is `tacit_sim.scene_description(program)`.

Needs trimesh (`uv pip install -e 'sim[export]'`).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import mujoco
import numpy as np

from .describe import robot_model, scene_description
from .scene import PKG_DIR, ROBOT_BODIES

DEFAULT_OUT = PKG_DIR.parent.parent / "web" / "public" / "sim"
EXAMPLE = PKG_DIR.parent / "examples" / "sort2.json"


def _quat_mat(q) -> np.ndarray:
    m = np.zeros(9)
    mujoco.mju_quat2Mat(m, np.asarray(q, dtype=float))
    return m.reshape(3, 3)


def _tf(pos, quat) -> np.ndarray:
    T = np.eye(4)
    T[:3, :3] = _quat_mat(quat)
    T[:3, 3] = pos
    return T


def body_meshes(model: mujoco.MjModel, body: str):
    """The body's visual geoms as trimesh meshes in the body frame."""
    import trimesh

    bid = model.body(body).id
    out = []
    for g in range(model.ngeom):
        if model.geom_bodyid[g] != bid or model.geom_type[g] != mujoco.mjtGeom.mjGEOM_MESH:
            continue
        if model.geom_contype[g] != 0 or model.geom_conaffinity[g] != 0:
            continue    # collision geom
        mid = model.geom_dataid[g]
        va, vn = model.mesh_vertadr[mid], model.mesh_vertnum[mid]
        fa, fn = model.mesh_faceadr[mid], model.mesh_facenum[mid]
        verts = model.mesh_vert[va:va + vn].astype(np.float64)
        faces = model.mesh_face[fa:fa + fn].astype(np.int64)
        verts = verts @ _quat_mat(model.geom_quat[g]).T + model.geom_pos[g]
        mat = model.geom_matid[g]
        rgba = model.mat_rgba[mat] if mat >= 0 else model.geom_rgba[g]
        mesh = trimesh.Trimesh(verts, faces, process=True)
        mesh.merge_vertices(merge_tex=True, merge_norm=True)
        mesh.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
            baseColorFactor=[int(255 * c) for c in rgba], metallicFactor=0.1, roughnessFactor=0.55))
        out.append(mesh)
    return out


def export_web_assets(out_dir: str | Path = DEFAULT_OUT, program=None) -> dict:
    import trimesh

    out = Path(out_dir)
    (out / "panda").mkdir(parents=True, exist_ok=True)
    model = robot_model()
    files = {}
    whole = trimesh.Scene(base_frame="world")
    for body in ROBOT_BODIES:
        meshes = body_meshes(model, body)
        link = trimesh.Scene()
        for i, m in enumerate(meshes):
            link.add_geometry(m, geom_name=f"{body}_{i}", node_name=f"{body}_mesh{i}")
        path = out / "panda" / f"{body}.glb"
        path.write_bytes(link.export(file_type="glb"))
        files[f"panda/{body}.glb"] = path.stat().st_size

        bid = model.body(body).id
        parent = model.body(model.body_parentid[bid]).name
        whole.graph.update(frame_from="world" if parent == "world" else parent, frame_to=body,
                           matrix=_tf(model.body_pos[bid], model.body_quat[bid]))
        for i, m in enumerate(meshes):
            whole.add_geometry(m, geom_name=f"{body}_{i}", node_name=f"{body}_mesh{i}", parent_node_name=body)
    path = out / "panda.glb"
    path.write_bytes(whole.export(file_type="glb"))
    files["panda.glb"] = path.stat().st_size

    program = program if program is not None else json.loads(EXAMPLE.read_text())
    desc = scene_description(program)
    desc["example_program"] = str(EXAMPLE.name)
    (out / "scene.json").write_text(json.dumps(desc, indent=1))
    files["scene.json"] = (out / "scene.json").stat().st_size
    total = sum(files.values())
    return {"out_dir": str(out), "files": files, "total_bytes": total}


if __name__ == "__main__":
    res = export_web_assets(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT)
    for k, v in res["files"].items():
        print(f"{v / 1e6:7.2f} MB  {k}")
    print(f"{res['total_bytes'] / 1e6:7.2f} MB  total in {res['out_dir']}")
