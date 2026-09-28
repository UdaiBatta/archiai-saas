"""Straight-edge polygon subdivision (workflow Phase 8, polygon boundary
engine).

Generalizes ``subdivision.subdivide()``'s guillotine cutter from axis-aligned
``Rect``s to a general straight-edge polygon. The cut LINE stays axis-aligned
always (no angled internal walls this phase — only the outer boundary is a
general polygon, so there is no angle search, same longer-side-first axis
choice as the rect version, just computed from ``polygon.bounds`` instead of
``Rect.w``/``Rect.d``). The split itself is a shapely box-intersection
("Sutherland-Hodgman via GEOS") instead of the rect version's arithmetic
split. Reuses ``subdivision.split_index``/``clamped_cut``/``facing_first``
unchanged — none of them touch ``Rect``, they already operate purely on
spans/areas.
"""
from __future__ import annotations

from shapely.geometry import Polygon, box

from app.schemas.requirements import Facing
from app.services.layout_engine.subdivision import (
    _ENTRY_TYPES,
    _OUTSIDE_WALL_TYPES,
    RoomNeed,
    SubdivisionError,
    clamped_cut,
    facing_first,
    split_index,
)

_AREA_EPS = 0.01  # 1 cm^2 floor for "non-trivial leftover area" after a clip


def _clip(polygon: Polygon, minx: float, miny: float, maxx: float, maxy: float) -> Polygon | None:
    inter = polygon.intersection(box(minx, miny, maxx, maxy))
    if inter.is_empty or inter.geom_type != "Polygon" or inter.area <= _AREA_EPS:
        return None
    return inter


def _on_outline(piece: Polygon, outline: Polygon | None) -> bool:
    return outline is not None and piece.boundary.intersection(outline.boundary).length > 1e-6


def _cut_off_penalty(group: list[RoomNeed], piece: Polygon, parent_on_outline: bool, outline: Polygon | None) -> int:
    """Same rule as the rectangular cutter: a piece cut off from the plot's
    outline costs its entry (100) and each room that needs a window (10)."""
    if outline is None or not parent_on_outline or _on_outline(piece, outline):
        return 0
    return sum(100 if n.type in _ENTRY_TYPES else 10 if n.type in _OUTSIDE_WALL_TYPES else 0 for n in group)


def subdivide_polygon(
    needs: list[RoomNeed], polygon: Polygon, facing: Facing, outline: Polygon | None = None,
) -> list[tuple[RoomNeed, Polygon]]:
    """With `outline` (the plot boundary), each cut also weighs which rooms
    keep an outside wall; ties keep the plain longer-side-first order."""
    if not needs:
        return []
    if len(needs) == 1:
        return [(needs[0], polygon)]

    i = split_index(needs)
    minx, miny, maxx, maxy = polygon.bounds
    w, d = maxx - minx, maxy - miny
    axes = ("x", "y") if w >= d else ("y", "x")
    parent_on_outline = _on_outline(polygon, outline)
    best = None
    # Old order first (each axis unswapped), then the swapped alternatives.
    for rank, (axis, swapped) in enumerate([(a, False) for a in axes] + [(a, True) for a in axes]):
        group_a, group_b = (needs[i:], needs[:i]) if swapped else (needs[:i], needs[i:])
        span, other = (w, d) if axis == "x" else (d, w)
        t = clamped_cut(span, other, group_a, group_b)
        if t is None:
            continue
        a_high = facing_first(axis, facing)
        # `t` is always group A's SIZE along this axis, but which side (low or
        # high) it occupies depends on a_high — mirroring subdivide()'s own
        # a_high branch exactly: when a_high, group A sits at the far end, so
        # the low box's size is the *remainder* (span - t), not t itself.
        low_len = (span - t) if a_high else t
        if axis == "x":
            cut = minx + low_len
            low_box, high_box = (minx, miny, cut, maxy), (cut, miny, maxx, maxy)
        else:
            cut = miny + low_len
            low_box, high_box = (minx, miny, maxx, cut), (minx, cut, maxx, maxy)

        box_a, box_b = (high_box, low_box) if a_high else (low_box, high_box)
        poly_a = _clip(polygon, *box_a)
        poly_b = _clip(polygon, *box_b)
        if poly_a is None or poly_b is None:
            # Only happens against a non-convex (L/U-shaped) boundary, where
            # this cut line would fragment one side into disjoint pieces —
            # Phase 8's PlanRoom has one vertex ring, no multi-piece rooms.
            continue
        penalty = (
            _cut_off_penalty(group_a, poly_a, parent_on_outline, outline)
            + _cut_off_penalty(group_b, poly_b, parent_on_outline, outline)
        )
        if best is None or (penalty, rank) < best[0]:
            best = ((penalty, rank), swapped, group_a, poly_a, group_b, poly_b)
        if penalty == 0:
            break

    if best is None:
        raise SubdivisionError(
            f"cannot cut polygon (bbox {w:.1f}x{d:.1f}m) for {i}+{len(needs) - i} rooms"
        )
    _, swapped, group_a, poly_a, group_b, poly_b = best
    parts_a = subdivide_polygon(group_a, poly_a, facing, outline)
    parts_b = subdivide_polygon(group_b, poly_b, facing, outline)
    return parts_b + parts_a if swapped else parts_a + parts_b
