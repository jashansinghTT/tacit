#!/usr/bin/env python3
"""Print the last few actions of a team worker from its stream-json log."""
import json, sys, pathlib

card = sys.argv[1]
n = int(sys.argv[2]) if len(sys.argv) > 2 else 8
log = pathlib.Path.home() / "tacit" / "logs" / "team" / f"{card}.jsonl"
events = []
for line in log.read_text(errors="replace").splitlines():
    try:
        ev = json.loads(line)
    except json.JSONDecodeError:
        continue
    if ev.get("type") == "assistant":
        for block in ev.get("message", {}).get("content", []):
            if block.get("type") == "text" and block["text"].strip():
                events.append("say: " + block["text"].strip().replace("\n", " ")[:300])
            elif block.get("type") == "tool_use":
                inp = block.get("input", {})
                desc = inp.get("description") or inp.get("command") or inp.get("file_path") or inp.get("query") or ""
                events.append(f"tool {block.get('name')}: {str(desc)[:200]}")
    elif ev.get("type") == "result":
        events.append(f"RESULT ({ev.get('subtype')}): {str(ev.get('result', ''))[:400]}")
for e in events[-n:]:
    print(e)
