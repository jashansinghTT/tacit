"""Rewrite stored tracks with each hand's side taken from the pose (the fix the MediaPipe runner now applies).

    python backend/tools/fix_track_sides.py                 # report, for every skill, how many hands change side
    python backend/tools/fix_track_sides.py --write sk_x    # rewrite those skills' tracks.json (backup: tracks.json.bak-sides)

Tracks analysed before the runner fix name the expert's right hand "left" nearly every time. Re-processing a
sample or uploaded video re-analyses it, so only live captures (whose tracks are the analysis) need this.
Segmentation already corrects sides itself; the twin, practice, audits and Reflex read them as stored.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tacit.perception.interactions import fix_sides  # noqa: E402

DATA = Path(os.environ.get("TACIT_DATA", Path.home() / "tacit" / "data"))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("skills", nargs="*", help="skill ids (default: every skill with a tracks.json)")
    ap.add_argument("--write", action="store_true", help="rewrite the tracks (default: only report)")
    a = ap.parse_args()
    dirs = [DATA / "skills" / s for s in a.skills] if a.skills else sorted(p.parent for p in (DATA / "skills").glob("*/tracks.json"))
    for d in dirs:
        path = d / "tracks.json"
        if not path.exists():
            print(f"{d.name}: no tracks.json")
            continue
        tracks = json.loads(path.read_text())
        kind = (json.loads((d / "skill.json").read_text()).get("source") or {}).get("kind") if (d / "skill.json").exists() else "?"
        hands = changed = 0
        fixed = []
        for f in tracks.get("frames", []):
            g = fix_sides(f)
            hands += len(f.get("hands", []))
            changed += sum(a_["side"] != b_["side"] for a_, b_ in zip(f.get("hands", []), g.get("hands", [])))
            fixed.append(g)
        print(f"{d.name} ({kind}): {changed} of {hands} hands change side" + (" -> rewritten" if a.write and changed else ""))
        if a.write and changed:
            shutil.copy2(path, path.with_name("tracks.json.bak-sides"))
            path.write_text(json.dumps({**tracks, "frames": fixed}))


if __name__ == "__main__":
    main()
