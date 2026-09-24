"""The same brief must give the same program however the model reads it.

Each raw payload below is a real way Gemini read BRIEF (captured while
testing): an attached bathroom counted as bathroom AND ensuite, "dining area"
as a second dining room, a single bathroom, and rules naming rooms it never
listed. Reconciliation must settle every one to the brief's actual program.
"""
import pytest

from app.schemas.requirements import RequirementsSpec
from app.services.catalog import resolve_alias
from app.services.extraction import normalize_extraction

BRIEF = (
    "East-facing 3BHK house on a 12 x 15 m plot. Master bedroom with an attached "
    "bathroom, two more bedrooms sharing a common bathroom, a small pooja room, "
    "and an open kitchen that flows into the dining and living area. Add a balcony "
    "off the living room. Keep the kitchen away from the bathrooms."
)

_BASE = {
    "building_type": "house", "floors": 1, "plot": {"width_m": 12.0, "depth_m": 15.0},
    "facing": "east", "missing_info": [],
}
_EDGES = {
    "adjacency": [
        {"room_a": "master_bedroom", "room_b": "bathroom", "strength": "must"},
        {"room_a": "master_bedroom", "room_b": "ensuite", "strength": "must"},
        {"room_a": "kitchen", "room_b": "dining", "strength": "should"},
        {"room_a": "balcony", "room_b": "living_room", "strength": "must"},
    ],
    "avoid_adjacency": [{"room_a": "kitchen", "room_b": "bathroom"}],
}
_ROOMS = [
    {"type": "master_bedroom", "count": 1}, {"type": "bedroom", "count": 2},
    {"type": "pooja_room", "count": 1}, {"type": "kitchen", "count": 1},
    {"type": "living_room", "count": 1}, {"type": "balcony", "count": 1},
]

READINGS = {
    "two bathrooms plus an ensuite, dining twice": {
        **_BASE, **_EDGES, "rooms": [],
        "spaces": [
            *({"space_type": r["type"], "count": r["count"]} for r in _ROOMS),
            {"space_type": "bathroom", "count": 2}, {"space_type": "ensuite", "count": 1},
            {"space_type": "dining_room", "count": 1}, {"space_type": "dining_area", "count": 1},
        ],
    },
    "one bathroom": {
        **_BASE, **_EDGES, "spaces": [],
        "rooms": [*_ROOMS, {"type": "bathroom", "count": 1}, {"type": "dining", "count": 1}],
    },
    "two bathrooms (correct counts, stray ensuite rule)": {
        **_BASE, **_EDGES, "spaces": [],
        "rooms": [*_ROOMS, {"type": "bathroom", "count": 2}, {"type": "dining", "count": 1}],
    },
}


def _program(spec: RequirementsSpec) -> dict[str, int]:
    entries = (
        [(s.space_type, s.count) for s in spec.spaces]
        if spec.spaces else [(r.type.value, r.count) for r in spec.rooms]
    )
    program: dict[str, int] = {}
    for kind, count in entries:
        key = resolve_alias(kind) or kind
        program[key] = program.get(key, 0) + count
    return program


@pytest.mark.parametrize("reading", READINGS)
def test_every_reading_of_the_brief_gives_the_same_program(reading):
    spec = RequirementsSpec.model_validate(normalize_extraction(READINGS[reading], prompt=BRIEF))

    assert _program(spec) == {
        "master_bedroom": 1, "bedroom": 2, "bathroom": 2, "pooja_room": 1,
        "kitchen": 1, "living_room": 1, "dining_room": 1, "balcony": 1,
    }
    rules = {(frozenset((a.room_a, a.room_b)), a.strength) for a in spec.adjacency}
    assert (frozenset(("master_bedroom", "bathroom")), "must") in rules
    assert (frozenset(("bedroom", "bathroom")), "should") in rules  # the shared one
    assert all("ensuite" not in pair for pair, _ in rules)
    assert [frozenset((a.room_a, a.room_b)) for a in spec.avoid_adjacency] == [
        frozenset(("kitchen", "bathroom"))
    ]


@pytest.mark.parametrize(
    ("brief", "expected"),
    [
        ("2BHK flat with 2 bathrooms", 2),
        ("3BHK, each bedroom with an attached bathroom", 3),
        ("2BHK with an attached bathroom and a common toilet", 2),
        ("4 bedroom villa with 3 common bathrooms and an attached bath for the master", 4),
    ],
)
def test_the_brief_sets_the_bathroom_count(brief, expected):
    raw = {**_BASE, "rooms": [{"type": "bedroom", "count": 2}, {"type": "bathroom", "count": 1}],
           "spaces": [], "adjacency": [], "avoid_adjacency": []}
    spec = RequirementsSpec.model_validate(normalize_extraction(raw, prompt=brief))
    assert _program(spec)["bathroom"] == expected


def test_a_brief_that_does_not_mention_bathrooms_keeps_the_model_count():
    raw = {**_BASE, "rooms": [{"type": "bedroom", "count": 2}, {"type": "bathroom", "count": 2}],
           "spaces": [], "adjacency": [], "avoid_adjacency": []}
    spec = RequirementsSpec.model_validate(normalize_extraction(raw, prompt="2BHK house, 10 x 12 m"))
    assert _program(spec)["bathroom"] == 2


def test_the_review_screen_lists_keep_apart_rules():
    from app.services.mvp_pipeline_service import understood_summary

    spec = RequirementsSpec.model_validate(normalize_extraction(READINGS["one bathroom"], prompt=BRIEF))
    assert "Keep apart: kitchen ↔ bathroom" in understood_summary(spec)
