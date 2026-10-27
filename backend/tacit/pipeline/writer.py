"""gpt-oss-20b turns an observed timeline into a lesson: steps, the why, an SOP, a quiz and a robot program."""
from __future__ import annotations

import json

from ..models import llm

WRITER_SYSTEM = """You are Tacit's skill writer. A machine watched an expert do a hands-on task: it tracked their hands, \
where they looked and which objects moved. You turn that timeline into work instructions a new hire can follow.

Rules:
- Describe only what the timeline shows. Never invent tools, parts, quantities or measurements that are not in it.
- One action per step. Imperative mood. Instructions of at most 22 words. Step titles of at most 6 words.
- "why": if the expert explained the step, use their words (shortened, first person turned into plain statements) and set \
why_source to "expert". Otherwise give the most likely practical reason in one sentence and set why_source to "inferred".
- Every step is something the trainee DOES with their hands (pick up, place, turn, align, press, hold, hand over, set \
down). Never write a step that only says to observe or watch.
- Each timeline step is one observed action. Its "action" says what the hands did: "insert" put the item held in the \
hand into a container; "pick" picked an object up and held it; "place" set it down and adjusted it; "move" carried it to \
another place; "lift_return" lifted it, checked it and set it back; "handle" worked with it where it stands. "target" is \
where it went, "approach" how the hand came to it, and object names say where the object is from the expert ("vase on \
your right"): keep those words, they tell the trainee where to reach.
- Write one step per timeline step. A repeated action ("repeat": "2 of 5") stays one step per repetition: say how many \
times in the first ("the first of five stems"), then "the next" and "the last". Merge timeline steps only when they are \
plainly pieces of one action on the same object.
- An item held in the hand that the timeline does not name (it was not recognised) may be named after the recording \
title when the title names it ("stem" for a title about stems); otherwise call it "the item".
- Plain, friendly language. No marketing words.
- Reply with JSON only, no prose before or after."""


def _timeline_summary(skill: dict, steps: list[dict], objects_seen: list[str]) -> dict:
    qa = [{"step": q.get("step_index"), "question": q["question"], "answer": q.get("answer")}
          for q in skill.get("qa", []) if q.get("answer")]
    return {
        "duration_s": round((skill.get("source") or {}).get("duration", 0.0), 1),
        "objects_seen": objects_seen,
        "steps": [{"index": s["index"], "time_s": [round(s["t_start"], 1), round(s["t_end"], 1)], "hand": s.get("hand"),
                   "action": s.get("action"), "object": s.get("object"), "target": s.get("to"),
                   "approach": s.get("approach"), "objects": s.get("objects", []), "looked_at": s.get("gaze_target"),
                   "repeat": f"{s['repeat']} of {s['repeats']}" if s.get("repeats", 1) > 1 else None,
                   "observed": s.get("draft"), "moved_from": s.get("from")} for s in steps],
        "expert_answers": qa,
        "recording_title_from_user_may_be_a_placeholder": skill.get("title_hint"),
    }


async def write_structure(skill: dict, steps: list[dict], objects_seen: list[str]) -> tuple[dict, dict]:
    timeline = _timeline_summary(skill, steps, objects_seen)
    user = f"""Timeline (JSON):
{json.dumps(timeline, ensure_ascii=False)}

Return JSON with exactly these keys:
{{"title": "skill name, at most 7 words",
  "summary": "one sentence: what the skill achieves and why it matters",
  "steps": [{{"index": 1, "covers": [<timeline step indices this step stands for, in order>], "title": "...",
             "instruction": "...", "why": "... (no 'Inferred:' prefix)", "why_source": "expert|inferred",
             "tips": ["at most 2 short tips a new hire would miss"]}}],
  "robot_program": [{{"op": "pick", "object": "<object name>"}}, {{"op": "place", "target": "<object or place name>"}}],
  "pending_questions": [{{"index": <step index>, "question": "one short question to ask the expert about why"}}]}}
Keep the timeline's order, one step per timeline step unless two are pieces of one action (renumber from 1). The robot \
program reproduces the actions in order with the object names from the timeline (an insert is a pick of the held item and a \
place into the container). Ask pending questions only for steps whose why is inferred."""
    return await llm.chat_json([{"role": "system", "content": WRITER_SYSTEM}, {"role": "user", "content": user}],
                               max_tokens=1800)


async def write_documents(structure: dict) -> tuple[dict, dict]:
    user = f"""Skill (JSON):
{json.dumps({k: structure.get(k) for k in ("title", "summary", "steps")}, ensure_ascii=False)}

Return JSON with exactly these keys:
{{"sop_markdown": "a standard work instruction in Markdown: '# <title>', a one-line purpose, a 'Before you start' list, \
numbered steps (bold title, then the instruction, then 'Why:' line), and a short 'Check your work' list",
  "quiz": [{{"q": "...", "choices": ["...", "...", "..."], "answer": <index of the right choice>, "explain": "one sentence"}}],
  "safety": ["at most 3 short safety or quality notes that follow from the steps"]}}
Write exactly 3 quiz questions that test the why, not trivia."""
    return await llm.chat_json([{"role": "system", "content": WRITER_SYSTEM}, {"role": "user", "content": user}],
                               max_tokens=1600)


COACH_SYSTEM = """You are the coach inside Tacit. An expert is recording a hands-on task so new hires and robots can learn it. \
Right after each step, you ask the expert ONE short spoken question about why they did it that way: the tacit knowledge a \
new hire would miss (an order, a grip, a check, a choice between options). At most 14 words. Friendly and specific to what \
you saw. No preamble, no quotes, just the question."""


async def coach_question(step: dict, earlier: list[str]) -> tuple[str, dict]:
    seen = {"just_did": step.get("draft"), "action": step.get("action"), "hand": step.get("hand"), "objects": step.get("objects"),
            "looked_at": step.get("gaze_target"), "duration_s": round(step["t_end"] - step["t_start"], 1)}
    user = f"Observed step: {json.dumps(seen)}\nQuestions already asked: {json.dumps(earlier[-4:])}\nAsk your question."
    text, sb = await llm.chat([{"role": "system", "content": COACH_SYSTEM}, {"role": "user", "content": user}],
                              max_tokens=200)
    q = text.strip().strip('"').split("\n")[0].strip()
    if not q.endswith("?"):
        q = q.rstrip(".") + "?"
    return q, sb


TUTOR_SYSTEM = """You are {expert}'s AI tutor for the skill "{title}" in Tacit. A trainee asks you questions while learning it. \
Answer from the skill record below only: the steps, the expert's own explanations and the standard work instruction. \
When the expert explained something, say so ("{first} says ..."). If the record does not cover the question, say you do not \
know from this recording and suggest asking a supervisor. Spoken style, at most 70 words, no lists, no Markdown. \
Answer in {lang}.

Skill record:
{record}"""

LANGS = {"en": "English", "es": "Spanish", "fr": "French", "de": "German", "zh": "Chinese", "ja": "Japanese",
         "ko": "Korean", "pt": "Portuguese", "hi": "Hindi"}


def tutor_messages(skill: dict, question: str, lang: str = "en", history: list[dict] | None = None) -> list[dict]:
    expert = (skill.get("expert") or {}).get("name", "the expert")
    record = {"title": skill.get("title"), "summary": skill.get("summary"),
              "steps": [{k: s.get(k) for k in ("index", "title", "instruction", "why", "why_source", "tips")} for s in skill.get("steps", [])],
              "expert_answers": [{"question": q["question"], "answer": q.get("answer")} for q in skill.get("qa", []) if q.get("answer")],
              "safety": skill.get("safety", [])}
    sys = TUTOR_SYSTEM.format(expert=expert, first=expert.split()[0], title=skill.get("title", "this skill"),
                              lang=LANGS.get(lang, "English"), record=json.dumps(record, ensure_ascii=False))
    msgs = [{"role": "system", "content": sys}]
    msgs += (history or [])[-6:]
    msgs.append({"role": "user", "content": question})
    return msgs
