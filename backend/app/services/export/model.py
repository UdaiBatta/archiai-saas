"""One building model for every export format (DXF, IFC, GLB/OBJ, SVG).

Built from a LayoutPlan: rooms as outlines, walls as centre lines with their
door and window openings, per storey. Plan space is y-down (y grows south);
CAD and BIM tools expect y-up with north at the top, so `north_up` flips it.
Every writer reads this, so all formats show the same building.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from math import hypot

from app.config.mvp_defaults import WALL_HEIGHT_M
from app.schemas.layout_plan import LayoutPlan

DOOR_HEIGHT_M = 2.1
WINDOW_SILL_M = 0.9
WINDOW_HEAD_M = 2.1
SLAB_THICKNESS_M = 0.15


@dataclass(frozen=True)
class Opening:
    kind: str  # "door" | "window"
    id: str
    start: float  # metres along the wall from (x1, y1)
    end: float
    sill: float
    head: float

    @property
    def width(self) -> float:
        return self.end - self.start


@dataclass(frozen=True)
class WallGeom:
    id: str
    x1: float
    y1: float
    x2: float
    y2: float
    thickness: float
    floor: int
    exterior: bool
    openings: tuple[Opening, ...] = ()

    @property
    def length(self) -> float:
        return hypot(self.x2 - self.x1, self.y2 - self.y1)

    def point_at(self, along: float) -> tuple[float, float]:
        t = along / self.length if self.length else 0.0
        return (self.x1 + (self.x2 - self.x1) * t, self.y1 + (self.y2 - self.y1) * t)

    def solid_spans(self) -> list[tuple[float, float]]:
        """Stretches of full-height wall between openings (metres along)."""
        spans, start = [], 0.0
        for opening in sorted(self.openings, key=lambda o: o.start):
            if opening.start > start:
                spans.append((start, opening.start))
            start = max(start, opening.end)
        if start < self.length:
            spans.append((start, self.length))
        return spans


@dataclass(frozen=True)
class RoomGeom:
    id: str
    label: str
    type: str
    floor: int
    points: tuple[tuple[float, float], ...]  # plan space, counter-clockwise not guaranteed

    @property
    def area(self) -> float:
        pts = self.points
        return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1]))) / 2

    @property
    def centroid(self) -> tuple[float, float]:
        xs, ys = zip(*self.points)
        return (sum(xs) / len(xs), sum(ys) / len(ys))


@dataclass
class Building:
    width: float
    depth: float
    floors: list[int]
    rooms: list[RoomGeom] = field(default_factory=list)
    walls: list[WallGeom] = field(default_factory=list)

    def north_up(self, x: float, y: float) -> tuple[float, float]:
        """Plan (y grows south) -> drawing (y grows north)."""
        return (x, self.depth - y)

    @staticmethod
    def elevation(floor: int) -> float:
        return floor * WALL_HEIGHT_M


def building_from_plan(plan: LayoutPlan) -> Building:
    openings: dict[str, list[Opening]] = {}
    for door in plan.doors:
        openings.setdefault(door.wall_ref, []).append(
            Opening("door", door.id, door.offset, door.offset + door.width, 0.0, DOOR_HEIGHT_M)
        )
    for window in plan.windows:
        openings.setdefault(window.wall_ref, []).append(
            Opening("window", window.id, window.offset, window.offset + window.width, WINDOW_SILL_M, WINDOW_HEAD_M)
        )
    walls = [
        WallGeom(
            id=w.id, x1=w.x1, y1=w.y1, x2=w.x2, y2=w.y2, thickness=w.thickness, floor=w.floor,
            exterior=w.rooms is None, openings=tuple(openings.get(w.id, ())),
        )
        for w in plan.walls
        if w.kind != "open"
    ]
    rooms = [
        RoomGeom(
            id=r.id, label=r.label, type=r.type, floor=r.floor,
            points=tuple((v.x, v.y) for v in r.vertices) if r.vertices else (
                (r.x, r.y), (r.x + r.w, r.y), (r.x + r.w, r.y + r.h), (r.x, r.y + r.h)
            ),
        )
        for r in plan.rooms
    ]
    floors = sorted({r.floor for r in plan.rooms} | {w.floor for w in walls}) or [0]
    return Building(width=plan.plot.width_m, depth=plan.plot.depth_m, floors=floors, rooms=rooms, walls=walls)
