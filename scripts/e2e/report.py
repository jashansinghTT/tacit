#!/usr/bin/env python3
"""Rewrite .orchestration/evidence/qa/RESULTS.md from the run folders under .orchestration/evidence/qa/runs/.

API runs (pytest, tests/e2e) write `<UTC>-api/results.json`; browser runs (Playwright, web/e2e) write
`<UTC>-ui/results.json` (Playwright's JSON reporter). Folders whose name does not start with a timestamp
(dev runs) are ignored.
"""
from __future__ import annotations

import base64
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
QA = REPO / ".orchestration" / "evidence" / "qa"
RUNS = QA / "runs"
FLOWS = {1: "Landing and navigation", 2: "Sample → process → ready skill", 3: "Live capture → coach → spoken answer",
         4: "Learn: narration, practice, tutor", 5: "Robot Lab: train → evaluate → GR00T", 6: "Exchange: list → license → pack → earnings",
         7: "Box: 9 models on 4 chips"}
STAMP = re.compile(r"^\d{8}T\d{6}Z-(api|ui)$")


def api_run(d: Path) -> dict | None:
    p = d / "results.json"
    if not p.exists():
        return None
    data = json.loads(p.read_text())
    flows = {}
    for t in data.get("tests", []):
        if t.get("flow"):
            flows[int(t["flow"])] = {"outcome": t["outcome"], "seconds": t["seconds"], "flags": t.get("flags", []),
                                     "timings": t.get("timings", []), "error": t.get("error"), "evidence": t.get("evidence"),
                                     "notes": t.get("notes", [])}
    return {"id": d.name, "kind": "api", "finished": data.get("finished"), "git": data.get("git"), "flows": flows}


def _specs(suite: dict):
    for s in suite.get("specs", []):
        yield s
    for child in suite.get("suites", []):
        yield from _specs(child)


def _body(attachment: dict) -> str:
    """Playwright's JSON reporter stores attachment bodies base64-encoded."""
    try:
        return base64.b64decode(attachment.get("body", "")).decode()
    except ValueError:
        return attachment.get("body", "")


def ui_run(d: Path) -> dict | None:
    p = d / "results.json"
    if not p.exists():
        return None
    data = json.loads(p.read_text())
    flows, extras = {}, {}
    for suite in data.get("suites", []):
        for spec in _specs(suite):
            m = re.search(r"\b([FX])(\d)\b", spec.get("title", ""))
            if not m:
                continue
            results = [r for t in spec.get("tests", []) for r in t.get("results", [])]
            last = results[-1] if results else {}
            status = last.get("status", "skipped")
            outcome = {"passed": "passed", "failed": "failed", "timedOut": "failed", "interrupted": "failed"}.get(status, status)
            err = (last.get("error") or {}).get("message")
            atts = [a.get("path") for a in last.get("attachments", []) if a.get("path")]
            notes = [_body(a) for a in last.get("attachments", []) if a.get("name") == "note"]
            timings = []
            for a in last.get("attachments", []):
                if a.get("name") == "timings" and a.get("body"):
                    try:
                        timings = json.loads(_body(a))
                    except ValueError:
                        timings = []
            target = flows if m.group(1) == "F" else extras
            target[int(m.group(2))] = {"outcome": outcome, "seconds": round(last.get("duration", 0) / 1000, 1),
                                      "flags": [f"slow: {t_['step']} took {t_['s']:.1f} s (limit {t_['limit_s']:g} s)" for t_ in timings if t_.get("slow")], "timings": timings,
                                      "error": re.sub(r"\x1b\[[0-9;]*m", "", err)[:400] if err else None,
                                      "evidence": str(d.relative_to(REPO)), "attachments": atts, "notes": notes}
    stats = data.get("stats", {})
    return {"id": d.name, "kind": "ui", "finished": stats.get("startTime"), "flows": flows, "extras": extras}


def runs() -> list[dict]:
    out = []
    for d in sorted(RUNS.glob("*")) if RUNS.exists() else []:
        m = STAMP.match(d.name)
        if not m:
            continue
        if (d / "ABORTED.txt").exists():
            out.append({"id": d.name, "kind": m.group(1), "flows": {}, "aborted": (d / "ABORTED.txt").read_text().strip()})
            continue
        r = api_run(d) if m.group(1) == "api" else ui_run(d)
        if r and r["flows"]:
            out.append(r)
    return out


def green(r: dict) -> bool:
    return len(r["flows"]) == 7 and all(f["outcome"] == "passed" for f in r["flows"].values())


def streak(rs: list[dict]) -> int:
    n = 0
    for r in reversed(rs):
        if not green(r):
            break
        n += 1
    return n


def cell(f: dict | None) -> str:
    if not f:
        return "not run"
    mark = {"passed": "PASS", "failed": "FAIL", "skipped": "skip"}.get(f["outcome"], f["outcome"])
    slow = " (slow)" if f.get("flags") and any("slow" in x for x in f["flags"]) else ""
    return f"{mark}{slow}, {f['seconds']:.0f} s"


def key_timings(f: dict | None, n: int = 4) -> str:
    if not f:
        return ""
    ts = [t for t in f.get("timings", []) if t.get("s") is not None and (t.get("limit_s") or t.get("slow"))]
    ts = sorted(ts, key=lambda t: (not t.get("slow"), -(t["s"] / (t.get("limit_s") or 1))))[:n]
    return "; ".join(f"{t['step']} {t['s']:.1f} s" + (" SLOW" if t.get("slow") else "") for t in ts)


def main() -> int:
    rs = runs()
    done = [r for r in rs if not r.get("aborted")]  # an aborted run is listed in the history but neither breaks nor extends a streak
    api = [r for r in done if r["kind"] == "api"]
    ui = [r for r in done if r["kind"] == "ui"]
    la, lu = (api[-1] if api else None), (ui[-1] if ui else None)
    lines = ["# QA results: the 7 E2E flows (SPEC section 9) on the real stack", "",
             "Rewritten by `scripts/e2e/report.py` after every run. API: `tests/e2e` (pytest, httpx, websockets). "
             "UI: `web/e2e/flows.spec.ts` (Playwright, Chromium, fake camera and microphone).", "",
             f"- Last API run: {la['id'] if la else 'none'}" + (f" (git {la.get('git')})" if la else ""),
             f"- Last UI run: {lu['id'] if lu else 'none'}",
             f"- Green in a row: API {streak(api)}, UI {streak(ui)} (merge gate: 2 and 2)", "",
             "| # | Flow | API | UI | Key timings (API) | Evidence |", "|---|---|---|---|---|---|"]
    for n, name in FLOWS.items():
        fa = la["flows"].get(n) if la else None
        fu = lu["flows"].get(n) if lu else None
        ev = " ".join(f"[{k}]({Path(f['evidence']).relative_to('.orchestration/evidence/qa') if f['evidence'].startswith('.orchestration/evidence/qa') else f['evidence']})"
                      for k, f in (("api", fa), ("ui", fu)) if f and f.get("evidence"))
        lines.append(f"| {n} | {name} | {cell(fa)} | {cell(fu)} | {key_timings(fa)} | {ev} |")
    problems = []
    for label, r in (("API", la), ("UI", lu)):
        if not r:
            continue
        for n, f in sorted(r["flows"].items()):
            if f["outcome"] != "passed" and f.get("error"):
                problems.append(f"- {label} F{n}: {f['error'].splitlines()[0][:300]}")
            for fl in f.get("flags", []):
                problems.append(f"- {label} F{n} flag: {fl}")
    if problems:
        lines += ["", "## Failures and flags in the last runs", ""] + problems
    for label, r in (("API", la), ("UI", lu)):
        notes = [f"- F{n}: " + " / ".join(ln.strip() for ln in x.splitlines() if ln.strip())
                 for n, f in sorted((r or {"flows": {}})["flows"].items()) for x in f.get("notes", [])]
        if notes:
            lines += ["", f"## Notes from the last {label} run", ""] + notes
    if lu and lu.get("extras"):
        lines += ["", "## Extra checks (not SPEC 9 flows; reported, not gating)", "", "| Check | UI | Note |", "|---|---|---|"]
        names = {1: "Guided tour (SPEC 8 demo mode)"}
        for n, f in sorted(lu["extras"].items()):
            lines.append(f"| X{n} {names.get(n, '')} | {cell(f)} | {(f.get('error') or '').splitlines()[0][:160] if f.get('error') else ''} |")
    solo = sorted(RUNS.glob("solo-f4-*/tutor_cold.json")) if RUNS.exists() else []
    if solo:
        d = json.loads(solo[-1].read_text())
        t, v = d["text"]["marks"], d["voice"]["marks"]
        lines += ["", f"## Tutor latency on an idle speech chip ({solo[-1].parent.name}, questions not asked before)", "",
                  "| Ask | Transcribed | First text | Text done | First spoken | Last spoken |", "|---|---|---|---|---|---|",
                  f"| By text | | {t.get('first_text')} s | {t.get('text_done')} s | {t.get('first_audio')} s | {t.get('end')} s |",
                  f"| By voice | {v.get('transcribed')} s | {v.get('first_text')} s | {v.get('text_done')} s | {v.get('first_audio')} s | {v.get('end')} s |",
                  "", "S2 Pro ran at a real-time factor of about 3.7 here (host load about 35 from other work); at 2.4 on a quiet "
                  "host the first spoken clause would come about a third sooner. The text answer is on screen within about a second."]
    lines += ["", "## History", "", "| Run | Kind | Passed | Failed |", "|---|---|---|---|"]
    for r in reversed(rs[-20:]):
        if r.get("aborted"):
            lines.append(f"| {r['id']} | {r['kind']} | aborted | {r['aborted'][:160]} |")
            continue
        p = sum(1 for f in r["flows"].values() if f["outcome"] == "passed")
        failed = ", ".join(f"F{n}" for n, f in sorted(r["flows"].items()) if f["outcome"] != "passed") or "none"
        lines.append(f"| [{r['id']}](runs/{r['id']}/results.json) | {r['kind']} | {p}/{len(r['flows'])} | {failed} |")
    (QA / "RESULTS.md").write_text("\n".join(lines) + "\n")
    print(f"wrote {QA / 'RESULTS.md'}: API streak {streak(api)}, UI streak {streak(ui)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
