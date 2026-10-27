"""Skill records on disk: data/skills/<id>/ holds skill.json, tracks.json, twin.json and media."""
from __future__ import annotations

import json
import os
import secrets
import shutil
from pathlib import Path

import orjson

from .config import MEDIA, SKILLS
from .db import SkillRow, now, session


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}"


def skill_dir(skill_id: str) -> Path:
    d = SKILLS / skill_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def media_dir(skill_id: str) -> Path:
    """Public media for a skill (served at /media/skills/<id>/)."""
    d = MEDIA / "skills" / skill_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def media_url(path: Path) -> str:
    return "/media/" + str(path.relative_to(MEDIA)).replace(os.sep, "/")


def write_json(path: Path, obj) -> None:
    tmp = path.with_suffix(path.suffix + ".part")
    tmp.write_bytes(orjson.dumps(obj, option=orjson.OPT_SERIALIZE_NUMPY))
    tmp.replace(path)


def read_json(path: Path, default=None):
    try:
        return orjson.loads(path.read_bytes())
    except FileNotFoundError:
        return default


def load_skill(skill_id: str) -> dict | None:
    return read_json(SKILLS / skill_id / "skill.json")


def save_skill(skill: dict) -> dict:
    """Write the record. User intent saved meanwhile (a test flag, a title the user chose) is kept,
    so a long job saving its older copy does not undo a rename made while it ran."""
    path = skill_dir(skill["id"]) / "skill.json"
    disk = read_json(path) or {}
    if disk.get("test"):
        skill["test"] = True
    if disk.get("title_locked") and not skill.get("title_locked"):
        skill["title"], skill["title_locked"] = disk["title"], True
    skill["updated_at"] = now()
    write_json(path, skill)
    with session() as s:
        row = s.get(SkillRow, skill["id"]) or SkillRow(id=skill["id"])
        row.title = skill.get("title") or row.title
        row.summary = skill.get("summary", "")
        row.status = skill.get("status", "draft")
        row.expert_id = (skill.get("expert") or {}).get("id", row.expert_id)
        row.created_at = skill.get("created_at", row.created_at)
        row.updated_at = skill["updated_at"]
        row.thumb = skill.get("thumb", "")
        row.duration = float((skill.get("source") or {}).get("duration", 0.0))
        row.steps_count = len(skill.get("steps", []))
        row.verification_status = (skill.get("verification") or {}).get("status", "pending")
        row.listing_id = skill.get("listing_id")
        row.source_kind = (skill.get("source") or {}).get("kind", "upload")
        row.sample_id = (skill.get("source") or {}).get("sample_id")
        row.test = bool(skill.get("test"))
        s.add(row)
        s.commit()
    return skill


def delete_skill(skill_id: str) -> None:
    shutil.rmtree(SKILLS / skill_id, ignore_errors=True)
    shutil.rmtree(MEDIA / "skills" / skill_id, ignore_errors=True)
    with session() as s:
        row = s.get(SkillRow, skill_id)
        if row:
            s.delete(row)
            s.commit()


def tracks_path(skill_id: str) -> Path:
    return skill_dir(skill_id) / "tracks.json"


def twin_path(skill_id: str) -> Path:
    return skill_dir(skill_id) / "twin.json"


def pointcloud_path(skill_id: str) -> Path:
    return skill_dir(skill_id) / "pointcloud.bin"


def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False)
