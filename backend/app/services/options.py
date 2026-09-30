"""Brief -> three scored, genuinely different layout options (roadmap P4).

The deterministic engine generates every option; nothing here needs the LLM.
A candidate pool is built by varying ``layout_style`` over the archetypes the
spec allows and the search's seeded room orders. Each candidate is scored by
the canonical quality scorer; only hard-valid ones survive. Options are then
picked greedily: best score first, then the best remaining candidate whose
``plan_distance`` to every already-picked option is at least
``DISTINCT_THRESHOLD``.
"""
from dataclasses import dataclass, field
from typing import get_args

from app.schemas.layout_plan import LayoutPlan, PlanRoom
from app.schemas.requirements import Facing, RequirementsSpec
from app.services.layout_engine import DoesNotFitError
from app.services.layout_engine.engine import generate_plan
from app.services.layout_engine.search import generate_candidates
from app.services.quality.hard_constraints import touches_outside
from app.services.quality.scorer import score
from app.services.quality.soft_rules import _canonical, rooms_share_wall

# Explicit archetypes the engine implements; None = the engine's own choice.
LAYOUT_STYLES: tuple[str | None, ...] = (
    None,
    *get_args(get_args(RequirementsSpec.model_fields["layout_style"].annotation)[0]),
)
CANDIDATES_PER_STYLE = 24
# 0..1 (see plan_distance). 0.1 ~ "rooms moved by a tenth of the plot
# diagonal on average, or a fifth of the adjacencies changed".
DISTINCT_THRESHOLD = 0.1
# Pass 1 of the pick trades at most this many score points for options that
# each have a fact of their own to highlight.
DESCRIBABLE_SCORE_MARGIN = 10
_CIRCULATION = frozenset({"corridor", "hallway", "passage", "passageway"})


@dataclass
class Option:
    layout: LayoutPlan
    score: int
    highlights: list[str] = field(default_factory=list)


@dataclass
class OptionsResult:
    options: list[Option]
    warnings: list[str]


def _center(room: PlanRoom) -> tuple[float, float]:
    return room.x + room.w / 2, room.y + room.h / 2


def _adjacent_type_pairs(plan: LayoutPlan) -> set[tuple[str, str]]:
    pairs = set()
    rooms = plan.rooms
    for i, a in enumerate(rooms):
        for b in rooms[i + 1:]:
            if rooms_share_wall(a, b):
                pairs.add(tuple(sorted((_canonical(a.type), _canonical(b.type)))))
    return pairs


def _centroid_distance(a: LayoutPlan, b: LayoutPlan) -> float:
    """Symmetric chamfer distance between same-type room centres, normalised
    by the plot diagonal (0 = identical positions, 1 = opposite corners). A
    room type missing from the other plan counts as the maximum, 1."""
    diagonal = (a.plot.width_m ** 2 + a.plot.depth_m ** 2) ** 0.5

    def one_way(src: LayoutPlan, dst: LayoutPlan) -> list[float]:
        out = []
        for room in src.rooms:
            cx, cy = _center(room)
            same = [_center(r) for r in dst.rooms if r.type == room.type and r.floor == room.floor]
            out.append(
                min(((cx - x) ** 2 + (cy - y) ** 2) ** 0.5 for x, y in same) / diagonal
                if same else 1.0
            )
        return out

    values = one_way(a, b) + one_way(b, a)
    return min(1.0, sum(values) / len(values)) if values else 0.0


def plan_distance(a: LayoutPlan, b: LayoutPlan) -> float:
    """0..1: mean of the normalised centroid displacement and the Jaccard
    distance between the plans' room-type adjacency sets."""
    pa, pb = _adjacent_type_pairs(a), _adjacent_type_pairs(b)
    union = pa | pb
    jaccard = 1 - len(pa & pb) / len(union) if union else 0.0
    return (_centroid_distance(a, b) + jaccard) / 2


# ---- highlights -----------------------------------------------------------

def _area(rooms: list[PlanRoom]) -> float:
    return round(sum(r.w * r.h for r in rooms), 1)


def _living_area(plan: LayoutPlan) -> float:
    return _area([r for r in plan.rooms if _canonical(r.type) == "living_room"])


def _corridor_area(plan: LayoutPlan) -> float:
    return _area([r for r in plan.rooms if _canonical(r.type) in _CIRCULATION])


def _daylit_rooms(plan: LayoutPlan) -> int:
    return sum(1 for r in plan.rooms if touches_outside(r, plan))


def _outline(plan: LayoutPlan) -> tuple[float, float, float, float]:
    f = plan.footprint
    return (f.x, f.y, f.w, f.h) if f else (0.0, 0.0, plan.plot.width_m, plan.plot.depth_m)


def _is_corner(plan: LayoutPlan, room: PlanRoom) -> bool:
    """Rectangular room with outside walls on two perpendicular sides."""
    if room.vertices is not None:
        return False
    x0, y0, w, h = _outline(plan)
    eps = 1e-6
    ew = room.x <= x0 + eps or room.x + room.w >= x0 + w - eps
    ns = room.y <= y0 + eps or room.y + room.h >= y0 + h - eps
    return ew and ns


def _at_rear(plan: LayoutPlan, rooms: list[PlanRoom]) -> bool:
    """Every room's centre is in the half of the building away from the
    street (the side opposite ``plot.facing``). False for no rooms."""
    if not rooms:
        return False
    x0, y0, w, h = _outline(plan)
    mid_x, mid_y = x0 + w / 2, y0 + h / 2
    test = {
        Facing.east: lambda cx, cy: cx < mid_x,
        Facing.west: lambda cx, cy: cx > mid_x,
        Facing.north: lambda cx, cy: cy > mid_y,
        Facing.south: lambda cx, cy: cy < mid_y,
    }[plan.plot.facing]
    return all(test(*_center(r)) for r in rooms)


def _of_type(plan: LayoutPlan, *types: str) -> list[PlanRoom]:
    return [r for r in plan.rooms if _canonical(r.type) in types]


# (label, predicate(plan, adjacent_type_pairs)). A fact is a highlight when
# it holds for this option and fails for at least one other option.
_FACTS = (
    ("All bedrooms at the quiet rear",
     lambda p, adj: _at_rear(p, [r for r in p.rooms if "bedroom" in r.type])),
    ("Kitchen next to dining", lambda p, adj: ("dining_room", "kitchen") in adj),
    ("Dining opens onto living room", lambda p, adj: ("dining_room", "living_room") in adj),
    ("Kitchen next to living room", lambda p, adj: ("kitchen", "living_room") in adj),
    ("Balcony off the living room", lambda p, adj: ("balcony", "living_room") in adj),
    ("Kitchen away from bathrooms",
     lambda p, adj: bool(_of_type(p, "kitchen")) and ("bathroom", "kitchen") not in adj),
    ("Bathrooms back to back", lambda p, adj: ("bathroom", "bathroom") in adj),
    ("Bedrooms side by side",
     lambda p, adj: bool({("bedroom", "bedroom"), ("bedroom", "master_bedroom")} & adj)),
    ("Living room at the front",
     lambda p, adj: bool(_of_type(p, "living_room"))
     and not any(_at_rear(p, [r]) for r in _of_type(p, "living_room"))),
    ("Corner living room", lambda p, adj: any(_is_corner(p, r) for r in _of_type(p, "living_room"))),
    ("Corner master bedroom",
     lambda p, adj: any(_is_corner(p, r) for r in _of_type(p, "master_bedroom"))),
    ("Kitchen at the rear", lambda p, adj: _at_rear(p, _of_type(p, "kitchen"))),
)


def _facts(plan: LayoutPlan) -> frozenset[str]:
    adj = _adjacent_type_pairs(plan)
    return frozenset(label for label, holds in _FACTS if holds(plan, adj))


def highlights_for(plans: list[LayoutPlan], scores: list[int]) -> list[list[str]]:
    """2-3 deterministic, factual lines per option, each true relative to the
    others. In priority order, the first three that apply win:

    * "Highest score" - strictly best score.
    * "Largest living room (N m²)" - strictly largest living-room area.
    * "Least corridor space (N m²)" - strictly smallest corridor area.
    * "Most rooms with daylight (N)" - strictly most rooms on an outside wall.
    * each ``_FACTS`` line that is true here and false in another option,
      rarest (held by the fewest options) first.
    With fewer than two lines, facts true here (even if shared) are added,
    then "Living room N m²", then "N rooms with daylight". A single option
    gets its true facts.
    """
    n = len(plans)
    living = [_living_area(p) for p in plans]
    corridor = [_corridor_area(p) for p in plans]
    daylit = [_daylit_rooms(p) for p in plans]
    facts = [[label for label, _ in _FACTS if label in _facts(p)] for p in plans]

    def strict_best(values, i, better) -> bool:
        return n > 1 and all(better(values[i], v) for j, v in enumerate(values) if j != i)

    result = []
    for i in range(n):
        lines = []
        if strict_best(scores, i, lambda a, b: a > b):
            lines.append("Highest score")
        if living[i] > 0 and strict_best(living, i, lambda a, b: a > b):
            lines.append(f"Largest living room ({living[i]:g} m²)")
        if strict_best(corridor, i, lambda a, b: a < b):
            lines.append(f"Least corridor space ({corridor[i]:g} m²)")
        if strict_best(daylit, i, lambda a, b: a > b):
            lines.append(f"Most rooms with daylight ({daylit[i]})")
        # Rarest facts first (held by the fewest options), then _FACTS order.
        held_by = {f: sum(f in other for other in facts) for f in facts[i]}
        lines += sorted((f for f in facts[i] if n == 1 or held_by[f] < n), key=held_by.get)
        lines += [f for f in facts[i] if f not in lines]
        if len(lines) < 2 and living[i] > 0:
            lines.append(f"Living room {living[i]:g} m²")
        if len(lines) < 2:
            lines.append(f"{daylit[i]} rooms with daylight")
        result.append(lines[:3])
    return result


# ---- generation -----------------------------------------------------------

def _pool(spec: RequirementsSpec) -> list[LayoutPlan]:
    if spec.plot.boundary is not None or spec.floors > 1:
        return [generate_plan(spec)]  # single-layout search space
    styles = (spec.layout_style,) if spec.layout_style is not None else LAYOUT_STYLES
    plans: list[LayoutPlan] = []
    last_error: DoesNotFitError | None = None
    for style in styles:
        try:
            candidates = generate_candidates(
                spec.model_copy(update={"layout_style": style}), n=CANDIDATES_PER_STYLE
            )
        except DoesNotFitError as exc:
            last_error = exc
            continue
        plans.extend(c.plan for c in candidates)
    if not plans:
        raise last_error or DoesNotFitError("no candidate could be generated")
    return plans


def generate_options(spec: RequirementsSpec, count: int = 3) -> OptionsResult:
    """Deterministic for a given spec. Raises ``DoesNotFitError`` only when
    no candidate at all could be generated."""
    scored: list[tuple[int, int, LayoutPlan]] = []
    for index, plan in enumerate(_pool(spec)):
        report = score(plan, spec, include_vastu=False)
        if not report.hard_violations:
            scored.append((report.score, index, plan))
    # Best score first; pool order (engine's own ranking) breaks ties.
    scored.sort(key=lambda item: (-item[0], item[1]))

    # Pass 1 also asks that neither option's _FACTS set contains the other's
    # (so each option has something true another lacks), within
    # DESCRIBABLE_SCORE_MARGIN of the best score; pass 2 tops up on distance
    # alone.
    picked: list[tuple[int, LayoutPlan]] = []
    for need_new_facts in (True, False):
        for value, _index, plan in scored:
            if len(picked) >= count:
                break
            if any(plan is other for _, other in picked):
                continue
            if any(plan_distance(plan, other) < DISTINCT_THRESHOLD for _, other in picked):
                continue
            if need_new_facts and scored[0][0] - value > DESCRIBABLE_SCORE_MARGIN:
                continue
            if need_new_facts and any(
                _facts(plan) <= _facts(other) or _facts(other) <= _facts(plan)
                for _, other in picked
            ):
                continue
            picked.append((value, plan))
    picked.sort(key=lambda item: -item[0])

    warnings = []
    if not scored:
        warnings.append("No valid layout could be generated for this brief.")
    elif len(picked) < count:
        warnings.append(
            f"Only {len(picked)} distinct valid "
            f"{'option exists' if len(picked) == 1 else 'options exist'} for this brief."
        )
    plans = [plan for _, plan in picked]
    scores = [value for value, _ in picked]
    return OptionsResult(
        options=[
            Option(layout=plan, score=value, highlights=lines)
            for plan, value, lines in zip(plans, scores, highlights_for(plans, scores))
        ],
        warnings=warnings,
    )
