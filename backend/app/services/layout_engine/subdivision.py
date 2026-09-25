"""Recursive rectangular subdivision (workflow Step 1.2, core).

Splits a band rectangle among an ORDERED list of room needs by balanced
area-weighted guillotine cuts: the list is halved at the cumulative-area
midpoint, the rect is cut along its longer side proportionally to the halves'
areas, and recursion continues. Because every cut tiles its rect exactly, the
result fills the band with zero gaps and zero overlaps by construction — the
sliver-merge rule of the workflow is structurally unnecessary here.

Adjacency is a SOFT preference expressed in list order (the caller chains
`must`-adjacent rooms consecutively): consecutive rooms tend to land in the
same half and end up as edge-sharing siblings. No constraint solving in v0,
exactly as the workplan prescribes.

Facing bias: the first group of the ordered list, or whichever group holds the
entry, is assigned the facing-side child rect, so the entry reaches the plot's
facing edge (and so an outside wall for the front door).
"""
from dataclasses import dataclass

from app.schemas.requirements import Facing
from app.services.layout_engine.geometry import EPS, Rect

_MIN_SPAN = 1.2  # never cut a strip thinner than this (meters)


class SubdivisionError(ValueError):
    """The group cannot be cut to honour minimum areas — caller maps this to
    the structured does-not-fit error."""


@dataclass(frozen=True)
class RoomNeed:
    key: str          # stable id, e.g. "r3"
    type: str         # RoomType value
    label: str
    preferred_area: float
    min_w: float
    min_d: float

    @property
    def min_area(self) -> float:
        return self.min_w * self.min_d


def split_index(needs: list[RoomNeed]) -> int:
    """Index that halves the list by cumulative preferred area (order kept)."""
    total = sum(n.preferred_area for n in needs)
    running = 0.0
    best_i, best_diff = 1, float("inf")
    for i in range(1, len(needs)):
        running += needs[i - 1].preferred_area
        diff = abs(running - total / 2)
        if diff < best_diff:
            best_i, best_diff = i, diff
    return best_i


def clamped_cut(span: float, other_span: float, group_a: list[RoomNeed], group_b: list[RoomNeed]) -> float | None:
    """Cut position along `span` giving A its area share, clamped so both sides
    can still host their groups' minimum areas. None if no valid cut exists."""
    area_a = sum(n.preferred_area for n in group_a)
    area_b = sum(n.preferred_area for n in group_b)
    t = span * area_a / (area_a + area_b)

    # Area alone is insufficient: a bathroom's 3.15 m² minimum can fit inside
    # a 1.2×large strip by area while still violating its 1.5 m shortest side.
    # Every descendant needs at least its smaller orientation-tolerant minimum
    # along this cut axis, even before recursion decides its final orientation.
    min_span_a = max(min(n.min_w, n.min_d) for n in group_a)
    min_span_b = max(min(n.min_w, n.min_d) for n in group_b)
    floor_a = max(
        _MIN_SPAN,
        min_span_a,
        sum(n.min_area for n in group_a) * 1.02 / other_span,
    )
    floor_b = max(
        _MIN_SPAN,
        min_span_b,
        sum(n.min_area for n in group_b) * 1.02 / other_span,
    )
    if floor_a + floor_b > span + EPS:
        return None
    return min(max(t, floor_a), span - floor_b)


def facing_first(axis: str, facing: Facing) -> bool:
    """Should group A take the high-coordinate child (east/south side)?"""
    if axis == "x":
        return facing == Facing.east
    return facing == Facing.south


def subdivide(needs: list[RoomNeed], rect: Rect, facing: Facing) -> list[tuple[RoomNeed, Rect]]:
    if not needs:
        return []
    if len(needs) == 1:
        return [(needs[0], rect)]

    i = split_index(needs)
    group_a, group_b = needs[:i], needs[i:]
    entry_in_b = any(n.type == "entry" for n in group_b)
    facing_axis = "x" if facing in (Facing.east, Facing.west) else "y"

    # Prefer cutting the longer side (keeps cells square-ish); fall back to the
    # other axis when the preferred one cannot honour minimum areas.
    axes = ("x", "y") if rect.w >= rect.d else ("y", "x")
    if entry_in_b:
        # A cut across the facing axis gives the street side to group A only,
        # which would box the entry in. Cut parallel to the street first so
        # both halves keep it (the entry becomes a passage from the street
        # in, and its neighbour keeps its window).
        axes = tuple(sorted(axes, key=lambda axis: axis == facing_axis))
    for axis in axes:
        # Still across the facing axis: swap so the entry takes the street side.
        swapped = axis == facing_axis and entry_in_b
        group_a, group_b = (needs[i:], needs[:i]) if swapped else (needs[:i], needs[i:])
        span, other = (rect.w, rect.d) if axis == "x" else (rect.d, rect.w)
        t = clamped_cut(span, other, group_a, group_b)
        if t is None:
            continue
        a_high = facing_first(axis, facing)
        if axis == "x":
            low = Rect(rect.x, rect.y, t, rect.d)
            high = Rect(rect.x + t, rect.y, rect.w - t, rect.d)
        else:
            low = Rect(rect.x, rect.y, rect.w, t)
            high = Rect(rect.x, rect.y + t, rect.w, rect.d - t)
        # `t` was computed as group A's share, so A must receive the low child
        # unless it is being anchored to the facing (high-coordinate) side — in
        # that case mirror the cut so A's rect still has A's area.
        if a_high:
            if axis == "x":
                high = Rect(rect.x + rect.w - t, rect.y, t, rect.d)
                low = Rect(rect.x, rect.y, rect.w - t, rect.d)
            else:
                high = Rect(rect.x, rect.y + rect.d - t, rect.w, t)
                low = Rect(rect.x, rect.y, rect.w, rect.d - t)
            rect_a, rect_b = high, low
        else:
            rect_a, rect_b = low, high
        parts_a = subdivide(group_a, rect_a, facing)
        parts_b = subdivide(group_b, rect_b, facing)
        # Keep the caller's room order in the output either way.
        return parts_b + parts_a if swapped else parts_a + parts_b

    raise SubdivisionError(
        f"cannot cut {rect.w:.1f}x{rect.d:.1f}m for {len(group_a)}+{len(group_b)} rooms"
    )
