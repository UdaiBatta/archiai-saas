"""Assistant: instruction -> validated commands -> engine-applied preview.

No real LLM: every test replaces ``chat_structured``.
"""

import json
from pathlib import Path

import pytest
from httpx import AsyncClient

from app.schemas.requirements import RequirementsSpec
from app.services import assistant
from app.services.layout_engine.engine import generate_plan
from app.services.llm_client import LLMInvalidOutput, LLMRateLimited, LLMUnavailable

FIXTURES = Path(__file__).parent / "fixtures" / "requirements"
SPEC = RequirementsSpec.model_validate(
    json.loads((FIXTURES / "2bhk.json").read_text(encoding="utf-8"))
)
# r1 Bedroom 1 (0,0 3.75x4.125), r2 Bedroom 2 (0,7.875), r5 Kitchen, r6 Living,
# r7 Balcony (4.938,9.231 2.437x2.769), r8 Entry (7.375,9.231 1.625x2.769)
PLAN = generate_plan(SPEC)
_FIELDS = ("room_id", "a", "b", "w", "h", "dx", "dy", "label", "kind", "add", "remove", "text")


def _cmd(op: str, **fields) -> dict:
    return {**{k: None for k in _FIELDS}, "op": op, **fields}


def _llm(*commands, summary="Doing it."):
    calls = []

    async def fake(system, user, schema):
        calls.append({"system": system, "user": user, "schema": schema})
        return {"summary": summary, "commands": list(commands)}

    fake.calls = calls
    return fake


async def _run(*commands, selected=None):
    return await assistant.plan_edits("do it", PLAN, SPEC, selected, chat=_llm(*commands))


def _room(result, room_id):
    return next(r for r in result["layout_after"].rooms if r.id == room_id)


async def test_resize_applies_and_rebuilds_walls():
    result = await _run(_cmd("resize_room", room_id="r7", w=2.0))
    assert _room(result, "r7").w == 2.0
    assert result["changed"] is True
    assert result["commands"][0]["description"] == "Resize Balcony to 2 m"
    assert result["layout_after"].walls  # derived geometry rebuilt


async def test_move_applies():
    result = await _run(_cmd("move_room", room_id="r8", dx=0, dy=-0.5))
    assert _room(result, "r8").y == pytest.approx(9.231 - 0.5, abs=0.01)


async def test_swap_exchanges_places():
    result = await _run(_cmd("swap_rooms", a="r1", b="r2"))
    assert (_room(result, "r1").y, _room(result, "r2").y) == (7.875, 0.0)
    assert not result["introduces_hard_violations"]


async def test_rename_applies():
    result = await _run(_cmd("rename_room", room_id="r1", label="  Guest   room "))
    assert _room(result, "r1").label == "Guest room"


async def test_set_connection_opens_shared_wall():
    result = await _run(_cmd("set_connection", a="r5", b="r6", kind="open"))
    conns = result["layout_after"].connections
    assert [(c.room_a, c.room_b, c.kind) for c in conns] == [("r5", "r6", "open")]
    assert any(
        w.kind == "open" and set(w.rooms or []) == {"r5", "r6"}
        for w in result["layout_after"].walls
    )


async def test_unknown_ids_are_rejected():
    result = await _run(
        _cmd("resize_room", room_id="r99", w=3),
        _cmd("swap_rooms", a="r1", b="ghost"),
        _cmd("change_program", remove=["nope"]),
    )
    assert result["commands"] == []
    assert result["changed"] is False
    assert any("r99" in w for w in result["warnings"])
    assert any("ghost" in w for w in result["warnings"])
    assert [r.model_dump() for r in result["layout_after"].rooms] == [
        r.model_dump() for r in PLAN.rooms
    ]


async def test_numbers_are_clamped_and_room_kept_on_plot():
    result = await _run(_cmd("resize_room", room_id="r7", w=500, h=0.01))
    room = _room(result, "r7")
    assert room.w == 9.0 and room.h == 1.0  # plot width / MIN_SIDE_M
    assert room.x == 0.0  # pushed back inside the plot
    assert sum("clamped" in w for w in result["warnings"]) == 2
    moved = await _run(_cmd("move_room", room_id="r8", dx=1000, dy=0))
    assert _room(moved, "r8").x + _room(moved, "r8").w == pytest.approx(9.0, abs=0.01)


async def test_hard_violations_are_flagged_not_hidden():
    result = await _run(_cmd("resize_room", room_id="r1", w=6))
    assert result["introduces_hard_violations"] is True
    assert result["quality_before"].valid and not result["quality_after"].valid
    assert any("breaks hard rules" in w for w in result["warnings"])


async def test_change_program_regenerates_with_updated_requirements():
    result = await _run(
        _cmd("change_program", add=[{"type": "study", "count": 1}], remove=["r7"]),
        _cmd("rename_room", room_id="r1", label="Skipped"),
    )
    types = [r.type for r in result["layout_after"].rooms]
    assert "study" in types and "balcony" not in types
    req = {r.type.value: r.count for r in result["requirements_after"].rooms}
    assert req.get("study") == 1 and "balcony" not in req
    assert [c["op"] for c in result["commands"]] == ["change_program"]
    assert any("regenerated" in w for w in result["warnings"])


async def test_change_program_with_catalog_only_type_moves_to_spaces():
    result = await _run(_cmd("change_program", add=[{"type": "store room", "count": 1}]))
    req = result["requirements_after"]
    spaces = {s.space_type: s.count for s in req.spaces}
    assert req.rooms == []
    assert spaces["bedroom"] == 2 and spaces["storage"] == 1
    assert "storage" in [r.type for r in result["layout_after"].rooms]


def test_program_add_count_is_clamped():
    commands, _ = assistant.validate_commands(
        [_cmd("change_program", add=[{"type": "study", "count": 40}])], PLAN
    )
    assert commands[0]["add"] == [{"type": "study", "count": assistant.MAX_ADD_COUNT}]


async def test_explain_changes_nothing_and_prompt_lists_rooms():
    fake = _llm(_cmd("explain", text="The balcony is small."))
    result = await assistant.plan_edits("why?", PLAN, SPEC, "r7", chat=fake)
    assert result["changed"] is False
    assert result["commands"][0]["text"] == "The balcony is small."
    system = fake.calls[0]["system"]
    assert "r7 | balcony | Balcony" in system and "selected r7 (Balcony)" in system
    assert fake.calls[0]["schema"] is assistant.COMMAND_SCHEMA


# ── API ──────────────────────────────────────────────────────────────────────


async def _token(client: AsyncClient) -> dict:
    response = await client.post(
        "/api/auth/register",
        json={"name": "A", "email": "assistant@example.com", "password": "password123"},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _body(**extra) -> dict:
    return {
        "instruction": "Make Bedroom 2 larger",
        "layout": PLAN.model_dump(mode="json"),
        "requirements": SPEC.model_dump(mode="json"),
        **extra,
    }


async def test_endpoint_requires_auth(client: AsyncClient):
    response = await client.post("/api/assistant/plan-edits", json=_body())
    assert response.status_code == 401


async def test_endpoint_returns_preview(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(
        assistant, "chat_structured", _llm(_cmd("rename_room", room_id="r2", label="Kids"))
    )
    response = await client.post(
        "/api/assistant/plan-edits",
        json=_body(selected_room_id="r2"),
        headers=await _token(client),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["changed"] and body["summary"] == "Doing it."
    assert any(r["label"] == "Kids" for r in body["layout_after"]["rooms"])
    assert {"quality_before", "quality_after", "requirements_after", "warnings"} <= body.keys()


async def test_endpoint_rejects_long_instruction(client: AsyncClient):
    response = await client.post(
        "/api/assistant/plan-edits",
        json=_body(instruction="x" * 501),
        headers=await _token(client),
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("failure", "status", "message"),
    [
        (LLMRateLimited("429"), 503, "The assistant is busy right now; try again in a minute."),
        (LLMUnavailable("down"), 503, "The assistant is unavailable right now. Please try again later."),
        (LLMInvalidOutput("junk"), 502, "The assistant returned an unreadable answer. Try rephrasing."),
    ],
)
async def test_endpoint_maps_llm_errors(client: AsyncClient, monkeypatch, failure, status, message):
    async def boom(**_):
        raise failure

    monkeypatch.setattr(assistant, "chat_structured", boom)
    response = await client.post(
        "/api/assistant/plan-edits", json=_body(), headers=await _token(client)
    )
    assert response.status_code == status
    assert response.json()["error"] == message
