"""Demo personas, sample videos, and sample skills processed through the real pipeline at first start."""
from __future__ import annotations

import asyncio
import logging
import os
import shutil

from . import jobs
from .box import wait_healthy
from .config import MEDIA, SAMPLES
from .db import SkillRow, User, now, select, session
from .pipeline.process import STAGES, process_skill
from .storage import new_id, read_json, save_skill

log = logging.getLogger("tacit.seed")

USERS = [
    User(id="u_maria", name="Maria Chen", role="expert", title="Senior assembler, 22 years", org="Northline Assembly",
         avatar="/media/avatars/maria.svg"),
    User(id="u_dev", name="Dev Patel", role="expert", title="Line lead, packaging", org="Northline Assembly",
         avatar="/media/avatars/dev.svg"),
    User(id="u_sam", name="Sam Okafor", role="trainee", title="New hire, week 1", org="Northline Assembly",
         avatar="/media/avatars/sam.svg"),
    User(id="u_priya", name="Priya Raman", role="manager", title="Plant manager", org="Northline Assembly",
         avatar="/media/avatars/priya.svg"),
    User(id="u_atlas", name="Atlas Robotics", role="buyer", title="Robot maker", org="Atlas Robotics",
         avatar="/media/avatars/atlas.svg"),
]

AVATAR = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs><rect width="64" height="64" rx="32" fill="url(#g)"/>
<text x="32" y="40" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="600" text-anchor="middle" fill="#0b0d12">{i}</text></svg>"""
COLORS = {"maria": ("#7cf5d4", "#3bb3ff"), "dev": ("#ffd36e", "#ff8a5b"), "sam": ("#b9a8ff", "#6f7bff"),
          "priya": ("#9cf27a", "#36c98a"), "atlas": ("#e0e6f0", "#8a96aa")}


def seed_users() -> None:
    (MEDIA / "avatars").mkdir(parents=True, exist_ok=True)
    with session() as s:
        for u in USERS:
            if not s.get(User, u.id):
                s.add(User(**u.model_dump()))
            key = u.id[2:]
            a, b = COLORS.get(key, ("#ccc", "#888"))
            initials = "".join(p[0] for p in u.name.split()[:2])
            (MEDIA / "avatars" / f"{key}.svg").write_text(AVATAR.format(a=a, b=b, i=initials))
        s.commit()


def samples() -> list[dict]:
    items = read_json(SAMPLES / "samples.json", []) or []
    dst = MEDIA / "samples"
    dst.mkdir(parents=True, exist_ok=True)
    for it in items:
        for key in ("video", "thumb"):
            name = os.path.basename(it.get(key, ""))
            src = SAMPLES / name
            if name and src.exists() and not (dst / name).exists():
                shutil.copy2(src, dst / name)
    return items


def create_skill_from_sample(sample: dict, expert_id: str = "u_maria", title: str | None = None) -> dict:
    name = os.path.basename(sample["video"])
    sid = new_id("sk")
    with session() as s:
        u = s.get(User, expert_id)
    skill = {"id": sid, "title": title or sample.get("title", "Sample skill"), "title_hint": title or sample.get("title"), "summary": "",
             "status": "draft", "created_at": now(), "test": bool(title and title.startswith("QA ")),
             "expert": {"id": expert_id, "name": u.name if u else expert_id, "title": u.title if u else ""},
             "source": {"kind": "sample", "sample_id": sample["id"], "raw_path": str(SAMPLES / name)},
             "consent": {"motion": True, "gaze": True, "voice_text": True, "raw_video": False, "signed_by": expert_id, "signed_at": now()},
             "steps": [], "qa": [], "verification": {"status": "pending"}, "robot": {}}
    return save_skill(skill, create=True)


async def seed_sample_skills() -> None:
    """Process each real sample once, after the vision, LLM and speech models answer."""
    items = [s for s in samples() if s.get("kind", "real") == "real"]
    if not items:
        return
    with session() as s:
        have = {r.sample_id for r in s.exec(select(SkillRow)).all() if r.sample_id}
    todo = [it for it in items if it["id"] not in have]
    if not todo:
        return
    log.info("seed: waiting for models before processing %d sample skills", len(todo))
    if not await wait_healthy(("hamer", "gaze", "rfdetr", "llm", "tts")):
        log.warning("seed: models never became healthy; samples not processed")
        return
    for k, it in enumerate(todo):
        skill = create_skill_from_sample(it, expert_id="u_maria" if k % 2 == 0 else "u_dev")
        job = jobs.run(jobs.create("process", skill["id"], STAGES), lambda j, sid=skill["id"]: process_skill(j, sid))
        while job.status in ("queued", "running"):
            await asyncio.sleep(2)
        log.info("seed: %s -> %s (%s)", it["id"], skill["id"], job.status)
