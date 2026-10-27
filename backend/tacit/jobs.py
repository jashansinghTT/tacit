"""Background jobs (process, verify, train, evaluate) with stage progress pushed to WebSocket subscribers."""
from __future__ import annotations

import asyncio
import json
import logging
import time
import traceback
from typing import Awaitable, Callable

from .db import JobRow, now, session
from .storage import new_id

log = logging.getLogger("tacit.jobs")


class Job:
    def __init__(self, kind: str, skill_id: str | None, stages: list[str]):
        self.id = new_id("job")
        self.kind = kind
        self.skill_id = skill_id
        self.status = "queued"
        self.progress = 0.0
        self.stage = ""
        self.stages = [{"name": n, "status": "pending"} for n in stages]
        self.error: str | None = None
        self.result: dict = {}
        self.created = time.time()
        self._subs: set[asyncio.Queue] = set()
        self._t_stage: float | None = None

    def to_dict(self) -> dict:
        return {"id": self.id, "kind": self.kind, "skill_id": self.skill_id, "status": self.status,
                "progress": round(self.progress, 3), "stage": self.stage, "stages": self.stages,
                "error": self.error, "result": self.result}

    # progress -----------------------------------------------------------------
    def _stage(self, name: str) -> dict:
        for s in self.stages:
            if s["name"] == name:
                return s
        s = {"name": name, "status": "pending"}
        self.stages.append(s)
        return s

    def start_stage(self, name: str, models: list[str] | None = None, detail: str | None = None) -> None:
        if self.stage:
            prev = self._stage(self.stage)
            if prev["status"] == "running":
                self.finish_stage(self.stage)
        s = self._stage(name)
        s["status"] = "running"
        if models:
            s["models"] = models
        if detail:
            s["detail"] = detail
        self.stage = name
        self._t_stage = time.perf_counter()
        self._update_progress()
        self.emit()

    def stage_progress(self, frac: float, detail: str | None = None) -> None:
        s = self._stage(self.stage)
        s["progress"] = round(max(0.0, min(1.0, frac)), 3)
        if detail:
            s["detail"] = detail
        self._update_progress()
        self.emit()

    def finish_stage(self, name: str, detail: str | None = None, status: str = "done") -> None:
        s = self._stage(name)
        s["status"] = status
        s["progress"] = 1.0
        if self._t_stage is not None and self.stage == name:
            s["ms"] = round((time.perf_counter() - self._t_stage) * 1000)
        if detail:
            s["detail"] = detail
        self._update_progress()
        self.emit()

    def _update_progress(self) -> None:
        n = len(self.stages) or 1
        done = sum(1.0 if s["status"] in ("done", "skipped") else s.get("progress", 0.0) if s["status"] == "running" else 0.0
                   for s in self.stages)
        self.progress = done / n

    # pub/sub -------------------------------------------------------------------
    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._subs.add(q)
        q.put_nowait(self.to_dict())
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subs.discard(q)

    def emit(self) -> None:
        snap = self.to_dict()
        for q in list(self._subs):
            if q.full():
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            q.put_nowait(snap)
        _persist(self)


def _persist(job: Job) -> None:
    try:
        with session() as s:
            row = s.get(JobRow, job.id) or JobRow(id=job.id, kind=job.kind, skill_id=job.skill_id)
            row.status, row.progress, row.stage, row.error = job.status, job.progress, job.stage, job.error
            row.payload = json.dumps(job.to_dict())
            if job.status in ("done", "failed") and not row.finished_at:
                row.finished_at = now()
            s.add(row)
            s.commit()
    except Exception:  # noqa: BLE001 - progress persistence must never kill a job
        log.exception("persist job %s", job.id)


JOBS: dict[str, Job] = {}
_tasks: set[asyncio.Task] = set()


def create(kind: str, skill_id: str | None, stages: list[str]) -> Job:
    job = Job(kind, skill_id, stages)
    JOBS[job.id] = job
    _persist(job)
    return job


def run(job: Job, fn: Callable[[Job], Awaitable[dict | None]]) -> Job:
    async def go():
        job.status = "running"
        job.emit()
        try:
            res = await fn(job)
            if job.stage:
                s = job._stage(job.stage)
                if s["status"] == "running":
                    job.finish_stage(job.stage)
            job.result = res or job.result
            job.status = "done"
            job.progress = 1.0
        except Exception as e:  # noqa: BLE001
            log.error("job %s failed: %s\n%s", job.id, e, traceback.format_exc())
            job.status = "failed"
            job.error = str(e)
            if job.stage:
                job._stage(job.stage)["status"] = "failed"
        job.emit()

    t = asyncio.create_task(go())
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
    return job


def get(job_id: str) -> dict | None:
    if job_id in JOBS:
        return JOBS[job_id].to_dict()
    with session() as s:
        row = s.get(JobRow, job_id)
        return json.loads(row.payload) if row else None


def active_for(skill_id: str, kind: str) -> Job | None:
    for j in JOBS.values():
        if j.skill_id == skill_id and j.kind == kind and j.status in ("queued", "running"):
            return j
    return None
