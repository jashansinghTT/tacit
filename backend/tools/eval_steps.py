"""Score step segmentation against the sample clips' ground truth.

    python backend/tools/eval_steps.py                    # every clip in ground_truth.json, steps from segment_steps()
    python backend/tools/eval_steps.py --stored           # the steps stored in each skill.json instead (after the writer)
    python backend/tools/eval_steps.py --skill smp_vase=sk_c28f1461 -v --json out.json

For each clip it takes a processed skill of that sample (its cached tracks.json), segments it with the
current `tacit.perception.timeline.segment_steps` (or reads the stored steps), and matches detected
steps one to one with ground-truth steps: a pair matches when their time ranges overlap with an IoU of
at least 0.3 (best pairs first). It prints precision, recall, the boundary error of matched pairs, and
whether the hand and the objects agree.

Hand: a ground-truth "both" accepts any hand. Objects: each ground-truth object is reduced to its head
noun ("black vase" -> "vase", "stems" -> "stem") and counts as found when that word appears in the
detected step's objects or its draft text.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tacit.perception.timeline import segment_steps  # noqa: E402

DATA = Path(os.environ.get("TACIT_DATA", Path.home() / "tacit" / "data"))
IOU_MIN = 0.3


def iou(a: tuple[float, float], b: tuple[float, float]) -> float:
    inter = max(0.0, min(a[1], b[1]) - max(a[0], b[0]))
    union = max(a[1], b[1]) - min(a[0], b[0])
    return inter / union if union > 0 else 0.0


def head_noun(phrase: str) -> str:
    w = phrase.lower().split()[-1]
    return w[:-1] if w.endswith("s") and not w.endswith("ss") else w


def match(det: list[dict], gt: list[dict]) -> list[tuple[int, int, float]]:
    """One-to-one (detected index, ground-truth index, IoU) pairs with IoU >= IOU_MIN, best first."""
    cands = sorted(((iou((d["t_start"], d["t_end"]), tuple(g["t"])), i, j)
                    for i, d in enumerate(det) for j, g in enumerate(gt)), reverse=True)
    used_d, used_g, pairs = set(), set(), []
    for v, i, j in cands:
        if v < IOU_MIN:
            break
        if i not in used_d and j not in used_g:
            used_d.add(i)
            used_g.add(j)
            pairs.append((i, j, v))
    return sorted(pairs, key=lambda p: p[1])


def score(det: list[dict], gt: list[dict]) -> dict:
    pairs = match(det, gt)
    m = len(pairs)
    starts = [abs(det[i]["t_start"] - gt[j]["t"][0]) for i, j, _ in pairs]
    ends = [abs(det[i]["t_end"] - gt[j]["t"][1]) for i, j, _ in pairs]
    hands, objs = [], []
    for i, j, _ in pairs:
        g, d = gt[j], det[i]
        hands.append(g["hand"] == "both" or g["hand"] == d.get("hand"))
        text = " ".join([*(d.get("objects") or []), d.get("draft") or ""]).lower()
        words = {head_noun(w) for w in text.replace(",", " ").split()}
        found = [head_noun(o) in words for o in g.get("objects", [])]
        objs.append(sum(found) / len(found) if found else 1.0)
    p = m / len(det) if det else 0.0
    r = m / len(gt) if gt else 0.0
    return {"detected": len(det), "ground_truth": len(gt), "matched": m,
            "precision": round(p, 3), "recall": round(r, 3), "f1": round(2 * p * r / (p + r), 3) if p + r else 0.0,
            "boundary_err_s": round(sum(starts + ends) / (2 * m), 2) if m else None,
            "start_err_s": round(sum(starts) / m, 2) if m else None, "end_err_s": round(sum(ends) / m, 2) if m else None,
            "hand_agree": round(sum(hands) / m, 3) if m else None,
            "objects_agree": round(sum(objs) / m, 3) if m else None,
            "pairs": [{"det": i, "gt": j, "iou": round(v, 3)} for i, j, v in pairs]}


def skills_for(clip: str) -> list[Path]:
    out = []
    for p in sorted((DATA / "skills").glob("*/skill.json")):
        try:
            sk = json.loads(p.read_text())
        except (OSError, ValueError):
            continue
        if (sk.get("source") or {}).get("sample_id") == clip and (p.parent / "tracks.json").exists():
            out.append(p.parent)
    return out


def detected_steps(skill_dir: Path, stored: bool) -> list[dict]:
    if stored:
        sk = json.loads((skill_dir / "skill.json").read_text())
        return [{"t_start": s["t_start"], "t_end": s["t_end"], "hand": s.get("hand"), "objects": s.get("objects", []),
                 "draft": f"{s.get('title', '')}. {s.get('instruction', '')}"} for s in sk.get("steps", [])]
    frames = json.loads((skill_dir / "tracks.json").read_text())["frames"]
    return segment_steps(frames)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--gt", default=str(DATA / "samples" / "ground_truth.json"))
    ap.add_argument("--skill", action="append", default=[], help="CLIP=SKILL_ID (default: the first processed skill of each clip)")
    ap.add_argument("--stored", action="store_true", help="score the steps stored in skill.json instead of re-segmenting")
    ap.add_argument("--json", help="write the full results here")
    ap.add_argument("-v", "--verbose", action="store_true", help="list every detected and ground-truth step")
    a = ap.parse_args()

    gt_all = {k: v for k, v in json.loads(Path(a.gt).read_text()).items() if isinstance(v, dict) and "steps" in v}
    chosen = dict(s.split("=", 1) for s in a.skill)
    results = {}
    for clip, gt in gt_all.items():
        if clip in chosen:
            sdir = DATA / "skills" / chosen[clip]
        else:
            found = skills_for(clip)
            if not found:
                print(f"{clip}: no processed skill with tracks.json; skipped")
                continue
            sdir = found[0]
        det = detected_steps(sdir, a.stored)
        res = score(det, gt["steps"])
        res["skill"] = sdir.name
        res["steps"] = [{k: s.get(k) for k in ("t_start", "t_end", "hand", "objects", "draft")} for s in det]
        results[clip] = res
        print(f"{clip} ({sdir.name}): {res['detected']} detected / {res['ground_truth']} ground truth, "
              f"precision {res['precision']:.2f}, recall {res['recall']:.2f}, F1 {res['f1']:.2f}, "
              f"boundary error {res['boundary_err_s']} s, hand {res['hand_agree']}, objects {res['objects_agree']}")
        if a.verbose:
            by_det = {p["det"]: p for p in res["pairs"]}
            for i, s in enumerate(det):
                p = by_det.get(i)
                tag = f"= gt {p['gt'] + 1} (IoU {p['iou']:.2f})" if p else "  (no match)"
                print(f"   det {i + 1:2d} [{s['t_start']:5.1f}, {s['t_end']:5.1f}] {str(s.get('hand')):5s} {tag:22s} "
                      f"{s.get('objects')} | {s.get('draft')}")
            hit = {p["gt"] for p in res["pairs"]}
            for j, g in enumerate(gt["steps"]):
                print(f"   gt  {j + 1:2d} [{g['t'][0]:5.1f}, {g['t'][1]:5.1f}] {g['hand']:5s} {'matched' if j in hit else 'MISSED':8s} "
                      f"{g['objects']} | {g['action']}")
    if results:
        p = sum(r["precision"] for r in results.values()) / len(results)
        r = sum(r["recall"] for r in results.values()) / len(results)
        print(f"mean over {len(results)} clips: precision {p:.2f}, recall {r:.2f}")
    if a.json:
        Path(a.json).write_text(json.dumps(results, indent=1) + "\n")


if __name__ == "__main__":
    main()
