import pytest
from httpx import AsyncClient
from pydantic import ValidationError

from app.schemas.design import SaveDesignRequest
from app.schemas.layout_plan import LayoutPlan


async def _token(client: AsyncClient, email: str) -> str:
    response = await client.post(
        "/api/auth/register",
        json={"name": "Payload User", "email": email, "password": "password123"},
    )
    return response.json()["access_token"]


async def test_extract_rejects_oversize_prompt(client: AsyncClient):
    token = await _token(client, "big-prompt@example.com")
    response = await client.post(
        "/api/extract",
        json={"prompt": "a" * 2001},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "UNPROCESSABLE_ENTITY"


def test_oversize_layout_json_rejected_by_schema():
    huge_layout = {"rooms": [{"label": "x" * 100} for _ in range(30_000)]}
    with pytest.raises(ValidationError):
        SaveDesignRequest(layout=huge_layout)


def test_normal_layout_accepted_by_schema():
    layout = {"version": "1.0", "rooms": [{"id": "a", "label": "Bedroom"}]}
    assert SaveDesignRequest(layout=layout).layout == layout


def _plan_room(index: int) -> dict:
    return {
        "id": f"r{index}",
        "type": "bedroom",
        "label": "Bedroom",
        "x": 0.0,
        "y": 0.0,
        "w": 3.0,
        "h": 3.0,
        "rotation": 0,
    }


def _plan(room_count: int) -> dict:
    return {
        "plot": {"width_m": 90.0, "depth_m": 90.0},
        "rooms": [_plan_room(i) for i in range(room_count)],
        "walls": [],
        "doors": [],
    }


def test_layout_plan_rejects_an_unbounded_room_list():
    """`hard_constraints.validate` is O(n^2) in the room count and emits a
    Violation per overlapping pair, so an unbounded list let one /api/validate
    request block the event loop for ~48 s. A realistic plan is well under the
    cap (the largest fixture has 14 rooms)."""
    with pytest.raises(ValidationError):
        LayoutPlan.model_validate(_plan(201))
    assert len(LayoutPlan.model_validate(_plan(200)).rooms) == 200


async def test_validate_endpoint_rejects_an_oversize_room_list(client: AsyncClient):
    token = await _token(client, "big-layout@example.com")
    response = await client.post(
        "/api/validate",
        json={"layout": _plan(500)},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "UNPROCESSABLE_ENTITY"


async def test_request_body_size_guard_returns_413(client: AsyncClient):
    # ~3.2 MB body — over the 3 MB request-body cap, rejected before parsing.
    oversized = (
        b'{"name":"' + b"a" * (3 * 1024 * 1024 + 1024)
        + b'","email":"huge@example.com","password":"password123"}'
    )
    response = await client.post(
        "/api/auth/register",
        content=oversized,
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413
    assert response.json()["code"] == "PAYLOAD_TOO_LARGE"
