"""Lessons in the trainee's language: gpt-oss-20b translates, S2 Pro speaks (in the background)."""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging

from ..models import llm, speech
from ..models.base import ModelUnavailable
from ..pipeline.writer import LANGS
from ..storage import load_skill, media_url, read_json, skill_dir, write_json

log = logging.getLogger("tacit.i18n")
_running: set[tuple[str, str]] = set()
_tasks: set[asyncio.Task] = set()


def _path(skill_id: str, lang: str):
    return skill_dir(skill_id) / "i18n" / f"{lang}.json"


def _source(skill: dict) -> dict:
    return {"title": skill.get("title"), "summary": skill.get("summary"),
            "steps": [{"index": s["index"], "title": s.get("title"), "instruction": s.get("instruction"), "why": s.get("why"),
                       "tips": s.get("tips", [])} for s in skill.get("steps", [])],
            "quiz": skill.get("quiz", []), "safety": skill.get("safety", [])}


async def translate(skill_id: str, lang: str) -> dict:
    """The lesson's text in `lang` (cached); narration fills in over time."""
    if lang not in LANGS or lang == "en":
        raise ValueError(f"unsupported language {lang}")
    skill = load_skill(skill_id)
    if not skill:
        raise ValueError(f"no skill {skill_id}")
    src = _source(skill)
    digest = hashlib.sha1(json.dumps(src, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]
    cached = read_json(_path(skill_id, lang))
    if cached and cached.get("source_hash") == digest:
        _ensure_voice(skill_id, lang, cached)
        return cached
    msgs = [{"role": "system", "content": f"You translate work instructions into {LANGS[lang]} for a new hire. Keep them short, "
                                          "plain and in the imperative. Keep the JSON structure and keys exactly; translate only "
                                          "the string values (not quiz answer indexes). Reply with JSON only."},
            {"role": "user", "content": json.dumps(src, ensure_ascii=False)}]
    out, sb = await llm.chat_json(msgs, max_tokens=2500)
    out["lang"] = lang
    out["source_hash"] = digest
    out["narration"] = {}
    out["served_by"] = [sb]
    p = _path(skill_id, lang)
    p.parent.mkdir(parents=True, exist_ok=True)
    write_json(p, out)
    _ensure_voice(skill_id, lang, out)
    return out


def _ensure_voice(skill_id: str, lang: str, tr: dict) -> None:
    lines = [("intro", f"{tr.get('title', '')}. {tr.get('summary', '')}")] + \
            [(f"st{s['index']}", f"{s['index']}. {s.get('title', '')}. {s.get('instruction', '')}") for s in tr.get("steps", [])]
    missing = [(k, t) for k, t in lines if k not in (tr.get("narration") or {})]
    if not missing or (skill_id, lang) in _running:
        return
    _running.add((skill_id, lang))

    async def go():
        try:
            for key, text in missing:
                try:
                    path, dur, _ = await speech.tts_sentences(text)
                except ModelUnavailable:
                    log.warning("narration in %s stopped for %s", lang, skill_id)
                    return
                cur = read_json(_path(skill_id, lang)) or tr
                cur.setdefault("narration", {})[key] = {"audio": media_url(path), "duration": round(dur, 2), "text": text}
                write_json(_path(skill_id, lang), cur)
        finally:
            _running.discard((skill_id, lang))

    t = asyncio.create_task(go())
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
