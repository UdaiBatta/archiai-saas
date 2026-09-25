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


# Rooms that need an outside wall: a window (hard rule for homes, see
# quality.hard_constraints._NEEDS_WINDOW), or an outdoor room that is
# only a balcony if it's on the outline. Mirrored here as raw engine types
# (subdivision can't import quality without an import cycle).
_OUTSIDE_WALL_TYPES = frozenset({
    "bedroom", "master_bedroom", "kids_room", "kids_bedroom", "guest_bedroom",
    "living_room", "open_plan_living", "kitchen",
    "balcony", "terrace", "porch", "veranda",
})
_FACING_SIDE = {Facing.north: "N", Facing.south: "S", Facing.east: "E", Facing.west: "W"}
_ENTRY_TYPES = frozenset({"entry", "foyer"})  # templates call the entry "foyer"


def _outline_sides(rect: Rect, frame: Rect | None) -> frozenset[str]:
    """Which sides of `rect` lie on the building outline `frame`."""
    if frame is None:
        return frozenset()
    sides = set()
    if abs(rect.x - frame.x) <= EPS:
        sides.add("W")
    if abs(rect.x + rect.w - (frame.x + frame.w)) <= EPS:
        sides.add("E")
    if abs(rect.y - frame.y) <= EPS:
        sides.add("N")
    if abs(rect.y + rect.d - (frame.y + frame.d)) <= EPS:
        sides.add("S")
    return frozenset(sides)


def _cut_off_penalty(group: list[RoomNeed], half: Rect, parent_sides: frozenset[str], frame: Rect | None, facing: Facing) -> int:
    """What this half loses by being cut off from the outline: the entry away
    from the street, or a room that needs a window left with no outside side."""
    if frame is None or not parent_sides:
        return 0
    sides = _outline_sides(half, frame)
    street = _FACING_SIDE[facing]
    penalty = 0
    for need in group:
        if need.type in _ENTRY_TYPES and street in parent_sides and street not in sides:
            penalty += 100
        # Only hard needs move rooms around: chasing a nice-to-have (a dining
        # room window) cost other rules (bathrooms stacked across floors).
        if not sides and need.type in _OUTSIDE_WALL_TYPES:
            penalty += 10
    return penalty


def subdivide(
    needs: list[RoomNeed], rect: Rect, facing: Facing, frame: Rect | None = None,
) -> list[tuple[RoomNeed, Rect]]:
    """Cut `rect` among `needs`. With `frame` (the building outline), each cut
    also weighs which rooms keep an outside wall: of the valid cuts, the one
    that cuts the fewest window-needing rooms (and never the entry) off the
    outline wins; ties keep the plain preference order below."""
    if not needs:
        return []
    if len(needs) == 1:
        return [(needs[0], rect)]

    i = split_index(needs)
    entry_in_b = any(n.type in _ENTRY_TYPES for n in needs[i:])
    facing_axis = "x" if facing in (Facing.east, Facing.west) else "y"
    parent_sides = _outline_sides(rect, frame)

    # Preference order (the tie-break): cut the longer side (keeps cells
    # square-ish); with the entry in the second group, cut parallel to the
    # street first so both halves keep it; across the facing axis, the
    # entry's group takes the street side. Each axis's other assignment is
    # tried after, so the outline penalty can pick it when it matters.
    axes = ("x", "y") if rect.w >= rect.d else ("y", "x")
    if entry_in_b:
        axes = tuple(sorted(axes, key=lambda axis: axis == facing_axis))
    options = []
    for axis in axes:
        preferred_swap = axis == facing_axis and entry_in_b
        options += [(axis, preferred_swap), (axis, not preferred_swap)]

    best = None
    for rank, (axis, swapped) in enumerate(options):
        group_a, group_b = (needs[i:], needs[:i]) if swapped else (needs[:i], needs[i:])
        span, other = (rect.w, rect.d) if axis == "x" else (rect.d, rect.w)
        t = clamped_cut(span, other, group_a, group_b)
        if t is None:
            continue
        # `t` is group A's share. A takes the facing-side child on the facing
        # axis (the high child when facing east/south), the low child otherwise.
        if facing_first(axis, facing):
            if axis == "x":
                rect_a = Rect(rect.x + rect.w - t, rect.y, t, rect.d)
                rect_b = Rect(rect.x, rect.y, rect.w - t, rect.d)
            else:
                rect_a = Rect(rect.x, rect.y + rect.d - t, rect.w, t)
                rect_b = Rect(rect.x, rect.y, rect.w, rect.d - t)
        elif axis == "x":
            rect_a = Rect(rect.x, rect.y, t, rect.d)
            rect_b = Rect(rect.x + t, rect.y, rect.w - t, rect.d)
        else:
            rect_a = Rect(rect.x, rect.y, rect.w, t)
            rect_b = Rect(rect.x, rect.y + t, rect.w, rect.d - t)
        penalty = (
            _cut_off_penalty(group_a, rect_a, parent_sides, frame, facing)
            + _cut_off_penalty(group_b, rect_b, parent_sides, frame, facing)
        )
        if best is None or (penalty, rank) < best[0]:
            best = ((penalty, rank), swapped, group_a, rect_a, group_b, rect_b)
        if penalty == 0:
            break  # nothing better than the first cut that costs nothing

    if best is None:
        raise SubdivisionError(
            f"cannot cut {rect.w:.1f}x{rect.d:.1f}m for {i}+{len(needs) - i} rooms"
        )
    _, swapped, group_a, rect_a, group_b, rect_b = best
    parts_a = subdivide(group_a, rect_a, facing, frame)
    parts_b = subdivide(group_b, rect_b, facing, frame)
    # Keep the caller's room order in the output either way.
    return parts_b + parts_a if swapped else parts_a + parts_b
