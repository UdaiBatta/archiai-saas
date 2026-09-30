import time

import pytest
from httpx import AsyncClient

from app.schemas.housing import HousingFillRequest
from app.services.housing import HousingDoesNotFit, fill_housing
from app.services.housing.units import facade_violations, solve_unit, unit_spec
from app.services.layout_engine.geometry import EPS, Rect
from app.services.quality.hard_constraints import validate

MIX = [
    {"unit_type": "1bhk", "share": 0.3},
    {"unit_type": "2bhk", "share": 0.5},
    {"unit_type": "3bhk", "share": 0.2},
]
PLATE = [{"x": 0, "y": 0}, {"x": 40, "y": 0}, {"x": 40, "y": 15}, {"x": 0, "y": 15}]
_OPPOSITE = {"north": "south", "south": "north", "east": "west", "west": "east"}


def _request(**kw) -> HousingFillRequest:
    body = {"footprint": PLATE, "floors": 5, "floor_height_m": 3.0, "mix": MIX, "facing": "south"}
    return HousingFillRequest(**{**body, **kw})


def _rect(outline) -> Rect:
    xs, ys = [v.x for v in outline], [v.y for v in outline]
    return Rect(min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))


def _corridor_side(unit_rect: Rect, corridor: Rect) -> str:
    if abs(unit_rect.y2 - corridor.y) <= EPS:
        return "south"
    if abs(unit_rect.y - corridor.y2) <= EPS:
        return "north"
    if abs(unit_rect.x2 - corridor.x) <= EPS:
        return "east"
    return "west"


@pytest.fixture(scope="module")
def result():
    return fill_housing(_request())


def test_fill_40x15_five_floors_is_fast_and_stacked():
    start = time.perf_counter()
    res = fill_housing(_request(corridor_width_m=1.6))  # a fresh (uncached) plate
    assert time.perf_counter() - start < 3.0
    floors = {f: [u for u in res.units if u.floor == f] for f in range(5)}
    assert all(floors[f] for f in floors)
    first = [(u.unit_type, u.outline) for u in floors[0]]
    for f in range(1, 5):
        assert [(u.unit_type, u.outline) for u in floors[f]] == first


def test_every_interior_passes_hard_constraints_and_facade_daylight(result):
    corridor = _rect(result.corridors[0])
    for unit in result.units:
        r = _rect(unit.outline)
        side = _corridor_side(r, corridor)
        local = solve_unit(unit.unit_type, round(r.w, 3), round(r.d, 3), side)
        assert local is not None
        assert validate(local, unit_spec(unit.unit_type, round(r.w, 3), round(r.d, 3), side)) == []
        assert facade_violations(local, _OPPOSITE[side]) == []
        # The response plan is that plan moved onto the plate.
        for a, b in zip(local.rooms, unit.plan.rooms):
            assert (b.x, b.y) == pytest.approx((a.x + r.x, a.y + r.y), abs=1e-3)
        # Windows only on the facade, the front door on the corridor.
        walls = {w.id: w for w in unit.plan.walls}
        facade_y = r.y if side == "south" else r.y2
        assert unit.plan.windows
        assert all(abs(walls[w.wall_ref].y1 - facade_y) <= EPS for w in unit.plan.windows)
        corridor_y = r.y2 if side == "south" else r.y
        assert any(
            abs(walls[d.wall_ref].y1 - corridor_y) <= EPS and abs(walls[d.wall_ref].y2 - corridor_y) <= EPS
            for d in unit.plan.doors
        )


def test_no_overlaps_with_units_core_or_corridor(result):
    core, corridor = _rect(result.cores[0]), _rect(result.corridors[0])
    for f in range(5):
        rects = [_rect(u.outline) for u in result.units if u.floor == f]
        for i, a in enumerate(rects):
            assert not a.overlaps(core) and not a.overlaps(corridor)
            assert Rect(0, 0, 40, 15).contains(a)
            for b in rects[i + 1:]:
                assert not a.overlaps(b)


def test_yield_is_consistent(result):
    y = result.yield_
    assert y.total_units == len(result.units) == sum(y.units_by_type.values())
    assert y.gfa_m2 == pytest.approx(40 * 15 * 5)
    assert y.nsa_m2 == pytest.approx(sum(u.area_m2 for u in result.units), abs=0.05)
    assert y.efficiency == pytest.approx(y.nsa_m2 / y.gfa_m2, abs=1e-3)
    assert sum(y.mix_achieved.values()) == pytest.approx(1, abs=1e-3)
    assert set(y.units_by_type) == {"1bhk", "2bhk", "3bhk"}
    assert all(y.units_by_type[t] > 0 for t in y.units_by_type)
    assert 0.6 < y.efficiency < 0.95
    # The response serialises "yield" by its alias.
    assert "yield" in result.model_dump(by_alias=True)


def test_locked_units_are_kept_verbatim(result):
    locked = [u.model_copy(update={"locked": True}) for u in result.units if u.floor == 2][:2]
    again = fill_housing(_request(mix=[{"unit_type": "1bhk", "share": 1.0}], locked_units=locked))
    floor2 = [u for u in again.units if u.floor == 2]
    for unit in locked:
        assert unit in floor2
    ids = [u.id for u in again.units]
    assert len(ids) == len(set(ids))
    rects = [_rect(u.outline) for u in floor2]
    for i, a in enumerate(rects):
        for b in rects[i + 1:]:
            assert not a.overlaps(b)
    # The other floors are re-solved with the new mix; floor 2 fills around the locks.
    assert {u.unit_type for u in again.units if u.floor == 0} == {"1bhk"}
    assert any(not u.locked and u.unit_type == "1bhk" for u in floor2)


def test_irregular_footprint_warns_and_fills():
    l_shape = [
        {"x": 0, "y": 0}, {"x": 40, "y": 0}, {"x": 40, "y": 15},
        {"x": 15, "y": 15}, {"x": 15, "y": 30}, {"x": 0, "y": 30},
    ]
    res = fill_housing(_request(footprint=l_shape, floors=2))
    assert any("Irregular footprint" in w for w in res.warnings)
    assert res.yield_.total_units > 0
    assert res.yield_.gfa_m2 == pytest.approx((40 * 15 + 15 * 15) * 2)


def test_tiny_plate_does_not_fit():
    tiny = [{"x": 0, "y": 0}, {"x": 6, "y": 0}, {"x": 6, "y": 6}, {"x": 0, "y": 6}]
    with pytest.raises(HousingDoesNotFit):
        fill_housing(_request(footprint=tiny))


async def _headers(client: AsyncClient) -> dict:
    response = await client.post(
        "/api/auth/register",
        json={"name": "Housing User", "email": "housing@example.com", "password": "password123"},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_fill_endpoint(client: AsyncClient):
    body = _request(floors=2).model_dump(mode="json")
    assert (await client.post("/api/housing/fill", json=body)).status_code == 401

    headers = await _headers(client)
    response = await client.post("/api/housing/fill", json=body, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["yield"]["total_units"] == len(data["units"]) > 0

    tiny = {**body, "footprint": [{"x": 0, "y": 0}, {"x": 5, "y": 0}, {"x": 5, "y": 5}, {"x": 0, "y": 5}]}
    refused = await client.post("/api/housing/fill", json=tiny, headers=headers)
    assert refused.status_code == 422
    assert "Too small for housing" in refused.json()["error"]
