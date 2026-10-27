"""F6 Skill Exchange: listings, demo licensing with a royalty ledger, and the downloadable skill pack.

No payments: a license is a record and a receipt. The pack never contains video, keyframes or faces:
only motion, gaze, text, the robot program and policy, and the certificates.
"""
from __future__ import annotations

import io
import json
import zipfile
from collections import defaultdict
from pathlib import Path

from ..config import SKILLS
from ..db import LedgerEntry, License, Listing, SkillRow, User, now, select, session
from ..storage import load_skill, new_id, read_json, save_skill, tracks_path, twin_path

DEFAULT_PRICE = {"training": 49, "robot_deploy": 499, "exclusive": 9900}
DEFAULT_SPLIT = {"expert": 0.7, "plant": 0.3}
LICENSE_TERMS = {
    "training": "Use the lesson, SOP and motion data to train people inside your organisation. No robot deployment.",
    "robot_deploy": "Train and deploy robot policies from this skill on any number of robots you operate. Royalties are paid per license.",
    "exclusive": "As robot_deploy, and the skill is removed from the Exchange for 12 months.",
}


def _user(uid: str) -> dict:
    with session() as s:
        u = s.get(User, uid)
        return {"id": uid, "name": u.name if u else uid, "org": u.org if u else ""}


def listing_dict(l: Listing) -> dict:
    expert = _user(l.expert_id)
    skill = load_skill(l.skill_id) or {}
    ver = (skill.get("verification") or {})
    thumb = skill.get("motion_thumb", "") if l.thumb.endswith("/thumb.jpg") or not l.thumb else l.thumb
    # The skill's current text: a reprocessed skill updates its listing too.
    return {"id": l.id, "skill_id": l.skill_id, "title": skill.get("title") or l.title, "summary": skill.get("summary") or l.summary,
            "thumb": thumb,
            "preview_video": l.preview_video, "expert": {"id": expert["id"], "name": expert["name"]}, "plant": l.plant,
            "industry": l.industry, "robot_types": json.loads(l.robot_types), "verified": ver.get("status") == "verified",
            "verification_score": ver.get("score"), "consent": json.loads(l.consent or "{}"), "price": json.loads(l.price),
            "currency": l.currency, "royalty_split": json.loads(l.royalty_split), "licenses_sold": l.licenses_sold,
            "rating": l.rating, "created_at": l.created_at, "demo": l.demo,
            "steps_count": len(skill.get("steps", [])), "duration": (skill.get("source") or {}).get("duration")}


def list_listings(q: str = "", industry: str = "", robot: str = "", verified: bool | None = None,
                  include_test: bool = False) -> list[dict]:
    with session() as s:
        rows = [l for l in s.exec(select(Listing)).all() if "withdrawn_until" not in (l.consent or "")]
        if not include_test:
            test_ids = {r.id for r in s.exec(select(SkillRow).where(SkillRow.test == True)).all()}  # noqa: E712
            rows = [l for l in rows if l.skill_id not in test_ids]
    out = [listing_dict(l) for l in rows]
    if q:
        ql = q.lower()
        out = [l for l in out if ql in (l["title"] + " " + l["summary"]).lower()]
    if industry:
        out = [l for l in out if l["industry"].lower() == industry.lower()]
    if robot:
        out = [l for l in out if robot in l["robot_types"]]
    if verified is not None:
        out = [l for l in out if l["verified"] == verified]
    return sorted(out, key=lambda l: l["created_at"], reverse=True)


def get_listing(listing_id: str) -> dict | None:
    with session() as s:
        l = s.get(Listing, listing_id)
    if not l:
        return None
    d = listing_dict(l)
    skill = public_skill(load_skill(l.skill_id) or {})
    demos = SKILLS / l.skill_id / "robot" / "demos"
    d.update({"skill": skill, "terms": LICENSE_TERMS,
              "contents": {"steps": len(skill.get("steps", [])), "episodes": _count_episodes(demos),
                           "hours_of_motion": round(((skill.get("source") or {}).get("duration") or 0) / 3600, 3),
                           "formats": ["tacit-json", "lerobot"] if demos.exists() else ["tacit-json"],
                           "policy": (skill.get("robot") or {}).get("policy", {}).get("status") == "trained"}})
    return d


def _count_episodes(demos: Path) -> int:
    meta = demos / "meta.json"
    if meta.exists():
        return int(read_json(meta, {}).get("episodes", 0))
    return len(list(demos.glob("episode_*"))) if demos.exists() else 0


def public_skill(skill: dict) -> dict:
    """What a buyer may see: no source video, no keyframes (they show the person)."""
    out = {k: v for k, v in skill.items() if k not in ("source", "thumb", "narration")}
    out["steps"] = [{k: v for k, v in st.items() if k != "keyframe"} for st in skill.get("steps", [])]
    out["source"] = {"duration": (skill.get("source") or {}).get("duration"), "kind": (skill.get("source") or {}).get("kind")}
    out["qa"] = [{"question": q.get("question"), "answer": q.get("answer")} for q in skill.get("qa", []) if q.get("answer")]
    return out


class ListingError(ValueError):
    pass


def create_listing(skill_id: str, body: dict, user_id: str) -> dict:
    skill = load_skill(skill_id)
    if not skill or skill.get("status") != "ready":
        raise ListingError("Only a ready skill can be listed.")
    if (skill.get("verification") or {}).get("status") != "verified":
        raise ListingError("Only skills verified as real recordings can be listed. Run Check first.")
    consent = body.get("consent") or {}
    if not consent.get("expert_confirmed"):
        raise ListingError("The expert must confirm consent before listing.")
    consent = {"motion": True, "gaze": True, "voice_text": bool(consent.get("voice_text", True)), "raw_video": False,
               "face": False, "expert_confirmed": True, "signed_by": skill["expert"]["id"], "signed_at": now()}
    lid = new_id("lst")
    split = body.get("royalty_split") or DEFAULT_SPLIT
    total = float(split.get("expert", 0.7)) + float(split.get("plant", 0.3))
    split = {"expert": round(float(split.get("expert", 0.7)) / total, 3), "plant": round(float(split.get("plant", 0.3)) / total, 3)}
    # Buyers see a motion-only preview (no video pixels), never a frame of the expert.
    row = Listing(id=lid, skill_id=skill_id, title=skill["title"], summary=skill.get("summary", ""), thumb=skill.get("motion_thumb", ""),
                  preview_video=f"/api/skills/{skill_id}/twin", expert_id=skill["expert"]["id"],
                  plant=body.get("plant") or "Northline Assembly, Plant 2", industry=body.get("industry") or "Manufacturing",
                  robot_types=json.dumps(body.get("robot_types") or ["franka"]),
                  price=json.dumps({**DEFAULT_PRICE, **(body.get("price") or {})}), royalty_split=json.dumps(split),
                  consent=json.dumps(consent), demo=bool(body.get("demo", False)))
    with session() as s:
        s.add(row)
        s.commit()
        s.refresh(row)
    skill["listing_id"] = lid
    skill["consent"] = consent
    save_skill(skill)
    return listing_dict(row)


def license_listing(listing_id: str, license_type: str, buyer_id: str) -> dict:
    with session() as s:
        l = s.get(Listing, listing_id)
        if not l:
            raise ListingError("No such listing.")
        prices = json.loads(l.price)
        if license_type not in prices:
            raise ListingError(f"Unknown license type {license_type}.")
        amount = float(prices[license_type])
        split = json.loads(l.royalty_split)
        lic = License(id=new_id("lic"), listing_id=listing_id, buyer_id=buyer_id, license_type=license_type, amount=amount)
        s.add(lic)
        royalties = [{"to": l.expert_id, "amount": round(amount * split["expert"], 2)},
                     {"to": "plant", "amount": round(amount * split["plant"], 2)}]
        for r in royalties:
            s.add(LedgerEntry(to_id=r["to"], listing_id=listing_id, license_id=lic.id, amount=r["amount"]))
        l.licenses_sold += 1
        if license_type == "exclusive":
            l.demo = True   # reused as "withdrawn": exclusive for 12 months
            l.consent = json.dumps({**json.loads(l.consent or "{}"), "withdrawn_until": "exclusive license, 12 months"})
        s.add(l)
        s.commit()
        lic_id = lic.id
    return {"license_id": lic_id, "receipt": {"amount": amount, "currency": "USD", "license_type": license_type,
                                              "royalties": royalties, "demo": True, "issued_at": now()},
            "download": f"/api/exchange/licenses/{lic_id}/pack.zip"}


def library(buyer_id: str) -> list[dict]:
    with session() as s:
        lics = s.exec(select(License).where(License.buyer_id == buyer_id)).all()
        out = []
        for lic in lics:
            l = s.get(Listing, lic.listing_id)
            out.append({"license": {"id": lic.id, "license_type": lic.license_type, "amount": lic.amount, "currency": lic.currency,
                                    "created_at": lic.created_at, "download": f"/api/exchange/licenses/{lic.id}/pack.zip"},
                        "listing": listing_dict(l) if l else None})
    return sorted(out, key=lambda r: r["license"]["created_at"], reverse=True)


def earnings(user_id: str) -> dict:
    with session() as s:
        rows = s.exec(select(LedgerEntry).where(LedgerEntry.to_id == user_id)).all()
        entries = []
        by_month: dict[str, float] = defaultdict(float)
        for e in rows:
            lic = s.get(License, e.license_id)
            l = s.get(Listing, e.listing_id)
            buyer = s.get(User, lic.buyer_id) if lic else None
            entries.append({"at": e.at, "listing_id": e.listing_id, "skill_title": l.title if l else "",
                            "buyer": buyer.org or buyer.name if buyer else (lic.buyer_id if lic else ""),
                            "license_type": lic.license_type if lic else "", "amount": e.amount})
            by_month[e.at[:7]] += e.amount
    entries.sort(key=lambda r: r["at"], reverse=True)
    return {"total": round(sum(e["amount"] for e in entries), 2), "currency": "USD",
            "by_month": sorted([[m, round(v, 2)] for m, v in by_month.items()]), "entries": entries}


def build_pack(license_id: str) -> tuple[bytes, str]:
    with session() as s:
        lic = s.get(License, license_id)
        if not lic:
            raise ListingError("No such license.")
        l = s.get(Listing, lic.listing_id)
    skill = load_skill(l.skill_id) or {}
    pub = public_skill(skill)
    buf = io.BytesIO()
    root = f"tacit-skill-{l.skill_id}"
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{root}/skill.json", json.dumps(pub, indent=2, ensure_ascii=False))
        tracks = read_json(tracks_path(l.skill_id)) or {}
        for f in tracks.get("frames", []):
            f.pop("served_by", None)
            f.pop("timing_ms", None)
            f.pop("head", None)
        z.writestr(f"{root}/motion/tracks.json", json.dumps(tracks))
        twin = read_json(twin_path(l.skill_id))
        if twin:
            z.writestr(f"{root}/motion/twin.json", json.dumps(twin))
        z.writestr(f"{root}/SOP.md", skill.get("sop_markdown") or f"# {skill.get('title')}\n")
        z.writestr(f"{root}/certificates/verification.json", json.dumps(skill.get("verification") or {}, indent=2))
        z.writestr(f"{root}/certificates/consent.json", json.dumps(skill.get("consent") or {}, indent=2))
        z.writestr(f"{root}/LICENSE.txt", f"Tacit skill license ({lic.license_type})\nLicense {lic.id}, issued {lic.created_at} to "
                                          f"{lic.buyer_id}.\n\n{LICENSE_TERMS.get(lic.license_type, '')}\n\nDemo license: no payment was taken.\n")
        robot_dir = SKILLS / l.skill_id / "robot"
        z.writestr(f"{root}/robot/program.json", json.dumps((skill.get("robot") or {}).get("program", []), indent=2))
        if robot_dir.exists():
            for p in robot_dir.rglob("*"):
                if p.is_file() and p.stat().st_size < 200_000_000:
                    z.write(p, f"{root}/robot/{p.relative_to(robot_dir)}")
        z.writestr(f"{root}/README.md", f"# {skill.get('title')}\n\n{skill.get('summary', '')}\n\nRecorded by {skill.get('expert', {}).get('name')}. "
                                        "Contents: motion tracks and digital twin (no video, no faces), the standard work instruction, "
                                        "the robot program and any trained policy and demonstrations, and the consent and verification "
                                        "certificates.\n")
    return buf.getvalue(), f"{root}.zip"


__all__ = ["list_listings", "get_listing", "create_listing", "license_listing", "library", "earnings", "build_pack",
           "ListingError", "SkillRow"]


def delete_listing(listing_id: str, require_test: bool = True) -> dict:
    with session() as s:
        l = s.get(Listing, listing_id)
        if not l:
            raise ListingError("No such listing.")
        row = s.get(SkillRow, l.skill_id)
        if require_test and not (row and row.test):
            raise ListingError("Only listings of test skills can be deleted.")
        lics = s.exec(select(License).where(License.listing_id == listing_id)).all()
        for e in s.exec(select(LedgerEntry).where(LedgerEntry.listing_id == listing_id)).all():
            s.delete(e)
        for lic in lics:
            s.delete(lic)
        s.delete(l)
        s.commit()
    skill = load_skill(l.skill_id)
    if skill and skill.get("listing_id") == listing_id:
        skill["listing_id"] = None
        save_skill(skill)
    return {"ok": True, "licenses_removed": len(lics)}


def delete_listings_of(skill_id: str) -> int:
    """When a skill is deleted, its listings, licenses and royalties go with it."""
    with session() as s:
        ids = [l.id for l in s.exec(select(Listing).where(Listing.skill_id == skill_id)).all()]
    for lid in ids:
        delete_listing(lid, require_test=False)
    return len(ids)
