"""Workflow Phase 7 canonical multi-floor generation."""

import json
from pathlib import Path

import pytest

from app.schemas.requirements import RequirementsSpec
from app.services.layout_engine import generate_plan
from app.services.layout_engine.search import best_candidate
from app.services.quality.hard_constraints import validate


FIXTURES = Path(__file__).parent / "fixtures" / "requirements"


def _two_storey() -> RequirementsSpec:
    return RequirementsSpec.model_validate({
        "building_type": "duplex",
        "floors": 2,
        "rooms": [
            {"type": "living_room", "count": 1},
            {"type": "kitchen", "count": 1},
            {"type": "bedroom", "count": 3},
            {"type": "bathroom", "count": 2},
        ],
        "plot": {"width_m": 12, "depth_m": 14},
        "facing": "east",
    })


def _hotel() -> RequirementsSpec:
    return RequirementsSpec.model_validate({
        "building_type": "other",
        "floors": 3,
        "spaces": [
            {"space_type": "reception", "count": 1},
            {"space_type": "waiting_room", "count": 1},
            {"space_type": "dining_room", "count": 1},
            {"space_type": "kitchen", "count": 1},
            {"space_type": "bedroom", "count": 6},
            {"space_type": "bathroom", "count": 3},
        ],
        "plot": {"width_m": 16, "depth_m": 20},
        "facing": "south",
    })


def _footprints(plan, room_type: str):
    """Rects relative to the building's own corner (it may sit in a yard)."""
    ox, oy = (plan.footprint.x, plan.footprint.y) if plan.footprint else (0.0, 0.0)
    return {
        (round(room.x - ox, 3), round(room.y - oy, 3), room.w, room.h)
        for room in plan.rooms
        if room.type == room_type
    }


def test_two_storey_home_splits_day_and_night_zones_and_stays_valid():
    spec = _two_storey()

    plan = generate_plan(spec)

    assert validate(plan, spec) == []
    assert {room.floor for room in plan.rooms} == {0, 1}
    assert {
        room.type for room in plan.rooms if room.floor == 0
    } >= {"entry", "living_room", "kitchen"}
    assert {
        room.type for room in plan.rooms if room.floor == 1
    } >= {"bedroom"}
    assert all(
        room.floor == 1
        for room in plan.rooms
        if room.type == "bedroom"
    )


def test_four_bhk_fixture_splits_day_and_night_zones_across_two_floors():
    payload = json.loads((FIXTURES / "4bhk.json").read_text(encoding="utf-8"))
    spec = RequirementsSpec.model_validate({**payload, "floors": 2})

    plan = generate_plan(spec)

    assert validate(plan, spec) == []
    assert all(
        room.floor == 0
        for room in plan.rooms
        if room.type in {"entry", "living_room", "kitchen", "dining", "parking"}
    )
    assert all(
        room.floor == 1
        for room in plan.rooms
        if room.type in {"bedroom", "master_bedroom"}
    )


def test_staircases_are_exactly_aligned_and_geometry_ids_are_unique():
    plan = generate_plan(_two_storey())

    stairs = [room for room in plan.rooms if room.type == "staircase"]
    assert len(stairs) == 2
    assert _footprints(plan, "staircase") == {(0.0, 0.0, 1.2, 2.4)}
    assert len({room.id for room in plan.rooms}) == len(plan.rooms)
    assert len({wall.id for wall in plan.walls}) == len(plan.walls)
    assert len({door.id for door in plan.doors}) == len(plan.doors)

    walls = {wall.id: wall for wall in plan.walls}
    assert all(
        door.floor == walls[door.wall_ref].floor
        for door in plan.doors
    )


def test_three_floor_hotel_program_gets_aligned_stairs_and_lifts():
    spec = _hotel()

    plan = generate_plan(spec)

    assert validate(plan, spec) == []
    assert _footprints(plan, "staircase") == {(0.0, 0.0, 1.8, 2.4)}
    assert _footprints(plan, "lift") == {(0.0, 2.4, 1.8, 1.8)}
    assert len([room for room in plan.rooms if room.type == "staircase"]) == 3
    assert len([room for room in plan.rooms if room.type == "lift"]) == 3
    assert all(
        room.floor == 0
        for room in plan.rooms
        if room.type in {"reception", "waiting_room", "dining_room", "kitchen", "entry"}
    )


def test_requested_lift_below_the_three_floor_threshold_stays_aligned():
    """A two-floor brief that asks for a lift: `ensure_vertical_circulation`
    only pinned lifts per floor at 3+ floors (or accessibility_mode), so the
    single requested lift landed on one floor and widened only that floor's
    vertical core — misaligning the staircases and, because the reachability
    walk only bridges levels through an exactly aligned stair/lift, leaving
    the whole upper storey unreachable."""
    spec = RequirementsSpec.model_validate({
        "building_type": "other",
        "floors": 2,
        "spaces": [
            {"space_type": "lift", "count": 1},
            {"space_type": "bedroom", "count": 2},
            {"space_type": "kitchen", "count": 1},
            {"space_type": "living_room", "count": 1},
            {"space_type": "bathroom", "count": 2},
        ],
        "plot": {"width_m": 18, "depth_m": 20},
        "facing": "east",
    })

    plan = generate_plan(spec)

    assert validate(plan, spec) == []
    assert len(_footprints(plan, "staircase")) == 1
    assert len(_footprints(plan, "lift")) == 1
    assert len([room for room in plan.rooms if room.type == "lift"]) == 2


def test_requested_staircase_is_resized_to_the_commercial_core_on_every_floor():
    """Same defect from the other direction: a user-supplied `staircase` keeps
    its catalog 2.4x1.2 sizing while the injected upper-floor stair of a
    clinic/office program is 2.4x1.5, so the two cores had different widths."""
    spec = RequirementsSpec.model_validate({
        "building_type": "office",
        "floors": 2,
        "spaces": [
            {"space_type": "staircase", "count": 1},
            {"space_type": "open_office", "count": 1},
            {"space_type": "meeting_room", "count": 2},
            {"space_type": "reception", "count": 1},
            {"space_type": "bathroom", "count": 2},
        ],
        "plot": {"width_m": 20, "depth_m": 24},
        "facing": "east",
    })

    plan = generate_plan(spec)

    assert validate(plan, spec) == []
    assert len(_footprints(plan, "staircase")) == 1


def test_multi_floor_generation_refuses_rather_than_returning_an_invalid_plan(monkeypatch):
    """`plan_from_program` skips its hard check for floors > 1 because
    cross-floor rules can only be judged after assembly — this pins that the
    assembly step actually performs it."""
    from app.services.layout_engine import engine

    spec = _two_storey()
    real_plan_from_program = engine.plan_from_program

    def _misalign(*args, **kwargs):
        plan = real_plan_from_program(*args, **kwargs)
        if kwargs.get("floor") != 1:
            return plan
        return plan.model_copy(update={
            "rooms": [
                room.model_copy(update={"x": room.x + 0.5})
                if room.type == "staircase"
                else room
                for room in plan.rooms
            ],
        })

    monkeypatch.setattr(engine, "plan_from_program", _misalign)

    with pytest.raises(engine.DoesNotFitError):
        generate_plan(spec)


def test_candidate_entrypoint_dispatches_multi_floor_to_the_proven_path():
    spec = _two_storey()

    assert best_candidate(spec) == generate_plan(spec)


def test_hard_validator_rejects_a_misaligned_staircase():
    spec = _two_storey()
    plan = generate_plan(spec)
    shifted = [
        room.model_copy(update={"x": room.x + 0.5})
        if room.type == "staircase" and room.floor == 1
        else room
        for room in plan.rooms
    ]

    violations = validate(plan.model_copy(update={"rooms": shifted}), spec)

    assert any(violation.code == "staircase_alignment" for violation in violations)


def test_hard_validator_rejects_a_missing_intermediate_floor():
    spec = _hotel()
    plan = generate_plan(spec)
    without_first_floor = plan.model_copy(update={
        "rooms": [room for room in plan.rooms if room.floor != 1],
    })

    violations = validate(without_first_floor, spec)

    assert any(violation.code == "staircase_alignment" for violation in violations)
