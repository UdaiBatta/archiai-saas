"""Unit interiors: run the existing layout engine on one unit's rectangle.

Each unit is a plot of width x depth whose ``facing`` is its CORRIDOR side,
so the engine's front door lands on the corridor. The engine gets an
apartment band plan (its own ``plan_from_program(band_plan=...)`` hook):

    facade band   bedrooms, living room, kitchen   (all touch the facade)
    hall band     the injected corridor/hallway    (2BHK and up)
    corridor band entry + bathrooms                (wet rooms, stacked per floor)

Subdivision, walls, doors, windows and hard-constraint validation are all the
engine's. This module only picks the bands, tries a few room orders, and
rejects plans whose habitable rooms miss the facade.
"""
from __future__ import annotations

import math
from functools import lru_cache
from itertools import product

from app.schemas.layout_plan import LayoutPlan, PlanRoom
from app.schemas.requirements import Facing, RequirementsSpec
from app.services.layout_engine.archetypes import BandPlan
from app.services.layout_engine.engine import (
    DoesNotFitError,
    _MIN_WINDOW_M,
    _WINDOW_MARGIN_M,
    _build_program,
    _placed_on_plot,
    plan_from_program,
)
from app.services.layout_engine.geometry import EPS, Rect
from app.services.layout_engine.subdivision import SubdivisionError
from app.services.quality.hard_constraints import _touches

# Target unit areas (m^2), typical Indian carpet-plus-walls sizes. Units are
# never narrower than their facade rooms need (see min_width).
TARGET_AREA = {"studio": 30.0, "1bhk": 45.0, "2bhk": 70.0, "3bhk": 95.0, "4bhk": 120.0}

PROGRAMS: dict[str, list[tuple[str, int]]] = {
    "studio": [("living_room", 1), ("kitchen", 1), ("bathroom", 1)],
    "1bhk": [("bedroom", 1), ("living_room", 1), ("kitchen", 1), ("bathroom", 1)],
    "2bhk": [("master_bedroom", 1), ("bedroom", 1), ("living_room", 1), ("kitchen", 1), ("bathroom", 2)],
    "3bhk": [("master_bedroom", 1), ("bedroom", 2), ("living_room", 1), ("kitchen", 1), ("bathroom", 2)],
    "4bhk": [("master_bedroom", 1), ("bedroom", 3), ("living_room", 1), ("kitchen", 1), ("bathroom", 3)],
}

# Rooms that need a window, so the facade (hard_constraints._NEEDS_WINDOW).
DAYLIT = frozenset({"bedroom", "master_bedroom", "living_room", "kitchen"})
_HALL = frozenset({"corridor", "hallway"})
REAR_BAND_M = 2.1  # a bathroom's short side
HALL_BAND_M = 1.0  # the catalog's corridor minimum
FACADE_BAND_MAX_M = 5.0
_WIDTH_STEP = 0.25
_WIDTH_TRIES = 24

_OPPOSITE = {"north": "south", "south": "north", "east": "west", "west": "east"}


def unit_spec(unit_type: str, width: float, depth: float, corridor_side: str) -> RequirementsSpec:
    return RequirementsSpec(
        building_type="apartment",
        rooms=[{"type": t, "count": c} for t, c in PROGRAMS[unit_type]],
        plot={"width_m": width, "depth_m": depth},
        facing=corridor_side,
    )


def on_side(room: PlanRoom, side: str, w: float, d: float) -> bool:
    """Does the room touch the unit's `side` edge (unit-local coords)?"""
    return {
        "north": room.y <= EPS,
        "south": room.y + room.h >= d - EPS,
        "west": room.x <= EPS,
        "east": room.x + room.w >= w - EPS,
    }[side]


def facade_violations(plan: LayoutPlan, facade: str) -> list[str]:
    """Daylit rooms that miss the facade. The corridor and party walls are
    inside the building, so the engine's own "any outside wall" check
    (which sees the unit as a detached house) is not enough."""
    w, d = plan.plot.width_m, plan.plot.depth_m
    return [
        f"{r.label} has no facade wall for a window"
        for r in plan.rooms if r.type in DAYLIT and not on_side(r, facade, w, d)
    ]


def _bands(needs, w: float, d: float, corridor_side: str, orders) -> BandPlan:
    lit_order, rear_order = orders
    lit = [n for n in needs if n.type in DAYLIT]
    hall = [n for n in needs if n.type in _HALL]
    rear = [n for n in needs if n not in lit and n not in hall]
    lit = sorted(lit, key=lambda n: lit_order.index(n.type))
    rear = sorted(rear, key=lambda n: rear_order.index(n.type) if n.type in rear_order else len(rear_order))
    # Depth measured from the corridor edge inward: rear band, hall, facade band.
    # A facade band deeper than it is wide gets cut front-to-back, pushing
    # rooms off the facade; past FACADE_BAND_MAX the rear band takes the rest.
    depth = d if corridor_side in ("north", "south") else w
    hall_m = HALL_BAND_M if hall else 0.0
    lit_m = min(depth - REAR_BAND_M - hall_m, FACADE_BAND_MAX_M)
    strips = [(depth - hall_m - lit_m, rear)] + ([(hall_m, hall)] if hall else []) + [(lit_m, lit)]
    bands, offset = [], 0.0
    for size, rooms in strips:
        if corridor_side == "south":
            rect = Rect(0.0, d - offset - size, w, size)
        elif corridor_side == "north":
            rect = Rect(0.0, offset, w, size)
        elif corridor_side == "east":
            rect = Rect(w - offset - size, 0.0, size, d)
        else:
            rect = Rect(offset, 0.0, size, d)
        bands.append((rect, rooms))
        offset += size
    return BandPlan(bands=bands)


_LIT_ORDERS = (
    ("living_room", "kitchen", "bedroom", "master_bedroom"),
    ("master_bedroom", "bedroom", "living_room", "kitchen"),
    ("kitchen", "living_room", "master_bedroom", "bedroom"),
)
_REAR_ORDERS = (("entry", "foyer", "bathroom"), ("bathroom", "entry", "foyer"))


@lru_cache(maxsize=512)
def solve_unit(unit_type: str, pw: float, pd: float, corridor_side: str) -> LayoutPlan | None:
    """The unit's plan on its own pw x pd (east x south) rectangle, in
    unit-local coords (origin at its NW corner), or None
    when no tried room order fits with every daylit room on the facade.
    Cached: identical units (every floor, every repeat) are solved once."""
    spec = unit_spec(unit_type, pw, pd, corridor_side)
    program = _build_program(spec)
    facade = _OPPOSITE[corridor_side]
    for orders in product(_LIT_ORDERS, _REAR_ORDERS):
        try:
            bands = _bands(program.needs, pw, pd, corridor_side, orders)
            plan = plan_from_program(spec, program, pw, pd, Facing(corridor_side), band_plan=bands)
        except (DoesNotFitError, SubdivisionError, ValueError):
            continue
        if not facade_violations(plan, facade):
            return _facade_windows_only(plan, facade)
    return None


def _facade_windows_only(plan: LayoutPlan, facade: str) -> LayoutPlan:
    """The engine treats the unit as a detached house and puts each room's
    window on its longest outer wall, often a party wall or the corridor.
    Only the facade is really outside: move every window there (same width,
    centred on the room's facade wall) or drop it when the room has none."""
    w, d = plan.plot.width_m, plan.plot.depth_m
    line_axis, line = {"north": ("y", 0.0), "south": ("y", d), "west": ("x", 0.0), "east": ("x", w)}[facade]

    def mid(wall) -> tuple[float, float]:
        return (wall.x1 + wall.x2) / 2, (wall.y1 + wall.y2) / 2

    def on_facade(wall) -> bool:
        a, b = (wall.y1, wall.y2) if line_axis == "y" else (wall.x1, wall.x2)
        return wall.rooms is None and abs(a - line) <= EPS and abs(b - line) <= EPS

    walls = {wall.id: wall for wall in plan.walls}
    facade_walls = [wall for wall in plan.walls if on_facade(wall)]
    windows = []
    for win in plan.windows:
        room = next((r for r in plan.rooms if _touches(r, *mid(walls[win.wall_ref]))), None)
        target = room and next((fw for fw in facade_walls if _touches(room, *mid(fw))), None)
        if target is None:
            continue
        length = math.hypot(target.x2 - target.x1, target.y2 - target.y1)
        width = round(min(win.width, length - 2 * _WINDOW_MARGIN_M), 2)
        if width < _MIN_WINDOW_M:
            continue
        windows.append(win.model_copy(update={
            "wall_ref": target.id, "offset": round((length - width) / 2, 3), "width": width,
        }))
    return plan.model_copy(update={"windows": windows})


@lru_cache(maxsize=128)
def unit_width(unit_type: str, depth: float, corridor_side: str) -> float | None:
    """Nominal unit width along the corridor: the target area over the depth,
    widened in 0.25 m steps until the engine lays the unit out. The steps
    start at the facade rooms' combined minimum frontage. None = the type
    doesn't fit this depth at any sensible width."""
    from app.services import catalog

    frontage = sum(
        min(catalog.min_dimensions(t)) * c for t, c in PROGRAMS[unit_type] if t in DAYLIT
    )
    w = round(max(TARGET_AREA[unit_type] / depth, frontage), 2)
    for _ in range(_WIDTH_TRIES):
        dims = (w, depth) if corridor_side in ("north", "south") else (depth, w)
        if solve_unit(unit_type, *dims, corridor_side) is not None:
            return w
        w = round(w + _WIDTH_STEP, 2)
    return None


def placed(plan: LayoutPlan, x: float, y: float) -> LayoutPlan:
    """The unit plan moved to its place on the floor plate."""
    return _placed_on_plot(plan, x, y, plan.plot.width_m, plan.plot.depth_m)
