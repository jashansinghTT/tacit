import json
import os
from pathlib import Path

import pytest

os.environ.setdefault("MUJOCO_GL", "egl")

SIM_DIR = Path(__file__).resolve().parents[1]
EXAMPLES = SIM_DIR / "examples"


@pytest.fixture(scope="session")
def sort2():
    return json.loads((EXAMPLES / "sort2.json").read_text())


@pytest.fixture(scope="session")
def tiny_policy(tmp_path_factory, sort2):
    """A policy trained on a handful of demos: enough to exercise the pipeline, not to succeed."""
    from tacit_sim import generate_demos, train_policy

    root = tmp_path_factory.mktemp("tiny")
    ds = generate_demos(sort2, n=6, seed=0, out_dir=root / "demos", workers=2)
    epochs = []
    res = train_policy(ds.path, root / "policy.pt", epochs=2, on_epoch=lambda e, l: epochs.append((e, l)))
    return {"demos": ds, "train": res, "epochs": epochs}
