"""Workflow Phase 10.1 — composed macro-zones around shared circulation."""

import json
from pathlib import Path

import pytest

from app.schemas.requirements import Facing
from app.schemas.requirements import RequirementsSpec
from app.services.layout_engine.search import best_candidate
from app.services.layout_engine.engine import generate_plan
from app.services.layout_engine.geometry import Rect
from app.services.quality.hard_constraints import _door_adjacency, validate


FIXTURES = Path(__file__).parent / "fixtures" / "requirements"
GOLDENS = Path(__file__).parent / "fixtures" / "golden" / "phase9_layouts.json"


def _load(name: str) -> RequirementsSpec:
    return RequirementsSpec.model_validate_json(
        (FIXTURES / name).read_text(encoding="utf-8")
    )


def test_school_composes_multiple_archetypes_around_one_shared_spine():
    spec = _load("phase10_composed_school.json")

    plan = generate_plan(spec)

    assert validate(plan, spec) == []
    assert plan.archetype_reasons is not None
    assert {reason.archetype for reason in plan.archetype_reasons} >= {
        "double_loaded_corridor",
        "open_core",
    }
    assert all(len(reason.spans) == 2 for reason in plan.archetype_reasons)
    assert all(room.zone_id for room in plan.rooms)

    hallway = next(room for room in plan.rooms if room.type == "hallway")
    classrooms = [room for room in plan.rooms if room.type == "classroom"]
    assert len(classrooms) == 4
    assert {room.zone_id for room in classrooms} == {"zone-repeat-classroom"}
    assert {room.x < hallway.x for room in classrooms} == {False, True}

    # The classroom wing connects directly to the shared spine and the whole
    # graph is reachable, but walls between neighbouring rooms stay solid:
    # composition does not regress into the old "door every eligible shared
    # wall" convenience policy.
    adjacency = _door_adjacency(plan)
    assert all(hallway.id in adjacency[room.id] for room in classrooms)
    reached = {hallway.id}
    pending = [hallway.id]
    while pending:
        current = pending.pop()
        for neighbour in adjacency[current] - reached:
            reached.add(neighbour)
            pending.append(neighbour)
    assert reached == {room.id for room in plan.rooms}
    west_classrooms = sorted(
        (room for room in classrooms if room.x < hallway.x),
        key=lambda room: room.y,
    )
    first = Rect(
        west_classrooms[0].x,
        west_classrooms[0].y,
        west_classrooms[0].w,
        west_classrooms[0].h,
    )
    second = Rect(
        west_classrooms[1].x,
        west_classrooms[1].y,
        west_classrooms[1].w,
        west_classrooms[1].h,
    )
    assert first.shared_edge(second) is not None
    assert west_classrooms[1].id not in adjacency[west_classrooms[0].id]
    # Spanning tree + one front door; rooms joined by an open-plan edge need
    # no door at all, so there can be fewer.
    assert len(plan.doors) <= len(plan.rooms)


def test_hierarchical_metadata_round_trips_in_the_canonical_contract():
    spec = _load("phase10_composed_school.json")
    plan = generate_plan(spec)

    payload = plan.model_dump(mode="json")
    restored = type(plan).model_validate(payload)

    assert payload["archetype_reasons"][0]["zone_id"] == "zone-repeat-classroom"
    assert all("zone_id" in room for room in payload["rooms"])
    assert restored == plan


@pytest.mark.parametrize("facing", list(Facing))
def test_composed_school_is_valid_from_every_facing(facing: Facing):
    spec = _load("phase10_composed_school.json").model_copy(
        update={"facing": facing}
    )

    plan = generate_plan(spec)

    assert validate(plan, spec) == []
    assert plan.archetype_reasons is not None
    assert len({reason.archetype for reason in plan.archetype_reasons}) >= 2


def test_hierarchical_best_of_n_is_deterministic():
    spec = _load("phase10_composed_school.json")

    first = best_candidate(spec, n=16, seed=42)
    second = best_candidate(spec, n=16, seed=42)

    assert first == second
    assert first.archetype_reasons is not None


def test_plain_house_remains_byte_identical_to_the_phase9_golden():
    spec = _load("template_family_home.json")
    expected = json.loads(GOLDENS.read_text(encoding="utf-8"))["family_home"]["layout"]

    plan = generate_plan(spec)

    assert plan.archetype_reasons is None
    assert all(room.zone_id is None for room in plan.rooms)
    assert plan.model_dump(mode="json") == expected
