"""Shared fixtures: one evidence folder per run, a timing recorder per test, and the skill the flows share."""
from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

import e2e_lib as lib  # noqa: E402

RUN_ID = os.environ.get("QA_RUN_ID") or dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-api"
RUN_DIR = lib.EVIDENCE / "runs" / RUN_ID
RESULTS: dict[str, dict] = {}
RECORDERS: dict[str, lib.Recorder] = {}
STARTED = dt.datetime.now(dt.timezone.utc)


def pytest_configure(config):
    RUN_DIR.mkdir(parents=True, exist_ok=True)


@pytest.fixture(scope="session")
def api():
    with lib.client() as c:
        r = c.get("/api/health")
        assert r.status_code == 200, f"backend not answering at {lib.BASE}: {r.status_code}"
        yield c


@pytest.fixture(scope="session")
def scratch(tmp_path_factory) -> Path:
    return tmp_path_factory.mktemp("e2e")


@pytest.fixture
def rec(request) -> lib.Recorder:
    r = lib.Recorder(request.node.name, RUN_DIR)
    RECORDERS[request.node.nodeid] = r
    return r


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    if rep.when == "call" or (rep.when == "setup" and rep.outcome != "passed"):
        r = RECORDERS.get(item.nodeid)
        flow = next((m.args[0] for m in item.iter_markers("flow")), None)
        RESULTS[item.nodeid] = {
            "test": item.name, "flow": flow, "outcome": rep.outcome, "seconds": round(rep.duration, 2),
            "error": (str(rep.longrepr.reprcrash.message) if rep.failed and hasattr(rep.longrepr, "reprcrash") else
                      (str(rep.longrepr)[-2000:] if rep.failed else None)),
            "timings": r.timings if r else [], "flags": r.flags if r else [], "notes": r.notes if r else [],
            "evidence": str((RUN_DIR / item.name).relative_to(lib.REPO)) if (RUN_DIR / item.name).exists() else None,
        }


def pytest_sessionfinish(session, exitstatus):
    out = {"run_id": RUN_ID, "kind": "api", "base": lib.BASE, "started": STARTED.isoformat(timespec="seconds"),
           "finished": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
           "git": subprocess.run(["git", "-C", str(lib.REPO), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip(),
           "tests": list(RESULTS.values())}
    (RUN_DIR / "results.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
    report = lib.REPO / "scripts" / "e2e" / "report.py"
    if report.exists() and not os.environ.get("QA_NO_REPORT"):
        subprocess.run([sys.executable, str(report)], check=False)


# ------------------------------------------------------------------------------------ the shared skill
class SkillRun:
    def __init__(self, skill_id: str, job: dict, created_s: float, process_s: float, sample: dict):
        self.skill_id, self.job, self.created_s, self.process_s, self.sample = skill_id, job, created_s, process_s, sample


@pytest.fixture(scope="session")
def processed(api) -> SkillRun:
    """F2 on a sample: create the skill, process it on the real models, wait for ready.

    QA_SKILL_ID reuses a skill this suite already processed (iteration only; a release run starts fresh).
    """
    reuse = os.environ.get("QA_SKILL_ID")
    if reuse:
        sk = api.get(f"/api/skills/{reuse}").json()
        return SkillRun(reuse, {"status": "done", "stages": [], "reused": True}, 0.0, 0.0, {"id": sk["source"].get("sample_id")})
    t0 = time.perf_counter()
    upload = os.environ.get("QA_UPLOAD_VIDEO")
    if upload:
        # Iteration aid: the upload source runs the same pipeline when no sample fits.
        sample = {"id": None, "title": Path(upload).stem, "kind": "real"}
        with open(upload, "rb") as f:
            r = api.post("/api/skills", files={"file": (Path(upload).name, f, "video/mp4")}, data={"title": sample["title"]},
                         headers={"X-Tacit-User": "u_maria"})
    else:
        sample = lib.pick_sample(api)
        # A "QA " title marks the skill as a test skill, hidden from the demo's lists.
        r = api.post("/api/skills", json={"source": "sample", "sample_id": sample["id"], "title": lib.QA_PREFIX + sample["title"]},
                     headers={"X-Tacit-User": "u_maria"})
    r.raise_for_status()
    sid = r.json()["skill_id"]
    created_s = time.perf_counter() - t0
    api.patch(f"/api/skills/{sid}", json={"title": lib.QA_PREFIX + sample.get("title", "sample")}).raise_for_status()
    t1 = time.perf_counter()
    job_id = api.post(f"/api/skills/{sid}/process").json()["job_id"]
    restarts = lib.Recorder("processed", RUN_DIR)
    job = lib.wait_process(api, sid, job_id, float(os.environ.get("QA_PROCESS_TIMEOUT", 1200)), restarts)
    process_s = time.perf_counter() - t1
    sk = api.get(f"/api/skills/{sid}").json()
    if sk.get("title") and not sk["title"].startswith(lib.QA_PREFIX):
        api.patch(f"/api/skills/{sid}", json={"title": lib.QA_PREFIX + sk["title"]})
    run = SkillRun(sid, job, created_s, process_s, sample)
    run.flags = restarts.flags
    PROCESSED.append(run)
    return run


PROCESSED: list[SkillRun] = []


@pytest.fixture
def ready_skill(processed, api) -> SkillRun:
    """The shared skill for flows 4 to 6; they cannot say anything useful about a skill that is not ready."""
    st = api.get(f"/api/skills/{processed.skill_id}").json().get("status")
    if processed.job.get("status") != "done" or st != "ready":
        pytest.fail(f"the shared skill {processed.skill_id} is not ready (job {processed.job.get('status')}: "
                    f"{processed.job.get('error')}; skill {st}), so this flow cannot run", pytrace=False)
    return processed
