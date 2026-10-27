"""Paths, ports and model endpoints (from deploy/stack.yaml, overridable by env)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import yaml

ROOT = Path(os.environ.get("TACIT_ROOT", Path(__file__).resolve().parents[2]))
DATA = Path(os.environ.get("TACIT_DATA", ROOT / "data"))
MEDIA = DATA / "media"
SKILLS = DATA / "skills"
SAMPLES = DATA / "samples"
MODELS_DIR = DATA / "models"
DB_PATH = DATA / "tacit.db"
WEB_DIST = ROOT / "web" / "dist"
WEB_PUBLIC = ROOT / "web" / "public"
STACK_FILE = ROOT / "deploy" / "stack.yaml"

VERSION = "0.1.0"


@dataclass(frozen=True)
class Endpoint:
    name: str        # display name
    key: str         # stable key used in code and env overrides
    role: str        # what it does, for the Box page
    chip: int
    url: str
    health: str
    group: str


def _stack() -> dict:
    try:
        return yaml.safe_load(STACK_FILE.read_text()) or {}
    except FileNotFoundError:
        return {}


def endpoints() -> dict[str, Endpoint]:
    """Every model endpoint the backend talks to, keyed by `Endpoint.key`."""
    st = _stack()
    host = st.get("host", "127.0.0.1")
    g = st.get("groups", {})

    def port(group: str, member: str | None, default: int) -> int:
        grp = g.get(group, {})
        if member:
            return int(grp.get("members", {}).get(member, {}).get("port", default))
        return int(grp.get("port", default))

    vision_group = "tacit-vision" if st.get("vision_layout") == "cohost" else "vision (standalone)"
    rows = [
        ("HaMeR", "hamer", "3D hands", 0, port("vision-cohost", "hamer", 21000), "/health", vision_group),
        ("Gaze-LLE", "gaze", "gaze target", 0, port("vision-cohost", "gaze", 21001), "/health", vision_group),
        ("RF-DETR", "rfdetr", "parts and objects", 0, port("vision-cohost", "rfdetr", 21002), "/health", vision_group),
        ("VGGT-1B", "vggt", "3D rebuild, verification", 0, port("vision-cohost", "vggt", 21003), "/health", vision_group),
        ("Whisper large-v3", "whisper", "speech to text", 1, port("speech", "whisper", 21010), "/health", "cohost-speech"),
        ("S2 Pro", "tts", "text to speech", 1, port("speech", "s2pro", 21011), "/v1/models", "cohost-speech"),
        ("MiniMax Music 3", "music", "lesson music", 1, port("speech", "music3", 21012), "/v1/models", "cohost-speech"),
        ("gpt-oss-20b", "llm", "coach, writer, tutor", 2, port("llm", None, 21020), "/v1/models", "gpt-oss-20b-fast"),
        ("GR00T N1.7", "gr00t", "robot foundation policy", 3, port("gr00t", None, 21030), "/health", "gr00t"),
    ]
    out: dict[str, Endpoint] = {}
    for name, key, role, chip, p, health, group in rows:
        url = os.environ.get(f"TACIT_{key.upper()}_URL", f"http://{host}:{p}")
        out[key] = Endpoint(name, key, role, chip, url, health, group)
    return out


def llm_model_id() -> str:
    return os.environ.get("TACIT_LLM_MODEL", _stack().get("groups", {}).get("llm", {}).get("model_id", "openai/gpt-oss-20b"))


def cohost_status_ports() -> dict[int, int]:
    """chip -> cohost status port, for the device memory numbers on the Box page."""
    g = _stack().get("groups", {})
    out = {}
    if _stack().get("vision_layout") == "cohost":
        out[0] = int(g.get("vision-cohost", {}).get("status_port", 21004))
    out[1] = int(g.get("speech", {}).get("status_port", 21013))
    return out


def backend_bind() -> tuple[str, int]:
    b = _stack().get("backend", {})
    return os.environ.get("TACIT_HOST", b.get("host", "127.0.0.1")), int(os.environ.get("TACIT_PORT", b.get("port", 8710)))


for d in (DATA, MEDIA, SKILLS, SAMPLES, MODELS_DIR, MEDIA / "tts", MEDIA / "skills", MEDIA / "samples", MEDIA / "certs"):
    d.mkdir(parents=True, exist_ok=True)
