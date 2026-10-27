#!/usr/bin/env python3
"""Remove what a browser run made (listed in <run>/created.json by flows.spec.ts).

  teardown.py <run_dir> <playwright_exit_status>

Listings go always (with their licenses and ledger entries, so QA royalties never reach the demo's earnings);
skills go only when the run passed, and are kept for the owners to inspect otherwise. QA_KEEP=1 keeps everything.
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

BASE = os.environ.get("TACIT_URL", "http://127.0.0.1:8710").rstrip("/")


def delete(path: str) -> int:
    req = urllib.request.Request(BASE + path, method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def main() -> int:
    run_dir, status = Path(sys.argv[1]), int(sys.argv[2])
    made_file = run_dir / "created.json"
    if os.environ.get("QA_KEEP") or not made_file.exists():
        return 0
    made = json.loads(made_file.read_text())
    done = [f"listing {lid}: {delete(f'/api/exchange/listings/{lid}')}" for lid in made.get("listings", [])]
    if status == 0:
        done += [f"skill {sid}: {delete(f'/api/skills/{sid}')}" for sid in made.get("skills", [])]
    elif made.get("skills"):
        done.append(f"kept skills for inspection: {', '.join(made['skills'])}")
    (run_dir / "cleanup.txt").write_text("\n".join(done) + "\n")
    print("teardown:", "; ".join(done) or "nothing to remove")
    return 0


if __name__ == "__main__":
    sys.exit(main())
