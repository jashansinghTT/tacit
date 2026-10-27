"""Point the backend at a throwaway data dir before anything imports tacit.config."""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="tacit-test-"))
os.environ["TACIT_DATA"] = str(_TMP)
os.environ["TACIT_SEED"] = "0"
# MediaPipe model files are large; reuse the real ones.
_real_models = Path(__file__).resolve().parents[2] / "data" / "models"
(_TMP / "models").mkdir(parents=True, exist_ok=True)
for f in _real_models.glob("*.task"):
    dst = _TMP / "models" / f.name
    if not dst.exists():
        os.symlink(f, dst)

FIXTURES = Path(__file__).parent / "fixtures"


def pytest_sessionfinish(session, exitstatus):  # noqa: ARG001
    shutil.rmtree(_TMP, ignore_errors=True)
