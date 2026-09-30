"""Rule-checked automatic furnishing of a LayoutPlan (pure, deterministic).

Per room, the pieces of its program (``catalog.program_for``) are placed one
at a time, most important first. Wall pieces slide along each solid wall of
the room; free-standing pieces (the dining table) try a grid over the room.
Every candidate must pass the hard checks, and among the ones that pass the
soft preferences pick the winner:

Hard (``violations`` re-checks all of them on a finished result):
  * the piece and its clearance strips stay inside the room (walls inset by
    half a wall thickness);
  * no piece overlaps another piece or another piece's clearance, and no
    clearance holds a piece;
  * nothing stands in a door's swing square (door width x door width, on
    both sides of the wall: which way a door opens is not in the plan);
  * nothing taller than the window sill stands in a window's zone.
Wall pieces also only back onto a solid wall, never an open edge.

Soft: beds rather not under a window; the next wall piece rather on another
wall; beds and sofas centred on their wall, wardrobes / counters / showers
in a corner, tables in the middle of the room.
"""
from __future__ import annotations

from dataclasses import dataclass

from shapely.geometry import box
from shapely.prepared import prep

from app.schemas.furnishing import FurnitureItem
from app.schemas.layout_plan import LayoutPlan, PlanRoom
from app.services.furnishing.catalog import WINDOW_SILL_M, WINDOW_ZONE_M, Slot, Spec, program_for
from app.services.layout_engine.polygon import room_to_polygon

Box = tuple[float, float, float, float]  # x0, y0, x1, y1

INSET = 0.06  # half a wall: furniture stops at the wall face, not its centre line
STEP = 0.05  # candidate spacing along a wall / over the room
ON_LINE = 0.01  # a wall lies on a room edge within 1 cm
TOL = 1e-4  # overlaps thinner than this are touching, not overlapping

# rotation -> (cos, sin) about the vertical axis, as three.js turns rotation.y
_TURN = {0: (1, 0), 90: (0, 1), 180: (-1, 0), 270: (0, -1)}


def _overlaps(a: Box, b: Box) -> bool:
    return min(a[2], b[2]) - max(a[0], b[0]) > TOL and min(a[3], b[3]) - max(a[1], b[1]) > TOL


def _local_box(cx: float, cy: float, rot: int, lx0: float, lz0: float, lx1: float, lz1: float) -> Box:
    c, s = _TURN[rot]
    xs, ys = [], []
    for x in (lx0, lx1):
        for z in (lz0, lz1):
            xs.append(cx + x * c + z * s)
            ys.append(cy - x * s + z * c)
    return (round(min(xs), 4), round(min(ys), 4), round(max(xs), 4), round(max(ys), 4))


def footprint(spec: Spec, cx: float, cy: float, rot: int) -> tuple[Box, list[Box]]:
    """The piece's body and its clearance strips, in plan coordinates."""
    hw, hd = spec.w / 2, spec.d / 2
    body = _local_box(cx, cy, rot, -hw, -hd, hw, hd)
    strips = [
        (spec.front, (-hw, hd, hw, hd + spec.front)),
        (spec.back, (-hw, -hd - spec.back, hw, -hd)),
        (spec.left, (-hw - spec.left, -hd, -hw, hd)),
        (spec.right, (hw, -hd, hw + spec.right, hd)),
    ]
    return body, [_local_box(cx, cy, rot, *r) for depth, r in strips if depth > 0]


def _opening_zones(plan: LayoutPlan, openings, depth_of) -> dict[int, list[Box]]:
    """A rectangle `depth` deep on both sides of each door / window."""
    walls = {w.id: w for w in plan.walls}
    zones: dict[int, list[Box]] = {}
    for opening in openings:
        wall = walls.get(opening.wall_ref)
        if wall is None:
            continue
        dx, dy = wall.x2 - wall.x1, wall.y2 - wall.y1
        length = (dx * dx + dy * dy) ** 0.5
        if length == 0:
            continue
        ux, uy = dx / length, dy / length
        a = (wall.x1 + ux * opening.offset, wall.y1 + uy * opening.offset)
        b = (a[0] + ux * opening.width, a[1] + uy * opening.width)
        depth = depth_of(opening)
        for sign in (1, -1):
            nx, ny = -uy * depth * sign, ux * depth * sign
            xs = (a[0], b[0], a[0] + nx, b[0] + nx)
            ys = (a[1], b[1], a[1] + ny, b[1] + ny)
            zones.setdefault(opening.floor, []).append((min(xs), min(ys), max(xs), max(ys)))
    return zones


def _merge(intervals: list[tuple[float, float]]) -> list[tuple[float, float]]:
    merged: list[tuple[float, float]] = []
    for lo, hi in sorted(intervals):
        if merged and lo <= merged[-1][1] + ON_LINE:
            merged[-1] = (merged[-1][0], max(merged[-1][1], hi))
        elif hi - lo > ON_LINE:
            merged.append((lo, hi))
    return merged


@dataclass
class _Floor:
    swings: list[Box]
    windows: list[Box]
    walls: list  # solid walls on this floor
    any_walls: bool


@dataclass
class _Placed:
    item: FurnitureItem
    spec: Spec
    body: Box
    clear: list[Box]
    side: int  # wall side index (0 N, 1 E, 2 S, 3 W), -1 free-standing


class _Room:
    def __init__(self, room: PlanRoom, floor: _Floor):
        self.room = room
        self.floor = floor
        outline = room_to_polygon(room)
        if room.vertices is None:
            usable = box(room.x + INSET, room.y + INSET, room.x + room.w - INSET, room.y + room.h - INSET)
        else:
            usable = outline.buffer(-INSET, join_style=2)
        self.usable = prep(usable.buffer(TOL, join_style=2)) if not usable.is_empty else None
        self.centre = (usable.centroid.x, usable.centroid.y) if not usable.is_empty else (0.0, 0.0)
        self.u = (room.x + INSET, room.y + INSET, room.x + room.w - INSET, room.y + room.h - INSET)
        self.placed: list[_Placed] = []

    def solid(self, side: int) -> list[tuple[float, float]]:
        """Solid wall stretches along one edge of the room's bounding box."""
        r = self.room
        horizontal = side in (0, 2)
        line = (r.y, r.x + r.w, r.y + r.h, r.x)[side]
        lo, hi = (r.x, r.x + r.w) if horizontal else (r.y, r.y + r.h)
        if not self.floor.any_walls:
            return [(lo, hi)]
        spans = []
        for wall in self.floor.walls:
            if horizontal and abs(wall.y1 - wall.y2) < ON_LINE and abs(wall.y1 - line) < ON_LINE:
                a, b = sorted((wall.x1, wall.x2))
            elif not horizontal and abs(wall.x1 - wall.x2) < ON_LINE and abs(wall.x1 - line) < ON_LINE:
                a, b = sorted((wall.y1, wall.y2))
            else:
                continue
            a, b = max(a, lo), min(b, hi)
            if b > a:
                spans.append((a, b))
        return _merge(spans)

    def fits(self, spec: Spec, body: Box, clear: list[Box]) -> bool:
        blocked = self.floor.swings + (self.floor.windows if spec.h > WINDOW_SILL_M else [])
        blocked += [b for p in self.placed for b in (p.body, *p.clear)]
        return self._fits(body, clear, blocked)

    def _fits(self, body: Box, clear: list[Box], blocked: list[Box]) -> bool:
        if any(_overlaps(body, b) for b in blocked):
            return False
        if any(_overlaps(c, p.body) for c in clear for p in self.placed):
            return False
        return self.usable is not None and all(self.usable.covers(box(*b)) for b in [body, *clear])

    def wall_candidates(self, spec: Spec):
        ux0, uy0, ux1, uy1 = self.u
        used_sides = {p.side for p in self.placed if p.side >= 0}
        for side, rot in enumerate((0, 270, 180, 90)):  # back to N, E, S, W
            horizontal = side in (0, 2)
            ulo, uhi = (ux0, ux1) if horizontal else (uy0, uy1)
            for lo, hi in self.solid(side):
                lo, hi = max(lo, ulo), min(hi, uhi)
                first, last = lo + spec.w / 2, hi - spec.w / 2
                if last < first - 1e-9:
                    continue
                n = int((last - first) / STEP)
                along = {round(first + i * STEP, 4) for i in range(n + 1)} | {round(first, 4), round(last, 4), round((first + last) / 2, 4)}
                for pos in sorted(along):
                    across = (uy0 + spec.d / 2, ux1 - spec.d / 2, uy1 - spec.d / 2, ux0 + spec.d / 2)[side]
                    cx, cy = (pos, across) if horizontal else (across, pos)
                    if spec.prefer == "corner":
                        score = min(pos - spec.w / 2 - ulo, uhi - pos - spec.w / 2)
                    else:
                        score = abs(pos - (ulo + uhi) / 2)
                    if side in used_sides:
                        score += 2
                    yield score, side, pos, cx, cy, rot

    def free_candidates(self, spec: Spec):
        ux0, uy0, ux1, uy1 = self.u
        for rot in (0, 90):
            nx, ny = int((ux1 - ux0) / STEP), int((uy1 - uy0) / STEP)
            for i in range(nx + 1):
                for j in range(ny + 1):
                    cx, cy = round(ux0 + i * STEP, 4), round(uy0 + j * STEP, 4)
                    score = abs(cx - self.centre[0]) + abs(cy - self.centre[1])
                    yield score, -1, rot, cx, cy, rot

    def place(self, spec: Spec) -> _Placed | None:
        candidates = self.wall_candidates(spec) if spec.wall else self.free_candidates(spec)
        scored = []
        for score, side, pos, cx, cy, rot in candidates:
            if spec.avoid_window and any(_overlaps(footprint(spec, cx, cy, rot)[0], w) for w in self.floor.windows):
                score += 10
            scored.append((round(score, 6), side, pos, cx, cy, rot))
        scored.sort()
        blocked = self.floor.swings + (self.floor.windows if spec.h > WINDOW_SILL_M else [])
        blocked += [b for p in self.placed for b in (p.body, *p.clear)]
        for _, side, _, cx, cy, rot in scored:
            body, clear = footprint(spec, cx, cy, rot)
            if self._fits(body, clear, blocked):
                return self._add(spec, cx, cy, rot, body, clear, side)
        return None

    def _add(self, spec: Spec, cx, cy, rot, body, clear, side) -> _Placed:
        r = self.room
        item = FurnitureItem(
            id=f"furn-{r.id}-{len(self.placed) + 1}",
            room_id=r.id,
            kind=spec.kind,
            x=round(cx, 4),
            y=round(cy, 4),
            w=spec.w,
            d=spec.d,
            rotation=rot,
            floor=r.floor,
        )
        placed = _Placed(item, spec, body, clear, side)
        self.placed.append(placed)
        return placed

    def furnish_slot(self, slot: Slot) -> str | None:
        """Place one slot; the warning text if nothing fits."""
        for spec in slot.options:
            placed = self.place(spec)
            if placed is not None:
                break
        else:
            return f"{self.room.label}: {slot.missing}"
        companion = slot.companion
        if companion is None:
            return None
        # In front of the parent, centred, `gap` away from it.
        c, s = _TURN[placed.item.rotation]
        z = placed.spec.d / 2 + slot.companion_gap + companion.d / 2
        cx, cy = round(placed.item.x + z * s, 4), round(placed.item.y + z * c, 4)
        body, clear = footprint(companion, cx, cy, placed.item.rotation)
        if self.fits(companion, body, clear):
            self._add(companion, cx, cy, placed.item.rotation, body, clear, -1)
            return None
        return f"{self.room.label}: no room for a {companion.kind.replace('_', ' ')}"


def _floors(plan: LayoutPlan) -> dict[int, _Floor]:
    swings = _opening_zones(plan, plan.doors, lambda door: door.width)
    windows = _opening_zones(plan, plan.windows, lambda _w: WINDOW_ZONE_M)
    levels = {r.floor for r in plan.rooms}
    return {
        level: _Floor(
            swings=swings.get(level, []),
            windows=windows.get(level, []),
            walls=[w for w in plan.walls if w.floor == level and w.kind == "wall"],
            any_walls=any(w.floor == level for w in plan.walls),
        )
        for level in levels
    }


def _place_all(plan: LayoutPlan) -> tuple[list[_Placed], list[str]]:
    floors = _floors(plan)
    placed: list[_Placed] = []
    warnings: list[str] = []
    for room in plan.rooms:
        slots = program_for(room.type)
        if not slots:
            continue
        state = _Room(room, floors[room.floor])
        for slot in slots:
            warning = state.furnish_slot(slot)
            if warning:
                warnings.append(warning)
        placed += state.placed
    return placed, warnings


def furnish(plan: LayoutPlan) -> tuple[list[FurnitureItem], list[str]]:
    """Furniture for every room whose type has a program, plus a warning for
    each piece that did not fit."""
    placed, warnings = _place_all(plan)
    return [p.item for p in placed], warnings


def violations(plan: LayoutPlan, placed: list[_Placed] | None = None) -> list[str]:
    """Re-check a finished furnishing against every hard rule, pair by pair
    (independent of the incremental checks the placer made)."""
    if placed is None:
        placed, _ = _place_all(plan)
    floors = _floors(plan)
    rooms = {r.id: r for r in plan.rooms}
    problems: list[str] = []
    for p in placed:
        room = rooms[p.item.room_id]
        floor = floors[room.floor]
        usable = _Room(room, floor).usable
        name = f"{p.item.id} ({p.item.kind})"
        if usable is None or not all(usable.covers(box(*b)) for b in [p.body, *p.clear]):
            problems.append(f"{name} or its clearance leaves {room.label}")
        if any(_overlaps(p.body, s) for s in floor.swings):
            problems.append(f"{name} blocks a door swing")
        if p.spec.h > WINDOW_SILL_M and any(_overlaps(p.body, w) for w in floor.windows):
            problems.append(f"{name} stands in front of a window")
        for q in placed:
            if q is p or q.item.floor != p.item.floor:
                continue
            if _overlaps(p.body, q.body):
                problems.append(f"{name} overlaps {q.item.id}")
            elif any(_overlaps(p.body, c) for c in q.clear):
                problems.append(f"{name} sits in the clearance of {q.item.id}")
    return problems
