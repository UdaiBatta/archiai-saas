import json
from pathlib import Path

import pytest
from httpx import AsyncClient
from shapely.geometry import box

from app.schemas.layout_plan import LayoutPlan
from app.services.furnishing import furnish, violations
from app.services.furnishing.engine import _floors, _overlaps, _place_all

GOLDEN = Path(__file__).parent / "fixtures" / "golden"


def _goldens() -> dict[str, LayoutPlan]:
    plans = {k: v["layout"] for k, v in json.loads((GOLDEN / "phase9_layouts.json").read_text(encoding="utf-8")).items()}
    plans["villa_inland_balcony"] = json.loads((GOLDEN / "villa_inland_balcony.json").read_text(encoding="utf-8"))["layout"]
    return {k: LayoutPlan.model_validate(v) for k, v in plans.items()}


def _bedroom(w: float, h: float, *, door: bool = True, window: bool = False) -> LayoutPlan:
    """One room with its four walls, a door in the south wall, an optional
    window in the north wall."""
    walls = [
        {"id": "wn", "x1": 0, "y1": 0, "x2": w, "y2": 0},
        {"id": "we", "x1": w, "y1": 0, "x2": w, "y2": h},
        {"id": "ws", "x1": 0, "y1": h, "x2": w, "y2": h},
        {"id": "ww", "x1": 0, "y1": 0, "x2": 0, "y2": h},
    ]
    return LayoutPlan.model_validate({
        "plot": {"width_m": w, "depth_m": h},
        "rooms": [{"id": "r1", "type": "bedroom", "label": "Bedroom 2", "x": 0, "y": 0, "w": w, "h": h}],
        "walls": walls,
        "doors": [{"id": "d1", "wall_ref": "ws", "offset": 0.3, "width": 0.9}] if door else [],
        "windows": [{"id": "n1", "wall_ref": "wn", "offset": 0.5, "width": w - 1.0}] if window else [],
    })


@pytest.mark.parametrize("name", sorted(_goldens()))
def test_golden_plans_have_no_hard_violations(name):
    plan = _goldens()[name]
    assert violations(plan) == []


def test_every_item_inside_its_room_and_no_overlaps():
    plan = _goldens()["villa_inland_balcony"]
    placed, _ = _place_all(plan)
    rooms = {r.id: r for r in plan.rooms}
    assert placed
    for p in placed:
        r = rooms[p.item.room_id]
        assert box(r.x, r.y, r.x + r.w, r.y + r.h).covers(box(*p.body))
        for q in placed:
            if q is not p:
                assert not _overlaps(p.body, q.body)
                assert not any(_overlaps(p.body, c) for c in q.clear)


def test_door_swings_clear_and_clearances_respected():
    plan = _bedroom(3.6, 3.4)
    placed, warnings = _place_all(plan)
    assert warnings == []
    assert {p.item.kind for p in placed} == {"double_bed", "wardrobe"}
    swing = (0.3, 3.4 - 0.9, 1.2, 3.4)  # door width deep into the room
    for p in placed:
        assert not _overlaps(p.body, swing)
    bed = next(p for p in placed if p.item.kind == "double_bed")
    # 0.6 m on both long sides and at the foot, all inside the room.
    assert len(bed.clear) == 3
    assert sorted(round(min(c[2] - c[0], c[3] - c[1]), 3) for c in bed.clear) == [0.6, 0.6, 0.6]
    wardrobe = next(p for p in placed if p.item.kind == "wardrobe")
    assert [round(min(c[2] - c[0], c[3] - c[1]), 3) for c in wardrobe.clear] == [0.9]
    assert wardrobe.side != bed.side  # on another wall


def test_wardrobe_never_in_front_of_a_window_bed_may_be():
    plan = _bedroom(3.4, 3.2, window=True)
    windows = _floors(plan)[0].windows
    placed, _ = _place_all(plan)
    wardrobe = [p for p in placed if p.item.kind == "wardrobe"]
    assert all(not any(_overlaps(p.body, w) for w in windows) for p in wardrobe)
    assert violations(plan) == []


def test_tiny_room_warns_instead_of_crashing():
    plan = _bedroom(2.4, 2.9)
    items, warnings = furnish(plan)
    assert "Bedroom 2: no room for a wardrobe with 0.9 m in front" in warnings
    assert [i.kind for i in items] == ["single_bed"]
    assert violations(plan) == []

    items, warnings = furnish(_bedroom(1.0, 1.0))
    assert items == [] and len(warnings) == 2


def test_deterministic():
    plan = _goldens()["family_home"]
    assert furnish(plan) == furnish(plan)
    assert furnish(plan)[0]


def test_unknown_room_types_get_nothing():
    plan = _goldens()["warehouse"]
    items, _ = furnish(plan)
    rooms = {r.id: r.type for r in plan.rooms}
    assert all(rooms[i.room_id] not in ("corridor", "staircase", "storage") for i in items)


async def test_furnish_endpoint(client: AsyncClient):
    body = {"layout": _bedroom(3.6, 3.4).model_dump()}
    assert (await client.post("/api/furnish", json=body)).status_code == 401

    register = await client.post(
        "/api/auth/register",
        json={"name": "Furnish User", "email": "furnish@example.com", "password": "password123"},
    )
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}
    response = await client.post("/api/furnish", json=body, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["warnings"] == []
    assert {i["kind"] for i in data["items"]} == {"double_bed", "wardrobe"}
    assert set(data["items"][0]) == {"id", "room_id", "kind", "x", "y", "w", "d", "rotation", "floor"}

    bad = await client.post("/api/furnish", json={"layout": {"rooms": []}}, headers=headers)
    assert bad.status_code == 422
