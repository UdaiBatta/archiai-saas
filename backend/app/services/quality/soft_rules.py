"""Deterministic generic soft rules for canonical ``LayoutPlan`` geometry.

Each rule returns a normalized 0..1 score plus plain-language warnings.  The
weighted combination lives in ``scorer.py``; this module does not know about UI
or persistence.
"""

from dataclasses import dataclass, field

from app.schemas.layout_plan import LayoutPlan, PlanRoom
from app.schemas.quality_report import QualityWarning
from app.schemas.requirements import RequirementsSpec, RoomType
from app.services import catalog
from app.services.layout_engine import polygon
from app.services.layout_engine.geometry import EPS, Rect
from app.services.quality.hard_constraints import touches_outside


@dataclass(frozen=True)
class SoftRuleResult:
    name: str
    score: float
    warnings: list[QualityWarning] = field(default_factory=list)


def _rect(room: PlanRoom) -> Rect:
    return Rect(room.x, room.y, room.w, room.h)


def rooms_share_wall(a: PlanRoom, b: PlanRoom) -> bool:
    if a.floor != b.floor:
        return False
    if a.vertices is None and b.vertices is None:
        return _rect(a).shared_edge(_rect(b)) is not None
    shared = polygon.room_to_polygon(a).boundary.intersection(
        polygon.room_to_polygon(b).boundary
    )
    return shared.length > EPS


def _canonical(space_type: str) -> str:
    """Constraint endpoints are catalog keys ("dining_room", "foyer") since
    Phase 8 canonicalized them, while a `spec.rooms`-sourced plan emits raw
    `RoomType` values ("dining", "entry", "utility", "parking"). Matching the
    two spellings literally silently scored a satisfied MUST adjacency as
    unmet — resolve both sides the same way `hard_constraints` and
    `engine._place_doors` already do."""
    return catalog.resolve_alias(space_type) or space_type


def _rooms_by_type(plan: LayoutPlan) -> dict[str, list[PlanRoom]]:
    grouped: dict[str, list[PlanRoom]] = {}
    for room in plan.rooms:
        grouped.setdefault(_canonical(room.type), []).append(room)
    return grouped


def _pair_is_adjacent(a_rooms: list[PlanRoom], b_rooms: list[PlanRoom]) -> bool:
    for a in a_rooms:
        for b in b_rooms:
            if a.id != b.id and rooms_share_wall(a, b):
                return True
    return False


def adjacency_rule(plan: LayoutPlan, requirements: RequirementsSpec) -> SoftRuleResult:
    grouped = _rooms_by_type(plan)
    earned = 0.0
    possible = 0.0
    warnings: list[QualityWarning] = []

    for preference in requirements.adjacency:
        weight = 2.0 if preference.strength == "must" else 1.0
        possible += weight
        a_rooms = grouped.get(_canonical(preference.room_a), [])
        b_rooms = grouped.get(_canonical(preference.room_b), [])
        satisfied = bool(a_rooms and b_rooms) and _pair_is_adjacent(a_rooms, b_rooms)
        if satisfied:
            earned += weight
            continue
        a_label = preference.room_a.replace("_", " ").title()
        b_label = preference.room_b.replace("_", " ").title()
        qualifier = "must share a wall" if preference.strength == "must" else "would work better beside"
        warnings.append(
            QualityWarning(
                code=f"generic.adjacency.{preference.strength}",
                message=f"{a_label} {qualifier} {b_label}.",
                severity="warn" if preference.strength == "must" else "info",
            )
        )

    for pair in requirements.avoid_adjacency:
        possible += 2.0
        a_rooms = grouped.get(_canonical(pair.room_a), [])
        b_rooms = grouped.get(_canonical(pair.room_b), [])
        violates = bool(a_rooms and b_rooms) and _pair_is_adjacent(a_rooms, b_rooms)
        if not violates:
            earned += 2.0
            continue
        a_label = pair.room_a.replace("_", " ").title()
        b_label = pair.room_b.replace("_", " ").title()
        warnings.append(
            QualityWarning(
                code="generic.adjacency.avoid",
                message=f"{a_label} should be separated from {b_label}.",
            )
        )

    return SoftRuleResult(
        name="adjacency",
        score=earned / possible if possible else 1.0,
        warnings=warnings,
    )


def privacy_rule(plan: LayoutPlan, _requirements: RequirementsSpec) -> SoftRuleResult:
    entries = [room for room in plan.rooms if room.type == RoomType.entry]
    private_rooms = [
        room
        for room in plan.rooms
        if room.type in {RoomType.bedroom, RoomType.master_bedroom}
    ]
    if not entries or not private_rooms:
        return SoftRuleResult(name="privacy", score=1.0)

    warnings: list[QualityWarning] = []
    protected = 0
    for room in private_rooms:
        if any(rooms_share_wall(entry, room) for entry in entries):
            warnings.append(
                QualityWarning(
                    code="generic.privacy_entry",
                    message=f"{room.label} opens too directly onto the Entry; add a buffer space.",
                )
            )
        else:
            protected += 1
    return SoftRuleResult(
        name="privacy",
        score=protected / len(private_rooms),
        warnings=warnings,
    )


def natural_light_rule(plan: LayoutPlan, _requirements: RequirementsSpec) -> SoftRuleResult:
    daylight_rooms = [
        room
        for room in plan.rooms
        if room.type
        in {
            RoomType.bedroom,
            RoomType.master_bedroom,
            RoomType.living_room,
            RoomType.kitchen,
        }
    ]
    wet_rooms: list[PlanRoom] = []
    for room in plan.rooms:
        try:
            if catalog.get(room.type).wet_room:
                wet_rooms.append(room)
        except catalog.UnknownSpaceType:
            continue
    if not daylight_rooms and not wet_rooms:
        return SoftRuleResult(name="natural_light", score=1.0)

    lit = [room for room in daylight_rooms if touches_outside(room, plan)]
    warnings = [
        QualityWarning(
            code="generic.natural_light",
            message=f"{room.label} has no exterior edge for a daylight opening.",
            severity="info",
        )
        for room in daylight_rooms
        if room not in lit
    ]
    warnings.extend(
        QualityWarning(
            code="generic.wet_room_exterior",
            message=f"{room.label} has no exterior edge for direct ventilation.",
            severity="info",
        )
        for room in wet_rooms
        if not touches_outside(room, plan)
    )
    return SoftRuleResult(
        name="natural_light",
        score=len(lit) / len(daylight_rooms) if daylight_rooms else 1.0,
        warnings=warnings,
    )


def bath_kitchen_rule(plan: LayoutPlan, _requirements: RequirementsSpec) -> SoftRuleResult:
    kitchens = [room for room in plan.rooms if room.type == RoomType.kitchen]
    bathrooms = [room for room in plan.rooms if room.type == RoomType.bathroom]
    if not kitchens or not bathrooms:
        return SoftRuleResult(name="bath_kitchen", score=1.0)

    touching = [
        (kitchen, bathroom)
        for kitchen in kitchens
        for bathroom in bathrooms
        if rooms_share_wall(kitchen, bathroom)
    ]
    warnings = [
        QualityWarning(
            code="generic.bath_kitchen_separation",
            message=f"{bathroom.label} shares a wall with {kitchen.label}; add a service buffer where practical.",
        )
        for kitchen, bathroom in touching
    ]
    possible = len(kitchens) * len(bathrooms)
    return SoftRuleResult(
        name="bath_kitchen",
        score=(possible - len(touching)) / possible,
        warnings=warnings,
    )


def wet_stack_rule(plan: LayoutPlan, _requirements: RequirementsSpec) -> SoftRuleResult:
    def is_wet(room: PlanRoom) -> bool:
        try:
            return catalog.get(room.type).wet_room
        except catalog.UnknownSpaceType:
            return False

    wet_rooms = [
        room for room in plan.rooms
        if is_wet(room)
    ]
    upper_wet = [room for room in wet_rooms if room.floor > 0]
    if not upper_wet:
        return SoftRuleResult(name="wet_stack", score=1.0)

    def overlaps_below(room: PlanRoom) -> bool:
        if room.vertices is not None or any(
            below.vertices is not None for below in wet_rooms
        ):
            shape = polygon.room_to_polygon(room)
            return any(
                below.floor == room.floor - 1
                and shape.intersection(polygon.room_to_polygon(below)).area > EPS * EPS
                for below in wet_rooms
            )
        rect = _rect(room)
        return any(
            below.floor == room.floor - 1
            and min(rect.x2, _rect(below).x2) - max(rect.x, _rect(below).x) > EPS
            and min(rect.y2, _rect(below).y2) - max(rect.y, _rect(below).y) > EPS
            for below in wet_rooms
        )

    unstacked = [room for room in upper_wet if not overlaps_below(room)]
    return SoftRuleResult(
        name="wet_stack",
        score=(len(upper_wet) - len(unstacked)) / len(upper_wet),
        warnings=[
            QualityWarning(
                code="generic.wet_stack",
                message=f"{room.label} is not stacked over a wet room on the floor below.",
                severity="info",
            )
            for room in unstacked
        ],
    )


def floor_area_balance_rule(
    plan: LayoutPlan,
    _requirements: RequirementsSpec,
) -> SoftRuleResult:
    floors = sorted({room.floor for room in plan.rooms})
    if len(floors) <= 1:
        return SoftRuleResult(name="floor_area_balance", score=1.0)
    areas = [
        sum(polygon.room_area(room) for room in plan.rooms if room.floor == floor)
        for floor in floors
    ]
    score = min(areas) / max(areas) if max(areas) else 1.0
    warnings = []
    if score < 0.8:
        warnings.append(QualityWarning(
            code="generic.floor_area_balance",
            message="Floor areas differ by more than 20%; rebalance the level programs.",
            severity="info",
        ))
    return SoftRuleResult(
        name="floor_area_balance",
        score=score,
        warnings=warnings,
    )


def evaluate_generic_rules(
    plan: LayoutPlan,
    requirements: RequirementsSpec,
) -> list[SoftRuleResult]:
    """Stable rule order keeps identical input byte-for-byte deterministic."""

    return [
        adjacency_rule(plan, requirements),
        privacy_rule(plan, requirements),
        natural_light_rule(plan, requirements),
        bath_kitchen_rule(plan, requirements),
    ]
