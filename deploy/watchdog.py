#!/usr/bin/env python3
"""Every 5 minutes (systemd timer): keep the stack up and rewrite the Runtime section of STATUS.md.

Restarts what is down (at most 3 times an hour per service), never touches a chip some container is
still booting on, and records what it did in logs/watchdog.log.
"""
from __future__ import annotations

import datetime as dt
import json
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path.home() / "tacit"
LOG = ROOT / "logs" / "watchdog.log"
STATE = ROOT / "logs" / "watchdog-state.json"
STATUS = ROOT / "STATUS.md"
MAX_RESTARTS_PER_HOUR = 3

CHECKS = {
    "backend": "http://127.0.0.1:8710/api/health",
    "llm": "http://127.0.0.1:21020/v1/models",
    "speech": "http://127.0.0.1:21013/",
    "gr00t": "http://127.0.0.1:21030/health",
    "hamer": "http://127.0.0.1:21000/health",
    "gaze": "http://127.0.0.1:21001/health",
    "rfdetr": "http://127.0.0.1:21002/health",
    "vggt": "http://127.0.0.1:21003/health",
}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def log(msg: str) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a") as f:
        f.write(f"[{now()}] {msg}\n")


def ok(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=4) as r:
            if url.endswith(":21013/"):
                d = json.loads(r.read())
                return all(m.get("ready") for m in d["members"].values())
            return r.status < 400
    except Exception:  # noqa: BLE001
        return False


def allowed(state: dict, name: str) -> bool:
    hist = [t for t in state.get(name, []) if time.time() - t < 3600]
    state[name] = hist
    return len(hist) < MAX_RESTARTS_PER_HOUR


def main() -> None:
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    health = {k: ok(u) for k, u in CHECKS.items()}
    if not all(health.values()):
        time.sleep(10)  # a service that is just (re)starting gets a second look before any restart
        health = {k: health[k] or ok(u) for k, u in CHECKS.items()}
    actions = []
    if not health["backend"] and allowed(state, "backend"):
        subprocess.run(["systemctl", "--user", "restart", "tacit-backend.service"], check=False)
        state["backend"].append(time.time())
        actions.append("restarted backend")
    if not all(health[k] for k in ("llm", "speech", "gr00t")) and allowed(state, "models"):
        out = subprocess.run([str(ROOT / "deploy" / "stack.sh"), "up-models"], capture_output=True, text=True, timeout=600)
        state["models"].append(time.time())
        actions.append("stack up-models: " + " | ".join(l.strip() for l in out.stdout.splitlines() if "start" in l or "FAILED" in l))
    STATE.write_text(json.dumps(state))
    if actions:
        log("; ".join(actions))
    write_runtime(health, actions)


def write_runtime(health: dict, actions: list[str]) -> None:
    """Replace the block between the runtime markers in STATUS.md."""
    rows = "\n".join(f"| {k} | {'up' if v else 'DOWN'} | {CHECKS[k]} |" for k, v in health.items())
    sessions = subprocess.run(["tmux", "ls"], capture_output=True, text=True).stdout.strip().replace("\n", "; ")
    block = (f"<!-- runtime:start -->\n### Runtime (watchdog, {now()})\n\n| service | state | check |\n|---|---|---|\n{rows}\n\n"
             f"tmux sessions: {sessions or 'none'}\n"
             + (f"\nLast watchdog action: {'; '.join(actions)}\n" if actions else "") + "<!-- runtime:end -->")
    text = STATUS.read_text() if STATUS.exists() else "# Tacit status\n"
    if "<!-- runtime:start -->" in text:
        pre, rest = text.split("<!-- runtime:start -->", 1)
        post = rest.split("<!-- runtime:end -->", 1)[1] if "<!-- runtime:end -->" in rest else ""
        text = pre + block + post
    else:
        text = text.rstrip() + "\n\n" + block + "\n"
    STATUS.write_text(text)


if __name__ == "__main__":
    main()
