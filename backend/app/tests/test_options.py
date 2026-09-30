"""Roadmap P4 — brief -> three distinct, scored options from the engine."""

import itertools
import json
from pathlib import Path

import pytest
from httpx import AsyncClient

from app.schemas.requirements import RequirementsSpec
from app.services import options as opts
from app.services.layout_engine.engine import generate_plan
from app.services.quality.scorer import score

FIXTURES = Path(__file__).parent / "fixtures" / "requirements"


def _spec(name: str = "3bhk_adjacencies") -> RequirementsSpec:
    return RequirementsSpec.model_validate(
        json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    )


@pytest.fixture(scope="module")
def three_bhk():
    spec = _spec()
    return spec, opts.generate_options(spec)


def test_plan_distance_is_zero_for_identical_and_symmetric():
    a = generate_plan(_spec())
    assert opts.plan_distance(a, a) == 0
    moved = a.model_copy(update={"rooms": [
        a.rooms[0].model_copy(update={"x": a.rooms[0].x + 3}), *a.rooms[1:]
    ]})
    d = opts.plan_distance(a, moved)
    assert d > 0
    assert d == pytest.approx(opts.plan_distance(moved, a))


def test_three_valid_distinct_sorted_options(three_bhk):
    spec, result = three_bhk
    assert len(result.options) == 3
    assert result.warnings == []
    for option in result.options:
        report = score(option.layout, spec)
        assert report.hard_violations == []
        assert option.score == report.score
    scores = [o.score for o in result.options]
    assert scores == sorted(scores, reverse=True)
    for a, b in itertools.combinations(result.options, 2):
        assert opts.plan_distance(a.layout, b.layout) >= opts.DISTINCT_THRESHOLD


def test_highlights_are_true(three_bhk):
    _spec_, result = three_bhk
    plans = [o.layout for o in result.options]
    scores = [o.score for o in result.options]
    facts = [opts._facts(p) for p in plans]
    for i, option in enumerate(result.options):
        assert 2 <= len(option.highlights) <= 3
        others = [j for j in range(len(plans)) if j != i]
        for line in option.highlights:
            if line == "Highest score":
                assert all(scores[i] > scores[j] for j in others)
            elif line.startswith("Largest living room"):
                assert all(opts._living_area(plans[i]) > opts._living_area(plans[j]) for j in others)
            elif line.startswith("Least corridor space"):
                assert all(opts._corridor_area(plans[i]) < opts._corridor_area(plans[j]) for j in others)
            elif line.startswith("Most rooms with daylight"):
                assert all(opts._daylit_rooms(plans[i]) > opts._daylit_rooms(plans[j]) for j in others)
            elif line.startswith("Living room "):
                assert line == f"Living room {opts._living_area(plans[i]):g} m²"
            elif line.endswith("rooms with daylight"):
                assert line == f"{opts._daylit_rooms(plans[i])} rooms with daylight"
            else:
                assert line in facts[i]
    # every option leads with something another option does not have
    for i, option in enumerate(result.options):
        lead = option.highlights[0]
        assert any(lead not in other.highlights for other in result.options)


def test_highlight_rules_on_synthetic_inputs():
    plan = generate_plan(_spec())
    bigger_living = plan.model_copy(update={"rooms": [
        r.model_copy(update={"w": r.w + 1}) if r.type == "living_room" else r for r in plan.rooms
    ]})
    lines = opts.highlights_for([plan, bigger_living], [90, 80])
    assert lines[0][0] == "Highest score"
    assert any(line.startswith("Largest living room") for line in lines[1])
    assert not any(line.startswith("Largest living room") for line in lines[0])


def test_options_are_deterministic(three_bhk):
    spec, result = three_bhk
    again = opts.generate_options(spec)
    assert [(o.score, o.highlights, o.layout.model_dump()) for o in again.options] == [
        (o.score, o.highlights, o.layout.model_dump()) for o in result.options
    ]


def test_fewer_than_three_options_warns():
    # Multi-floor programmes have a single-layout search space.
    spec = _spec("2bhk").model_copy(update={"floors": 2})
    result = opts.generate_options(spec)
    assert len(result.options) == 1
    assert result.warnings == ["Only 1 distinct valid option exists for this brief."]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_options_endpoint_requires_auth(client: AsyncClient):
    response = await client.post(
        "/api/options", json={"requirements": _spec().model_dump(mode="json")}
    )
    assert response.status_code == 401


async def test_options_endpoint_returns_three_options(client: AsyncClient):
    register = await client.post(
        "/api/auth/register",
        json={"name": "Options", "email": "options@example.com", "password": "password123"},
    )
    token = register.json()["access_token"]
    response = await client.post(
        "/api/options",
        json={"requirements": _spec().model_dump(mode="json"), "count": 3},
        headers=_auth(token),
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["options"]) == 3
    assert body["warnings"] == []
    for option in body["options"]:
        assert option["layout"]["rooms"]
        assert isinstance(option["score"], int)
        assert option["highlights"]
