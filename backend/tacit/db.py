"""SQLite tables. A skill's full record lives on disk as skill.json; the row is for listing and search."""
from __future__ import annotations

import datetime as dt
from contextlib import contextmanager
from typing import Iterator, Optional

from sqlmodel import Field, Session, SQLModel, create_engine, select

from .config import DB_PATH

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class User(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    role: str                     # expert | trainee | manager | buyer
    title: str = ""
    avatar: str = ""
    org: str = ""


class SkillRow(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str = "Untitled skill"
    summary: str = ""
    status: str = "draft"
    expert_id: str = "u_maria"
    created_at: str = Field(default_factory=now)
    updated_at: str = Field(default_factory=now)
    thumb: str = ""
    duration: float = 0.0
    steps_count: int = 0
    verification_status: str = "pending"
    listing_id: Optional[str] = None
    source_kind: str = "upload"
    sample_id: Optional[str] = None


class JobRow(SQLModel, table=True):
    id: str = Field(primary_key=True)
    kind: str
    skill_id: Optional[str] = None
    status: str = "queued"
    progress: float = 0.0
    stage: str = ""
    created_at: str = Field(default_factory=now)
    finished_at: Optional[str] = None
    error: Optional[str] = None
    payload: str = "{}"          # full job JSON (stages, result)


class LessonProgress(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    trainee_id: str
    skill_id: str
    steps_done: int = 0
    steps_total: int = 0
    best_score: float = 0.0
    passed: bool = False
    quiz_score: Optional[float] = None
    certificate: Optional[str] = None
    updated_at: str = Field(default_factory=now)


class Listing(SQLModel, table=True):
    id: str = Field(primary_key=True)
    skill_id: str
    title: str
    summary: str = ""
    thumb: str = ""
    preview_video: str = ""
    expert_id: str
    plant: str = "Northline Assembly, Plant 2"
    industry: str = "Manufacturing"
    robot_types: str = '["franka"]'
    price: str = '{"training": 49, "robot_deploy": 499, "exclusive": 9900}'
    currency: str = "USD"
    royalty_split: str = '{"expert": 0.7, "plant": 0.3}'
    consent: str = "{}"
    licenses_sold: int = 0
    rating: float = 0.0
    created_at: str = Field(default_factory=now)
    demo: bool = False


class License(SQLModel, table=True):
    id: str = Field(primary_key=True)
    listing_id: str
    buyer_id: str
    license_type: str
    amount: float
    currency: str = "USD"
    created_at: str = Field(default_factory=now)


class LedgerEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    at: str = Field(default_factory=now)
    to_id: str                    # user id, or "plant"
    listing_id: str
    license_id: str
    amount: float
    currency: str = "USD"
    kind: str = "royalty"


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


@contextmanager
def session() -> Iterator[Session]:
    with Session(engine) as s:
        yield s


__all__ = ["User", "SkillRow", "JobRow", "LessonProgress", "Listing", "License", "LedgerEntry",
           "init_db", "session", "select", "now", "engine"]
