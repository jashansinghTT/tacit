"""Robot programs: parse `[{"op": "pick", ...}, {"op": "place", ...}]` into a scene layout.

A program comes from the skill's `robot.program` (written by the LLM from the expert's capture),
so names are free text ("bracket", "cup", "left bin", "kit tray"). Every object name maps to a
graspable primitive (box or cylinder) with a stable colour; every target becomes an open bin on
the table's far edge. Ops other than pick and place are kept in `ignored_ops` and skipped.
"""

from __future__ import annotations

import re
import zlib
from dataclasses import dataclass, field

MAX_OBJECTS = 6
MAX_TARGETS = 5

# Object colours: saturated, distinct against the graphite table and in the web viewer.
OBJECT_PALETTE = [
    (0.95, 0.42, 0.13),  # orange
    (0.16, 0.62, 0.98),  # blue
    (0.98, 0.80, 0.18),  # yellow
    (0.30, 0.82, 0.42),  # green
    (0.88, 0.25, 0.48),  # magenta
    (0.62, 0.45, 0.95),  # violet
    (0.15, 0.85, 0.80),  # teal
    (0.92, 0.30, 0.25),  # red
]
# Bin colours: muted, so the objects stand out.
TARGET_PALETTE = [
    (0.34, 0.38, 0.44),
    (0.42, 0.36, 0.30),
    (0.30, 0.40, 0.36),
    (0.38, 0.34, 0.44),
    (0.44, 0.40, 0.30),
]

# Names that read as round things become cylinders; everything else becomes a box.
_CYLINDER_WORDS = {
    "cup", "mug", "bottle", "can", "glass", "vase", "bolt", "screw", "pin", "peg", "rod",
    "cylinder", "tube", "pipe", "roll", "battery", "marker", "pen", "spool", "nut", "jar",
    "cap", "lid", "washer", "bearing", "dowel", "spray", "candle", "orange", "apple", "ball",
    "wine", "tin", "plug", "valve", "knob", "fitting",
}
# Long, flat things become slim boxes (grasped across the short side).
_SLIM_WORDS = {
    "scissors", "knife", "spoon", "fork", "remote", "phone", "toothbrush", "ruler", "wrench",
    "screwdriver", "spatula", "key", "tool", "plier", "pliers", "file", "strip", "bar", "rail",
}

# Half sizes in metres. Box: (x, y, z); x is the grasp axis (short side, <= 2.4 cm).
# Cylinder: (radius, half height).
_BOX = (0.020, 0.020, 0.020)
_SLIM = (0.016, 0.045, 0.014)
_CYL = (0.020, 0.032)
_TALL_CYL = (0.020, 0.042)


@dataclass
class ObjectSpec:
    name: str            # display name, as in the program
    uid: str             # MuJoCo-safe id
    kind: str            # "box" | "cylinder"
    size: tuple          # half sizes, see above
    rgba: tuple
    mass: float

    @property
    def half_height(self) -> float:
        return self.size[2] if self.kind == "box" else self.size[1]

    @property
    def grasp_half_width(self) -> float:
        return self.size[0]

    @property
    def yaw_period(self) -> float:
        """Rotation about z that maps the grasp onto itself."""
        import math

        if self.kind == "cylinder":
            return 0.0  # any yaw works
        if abs(self.size[0] - self.size[1]) < 1e-6:
            return math.pi / 2
        return math.pi


@dataclass
class TargetSpec:
    name: str
    uid: str
    pos: tuple           # (x, y) centre on the table
    inner_half: float    # inner half size of the square bin
    wall_height: float
    rgba: tuple


@dataclass
class Task:
    index: int
    object: str          # object display name
    target: str | None   # target display name, None = put it back down where it was picked


@dataclass
class Layout:
    ops: list[dict]
    tasks: list[Task]
    objects: list[ObjectSpec]
    targets: list[TargetSpec]
    ignored_ops: list[dict] = field(default_factory=list)

    def object(self, name: str) -> ObjectSpec:
        return next(o for o in self.objects if o.name == name)

    def target(self, name: str) -> TargetSpec:
        return next(t for t in self.targets if t.name == name)


def _clean(name) -> str:
    return re.sub(r"\s+", " ", str(name or "").strip())


def _uid(prefix: str, name: str, taken: set[str]) -> str:
    base = prefix + (re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "x")
    uid, k = base, 2
    while uid in taken:
        uid, k = f"{base}_{k}", k + 1
    taken.add(uid)
    return uid


def _words(name: str) -> set[str]:
    words = set(re.findall(r"[a-z]+", name.lower()))
    # crude singular forms: "bolts" -> "bolt", "scissors" stays in the slim set
    return words | {w[:-1] for w in words if w.endswith("s") and len(w) > 3}


def object_primitive(name: str) -> tuple[str, tuple]:
    words = _words(name)
    if words & _CYLINDER_WORDS:
        tall = bool(words & {"bottle", "can", "vase", "jar", "spray", "candle", "tube", "wine"})
        return "cylinder", _TALL_CYL if tall else _CYL
    if words & _SLIM_WORDS:
        return "box", _SLIM
    return "box", _BOX


def _pick_colour(name: str, palette: list, used: set[int]) -> tuple:
    k = zlib.crc32(name.lower().encode()) % len(palette)
    for i in range(len(palette)):
        j = (k + i) % len(palette)
        if j not in used:
            used.add(j)
            return palette[j]
    return palette[k]


def normalize_program(program) -> tuple[list[dict], list[Task], list[dict]]:
    """Return (ops, tasks, ignored_ops). Tolerant of LLM-written programs.

    A pick is paired with the next place. A pick with no place before the next pick (or the end)
    becomes a task with target None. A place with no pending pick is ignored.
    """
    if isinstance(program, dict):
        program = program.get("program", program.get("steps", []))
    ops, ignored, tasks = [], [], []
    pending: str | None = None
    for raw in program or []:
        if not isinstance(raw, dict):
            ignored.append({"op": str(raw)})
            continue
        op = _clean(raw.get("op") or raw.get("action") or raw.get("type")).lower()
        if op in ("pick", "grasp", "pick_up", "pickup", "take", "grab"):
            obj = _clean(raw.get("object") or raw.get("item") or raw.get("target"))
            if not obj:
                ignored.append(dict(raw))
                continue
            if pending is not None:
                tasks.append(Task(len(tasks), pending, None))
            pending = obj
            ops.append({"op": "pick", "object": obj})
        elif op in ("place", "put", "drop", "insert", "release"):
            tgt = _clean(raw.get("target") or raw.get("location") or raw.get("bin") or raw.get("to"))
            if pending is None or not tgt:
                ignored.append(dict(raw))
                continue
            tasks.append(Task(len(tasks), pending, tgt))
            pending = None
            ops.append({"op": "place", "target": tgt})
        else:
            ignored.append(dict(raw))
    if pending is not None:
        tasks.append(Task(len(tasks), pending, None))
    return ops, tasks, ignored


def _bin_layout(names: list[str]) -> list[tuple[str, float]]:
    """Order bins along y (the robot's left is +y): names with "left" go left, "right" go right."""
    def side(n: str) -> int:
        w = _words(n)
        return 0 if "left" in w else 2 if "right" in w else 1

    ordered = sorted(names, key=lambda n: (side(n), names.index(n)))
    n = len(ordered)
    spacing = {1: 0.0, 2: 0.34, 3: 0.24, 4: 0.165, 5: 0.135}[n]
    ys = [spacing * ((n - 1) / 2 - i) for i in range(n)]
    return list(zip(ordered, ys))


BIN_X = 0.64
BIN_WALL = 0.045


def parse_program(program) -> Layout:
    ops, tasks, ignored = normalize_program(program)
    obj_names: list[str] = []
    tgt_names: list[str] = []
    for t in tasks:
        if t.object not in obj_names:
            obj_names.append(t.object)
        if t.target and t.target not in tgt_names:
            tgt_names.append(t.target)
    if len(obj_names) > MAX_OBJECTS:
        raise ValueError(f"program uses {len(obj_names)} objects; the sim table fits {MAX_OBJECTS}")
    if len(tgt_names) > MAX_TARGETS:
        raise ValueError(f"program uses {len(tgt_names)} targets; the sim table fits {MAX_TARGETS}")

    taken: set[str] = set()
    used: set[int] = set()
    objects = []
    for name in obj_names:
        kind, size = object_primitive(name)
        objects.append(ObjectSpec(name, _uid("obj_", name, taken), kind, size,
                                  (*_pick_colour(name, OBJECT_PALETTE, used), 1.0),
                                  mass=0.06 if kind == "box" else 0.05))
    used = set()
    targets = []
    if tgt_names:
        inner = {1: 0.07, 2: 0.07, 3: 0.07, 4: 0.062, 5: 0.052}[len(tgt_names)]
        for name, y in _bin_layout(tgt_names):
            targets.append(TargetSpec(name, _uid("bin_", name, taken), (BIN_X, y), inner, BIN_WALL,
                                      (*_pick_colour(name, TARGET_PALETTE, used), 1.0)))
        targets.sort(key=lambda t: tgt_names.index(t.name))
    return Layout(ops, tasks, objects, targets, ignored)
