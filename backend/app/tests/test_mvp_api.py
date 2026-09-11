"""Workflow Phase 4 — authenticated API and persistence orchestration."""

import json
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.design import Design
from app.models.design_version import DesignVersion
from app.schemas.requirements import RequirementsSpec
from app.services.layout_engine.engine import generate_plan
from app.services.llm_client import LLMInvalidOutput, LLMTimeout, LLMUnavailable
from app.services.mvp_pipeline_service import understood_summary
from app.tests.conftest import TestSessionLocal

FIXTURES = Path(__file__).parent / "fixtures" / "requirements"


def _spec(name: str = "2bhk") -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


async def _register(client: AsyncClient, email: str) -> str:
    response = await client.post(
        "/api/auth/register",
        json={"name": "MVP User", "email": email, "password": "password123"},
    )
    assert response.status_code == 201
    return response.json()["access_token"]


async def _project(client: AsyncClient, token: str, title: str = "MVP Project") -> str:
    response = await client.post(
        "/api/projects",
        json={"title": title},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_understood_summary_uses_canonical_spaces_when_present():
    spec = RequirementsSpec.model_validate({
        "building_type": "other",
        "rooms": [{"type": "study", "count": 1}],
        "spaces": [
            {"space_type": "consultation_room", "count": 3},
            {"space_type": "waiting_room", "count": 1},
        ],
    })

    summary = understood_summary(spec)

    assert "3 consultation rooms" in summary
    assert "1 waiting room" in summary
    assert "1 study" not in summary


async def test_mvp_pipeline_endpoints_require_access_token(client: AsyncClient):
    spec = _spec()
    plan = generate_plan(RequirementsSpec.model_validate(spec)).model_dump(mode="json")

    responses = [
        await client.post("/api/extract", json={"prompt": "2 bedroom house"}),
        await client.post(
            "/api/generate",
            json={"requirements": spec, "useDefaults": False},
        ),
        await client.post("/api/validate", json={"layout": plan}),
    ]

    assert [response.status_code for response in responses] == [401, 401, 401]
    assert all(response.json()["code"] == "UNAUTHORIZED" for response in responses)


async def test_extract_returns_deterministic_route_summary_and_optional_fields(
    client: AsyncClient,
    monkeypatch,
):
    token = await _register(client, "mvp-extract@example.com")
    extracted = RequirementsSpec.model_validate(_spec())

    async def fake_extract(prompt: str) -> RequirementsSpec:
        assert prompt == "Design a two bedroom apartment"
        return extracted

    monkeypatch.setattr("app.api.mvp.router.extract_requirements", fake_extract)

    response = await client.post(
        "/api/extract",
        json={"prompt": "Design a two bedroom apartment"},
        headers=_auth(token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["requirements"] == extracted.model_dump(mode="json")
    assert body["route"] == "generate"
    assert body["questions"] == []
    assert body["optional_missing"] == []
    assert "2 bedrooms" in body["understood_summary"]
    assert "Plot: 9 × 12 m" in body["understood_summary"]


@pytest.mark.parametrize(
    ("failure", "expected_status", "expected_code", "expected_message"),
    [
        (
            LLMUnavailable("provider is down"),
            503,
            "SERVICE_UNAVAILABLE",
            "The AI provider is unavailable. Check the LLM provider "
            "configuration (LLM_BASE_URL / LLM_API_KEY) and try again.",
        ),
        (
            LLMTimeout("provider exceeded the timeout"),
            504,
            "GATEWAY_TIMEOUT",
            "The AI provider took too long to respond. Please try again.",
        ),
        (
            LLMInvalidOutput("provider returned malformed JSON"),
            502,
            "BAD_GATEWAY",
            "The AI provider returned an invalid structured response. Try again or simplify the brief.",
        ),
    ],
)
async def test_extract_maps_local_model_failures_to_actionable_errors(
    client: AsyncClient,
    monkeypatch,
    failure,
    expected_status: int,
    expected_code: str,
    expected_message: str,
):
    token = await _register(
        client,
        f"mvp-llm-{failure.__class__.__name__.lower()}@example.com",
    )

    async def fail_extraction(_: str) -> RequirementsSpec:
        raise failure

    monkeypatch.setattr("app.api.mvp.router.extract_requirements", fail_extraction)

    response = await client.post(
        "/api/extract",
        json={"prompt": "Design a two bedroom house"},
        headers=_auth(token),
    )

    assert response.status_code == expected_status
    assert response.json() == {
        "error": expected_message,
        "code": expected_code,
        "status": expected_status,
    }


async def test_generate_returns_ordered_geometric_alternatives(
    client: AsyncClient,
):
    """The options gallery consumes best-of-64 runners-up: rectangular
    programmes return up to 3 geometrically distinct alternatives ordered by
    score; the winner itself is the separate `layout` field, never repeated."""
    token = await _register(client, "mvp-alternatives@example.com")

    response = await client.post(
        "/api/generate",
        json={"requirements": _spec(), "useDefaults": False},
        headers=_auth(token),
    )

    assert response.status_code == 200
    body = response.json()
    alternatives = body["alternatives"]
    assert 1 <= len(alternatives) <= 3
    scores = [alternative["score"] for alternative in alternatives]
    assert scores == sorted(scores, reverse=True)
    # winner is never repeated among the alternatives (canvas rooms are
    # center-based; convert back to the plan's NW-origin frame to compare)
    winner_rooms = {
        (room["type"], room["x"], room["y"], room["w"], room["h"])
        for room in body["layout"]["rooms"]
    }
    signatures = []
    for alternative in alternatives:
        assert alternative["version"] == "1.0"
        assert alternative["rooms"]
        alternative_rooms = {
            (
                room["roomType"],
                round(room["position"]["x"] - room["size"]["w"] / 2, 2),
                round(room["position"]["z"] - room["size"]["d"] / 2, 2),
                room["size"]["w"],
                room["size"]["d"],
            )
            for room in alternative["rooms"]
        }
        assert alternative_rooms != winner_rooms
        signatures.append(frozenset(alternative_rooms))
    # geometrically distinct from each other as well
    assert len(set(signatures)) == len(signatures)


async def test_generate_multi_floor_returns_no_alternatives(client: AsyncClient):
    """Polygon/multi-floor programmes have a single-layout search space — the
    empty list is the honest signal the UI renders as 'one optimal layout'."""
    token = await _register(client, "mvp-alt-multifloor@example.com")
    spec = RequirementsSpec.model_validate(_spec()).model_copy(update={"floors": 2})

    response = await client.post(
        "/api/generate",
        json={"requirements": spec.model_dump(mode="json"), "useDefaults": False},
        headers=_auth(token),
    )

    assert response.status_code == 200
    assert response.json()["alternatives"] == []


async def test_generate_persists_all_canonical_artifacts_and_legacy_canvas_layout(
    client: AsyncClient,
):
    token = await _register(client, "mvp-generate@example.com")
    project_id = await _project(client, token)
    spec = _spec()

    response = await client.post(
        "/api/generate",
        json={
            "prompt": "Two bedroom apartment",
            "requirements": spec,
            "useDefaults": False,
            "projectId": project_id,
        },
        headers=_auth(token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["quality"]["valid"] is True
    assert body["quality"]["hard_violations"] == []
    assert 0 <= body["quality"]["score"] <= 100
    assert isinstance(body["quality"]["warnings"], list)
    assert body["layout"]["plot"] == {
        "width_m": 9.0,
        "depth_m": 12.0,
        "facing": "east",
        "boundary": None,
    }
    assert body["designId"]
    assert body["designVersionId"]

    async with TestSessionLocal() as session:
        design = await session.get(Design, body["designId"])
        version = await session.get(DesignVersion, body["designVersionId"])

        assert design is not None
        assert version is not None
        # `spaces` (Phase 1 SpaceCatalog migration), `plot.boundary` (Phase 8
        # polygon-boundary engine), `layout_style` (Phase 3.2 archetype
        # selector), and `rule_packs` (generalization Phase 6)
        # selector) are new additive fields with None/empty-list defaults;
        # the fixture predates all three, so the persisted, fully-validated
        # model legitimately has more keys than the raw input fixture — not
        # a round-trip fidelity loss.
        assert version.requirements_json == {
            **spec, "spaces": [], "plot": {**spec["plot"], "boundary": None},
            "layout_style": None, "rule_packs": None, "accessibility_mode": False,
        }
        assert version.canonical_layout_json == body["layout"]
        assert version.quality_json == body["quality"]
        assert design.layout_json["metadata"]["pipeline"] == "mvp"
        assert design.layout_json["metadata"]["mvpVastuEnabled"] is False
        assert design.layout_json["metadata"]["mvpRequirements"] == {
            **spec, "spaces": [], "plot": {**spec["plot"], "boundary": None},
            "layout_style": None, "rule_packs": None, "accessibility_mode": False,
        }
        assert design.layout_json["metadata"]["mvpQuality"] == body["quality"]
        assert version.layout_json["metadata"]["mvpQuality"] == body["quality"]
        object_types = {item["objectType"] for item in design.layout_json["rooms"]}
        assert {"room", "wall", "door"} <= object_types

    latest = await client.get(
        f"/api/design/project/{project_id}/latest",
        headers=_auth(token),
    )
    assert latest.status_code == 200
    assert latest.json()["designId"] == body["designId"]
    assert latest.json()["metadata"]["mvpRequirements"] == {
        **spec, "spaces": [], "plot": {**spec["plot"], "boundary": None},
        "layout_style": None, "rule_packs": None, "accessibility_mode": False,
    }
    assert latest.json()["metadata"]["mvpQuality"] == body["quality"]
    assert latest.json()["metadata"]["mvpVastuEnabled"] is False

    fetched = await client.get(
        f"/api/versions/{body['designVersionId']}",
        headers=_auth(token),
    )
    assert fetched.status_code == 200
    assert fetched.json()["layout"] == body["layout"]
    assert fetched.json()["requirements"] == {
        **spec, "spaces": [], "plot": {**spec["plot"], "boundary": None},
        "layout_style": None, "rule_packs": None, "accessibility_mode": False,
    }


async def test_generate_returns_multi_floor_canonical_and_canvas_geometry(
    client: AsyncClient,
):
    token = await _register(client, "mvp-multifloor@example.com")
    spec = {
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
    }

    response = await client.post(
        "/api/generate",
        json={"requirements": spec},
        headers=_auth(token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["quality"]["valid"] is True
    assert {room["floor"] for room in body["layout"]["rooms"]} == {0, 1}
    stairs = [
        room for room in body["layout"]["rooms"]
        if room["type"] == "staircase"
    ]
    assert len(stairs) == 2
    assert {
        (room["x"], room["y"], room["w"], room["h"])
        for room in stairs
    } == {(0.0, 0.0, 1.2, 2.4)}


async def test_generate_returns_structured_plot_clarification_when_program_does_not_fit(
    client: AsyncClient,
):
    token = await _register(client, "mvp-small-plot@example.com")
    spec = _spec()
    spec["plot"] = {"width_m": 4.0, "depth_m": 4.0}

    response = await client.post(
        "/api/generate",
        json={"requirements": spec, "useDefaults": False},
        headers=_auth(token),
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["route"] == "conflict"
    assert "plot" in error["questions"][0].lower()
    assert error["trade_offs"]
    assert "increase the plot" in error["trade_offs"][0].lower()
    assert response.json()["code"] == "UNPROCESSABLE_ENTITY"


async def test_generate_with_defaults_returns_explicit_assumptions(client: AsyncClient):
    token = await _register(client, "mvp-defaults@example.com")
    spec = _spec("1bhk")

    response = await client.post(
        "/api/generate",
        json={"requirements": spec, "useDefaults": True},
        headers=_auth(token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["defaults_applied"] == ["9×12 m plot", "east facing"]
    assert body["requirements"]["plot"] == {"width_m": 9.0, "depth_m": 12.0, "boundary": None}
    assert body["requirements"]["facing"] == "east"
    assert body["requirements"]["missing_info"] == []


async def test_generate_only_applies_vastu_when_the_prompt_requests_it(
    client: AsyncClient,
):
    token = await _register(client, "mvp-vastu-opt-in@example.com")
    spec = _spec()

    ordinary = await client.post(
        "/api/generate",
        json={"requirements": spec, "prompt": "Two bedroom apartment"},
        headers=_auth(token),
    )
    requested = await client.post(
        "/api/generate",
        json={"requirements": spec, "prompt": "Vastu two bedroom apartment"},
        headers=_auth(token),
    )

    assert ordinary.status_code == 200
    assert requested.status_code == 200
    assert all(warning["rule"] != "vastu" for warning in ordinary.json()["quality"]["warnings"])
    assert any(warning["rule"] == "vastu" for warning in requested.json()["quality"]["warnings"])


async def test_validate_recomputes_hard_violations(client: AsyncClient):
    token = await _register(client, "mvp-validate@example.com")
    plan = generate_plan(RequirementsSpec.model_validate(_spec())).model_dump(mode="json")
    plan["rooms"][1]["x"] = plan["rooms"][0]["x"]
    plan["rooms"][1]["y"] = plan["rooms"][0]["y"]

    response = await client.post(
        "/api/validate",
        json={"layout": plan},
        headers=_auth(token),
    )

    assert response.status_code == 200
    assert response.json()["valid"] is False
    assert "overlap" in {
        violation["code"] for violation in response.json()["hard_violations"]
    }


async def test_validate_full_returns_weighted_quality_without_changing_fast_default(
    client: AsyncClient,
):
    token = await _register(client, "mvp-full-quality@example.com")
    spec = _spec("3bhk_adjacencies")
    plan = generate_plan(RequirementsSpec.model_validate(spec)).model_dump(mode="json")

    fast = await client.post(
        "/api/validate",
        json={"layout": plan},
        headers=_auth(token),
    )
    full = await client.post(
        "/api/validate?full=true",
        json={"layout": plan, "requirements": spec},
        headers=_auth(token),
    )

    assert fast.status_code == 200
    assert fast.json() == {"valid": True, "hard_violations": []}
    assert full.status_code == 200
    assert full.json()["valid"] is True
    assert 0 <= full.json()["score"] <= 100
    assert isinstance(full.json()["warnings"], list)
    assert "layout" not in full.json()


async def test_full_validation_rebuilds_derived_geometry_but_fast_path_does_not(
    client: AsyncClient,
):
    token = await _register(client, "mvp-derived-quality@example.com")
    spec = _spec("3bhk_adjacencies")
    plan = generate_plan(RequirementsSpec.model_validate(spec)).model_dump(mode="json")
    plan["walls"] = []
    plan["doors"] = []

    fast = await client.post(
        "/api/validate",
        json={"layout": plan},
        headers=_auth(token),
    )
    full = await client.post(
        "/api/validate?full=true",
        json={"layout": plan, "requirements": spec},
        headers=_auth(token),
    )

    assert fast.status_code == 200
    assert fast.json()["valid"] is False
    assert "unreachable" in {
        violation["code"] for violation in fast.json()["hard_violations"]
    }
    assert full.status_code == 200
    assert full.json()["valid"] is True
    assert full.json()["hard_violations"] == []


async def test_full_validation_can_return_the_exact_rebuilt_editor_layout(
    client: AsyncClient,
):
    token = await _register(client, "mvp-derived-sync@example.com")
    spec = _spec("3bhk_adjacencies")
    plan = generate_plan(RequirementsSpec.model_validate(spec)).model_dump(mode="json")
    plan["walls"] = []
    plan["doors"] = []

    response = await client.post(
        "/api/validate?full=true&includeLayout=true",
        json={"layout": plan, "requirements": spec},
        headers=_auth(token),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["quality"]["valid"] is True
    assert payload["layout"]["rooms"] == plan["rooms"]
    assert payload["layout"]["walls"]
    assert payload["layout"]["doors"]
    wall_ids = {wall["id"] for wall in payload["layout"]["walls"]}
    assert all(door["wall_ref"] in wall_ids for door in payload["layout"]["doors"])


async def test_validation_layout_sync_requires_full_scoring(client: AsyncClient):
    token = await _register(client, "mvp-derived-sync-fast@example.com")
    plan = generate_plan(
        RequirementsSpec.model_validate(_spec())
    ).model_dump(mode="json")

    response = await client.post(
        "/api/validate?includeLayout=true",
        json={"layout": plan},
        headers=_auth(token),
    )

    assert response.status_code == 422
    assert "full quality" in response.json()["error"].lower()


async def test_validate_full_requires_requirements(client: AsyncClient):
    token = await _register(client, "mvp-full-quality-missing@example.com")
    plan = generate_plan(RequirementsSpec.model_validate(_spec())).model_dump(mode="json")

    response = await client.post(
        "/api/validate?full=true",
        json={"layout": plan},
        headers=_auth(token),
    )

    assert response.status_code == 422
    assert "requirements" in response.json()["error"].lower()


async def test_version_save_recomputes_quality_and_enforces_project_access(
    client: AsyncClient,
):
    owner = await _register(client, "mvp-version-owner@example.com")
    intruder = await _register(client, "mvp-version-intruder@example.com")
    project_id = await _project(client, owner, "Versioned MVP")
    spec = _spec()

    generated = await client.post(
        "/api/generate",
        json={
            "prompt": "Two bedroom apartment",
            "requirements": spec,
            "useDefaults": False,
            "projectId": project_id,
        },
        headers=_auth(owner),
    )
    assert generated.status_code == 200
    plan = generated.json()["layout"]
    plan["walls"] = []
    plan["doors"] = []
    forged_quality = {
        "valid": False,
        "hard_violations": [
            {"code": "forged", "room_ids": [], "message": "client says invalid"}
        ],
    }
    payload = {
        "prompt": "Saved after an edit",
        "requirements": spec,
        "layout": plan,
        "quality": forged_quality,
    }

    forbidden = await client.post(
        f"/api/projects/{project_id}/versions",
        json=payload,
        headers=_auth(intruder),
    )
    assert forbidden.status_code == 403

    saved = await client.post(
        f"/api/projects/{project_id}/versions",
        json=payload,
        headers=_auth(owner),
    )
    assert saved.status_code == 201
    assert saved.json()["versionNumber"] == 2
    assert saved.json()["layout"]["walls"]
    assert saved.json()["layout"]["doors"]
    assert saved.json()["quality"]["valid"] is True
    assert saved.json()["quality"]["hard_violations"] == []
    assert 0 <= saved.json()["quality"]["score"] <= 100
    assert "forged" not in {
        violation["code"]
        for violation in saved.json()["quality"]["hard_violations"]
    }

    hidden = await client.get(
        f"/api/versions/{saved.json()['id']}",
        headers=_auth(intruder),
    )
    assert hidden.status_code == 403


async def test_duplicate_project_preserves_canonical_mvp_artifacts(
    client: AsyncClient,
):
    token = await _register(client, "mvp-duplicate@example.com")
    project_id = await _project(client, token, "Canonical source")
    spec = _spec()

    generated = await client.post(
        "/api/generate",
        json={
            "prompt": "Two bedroom apartment",
            "requirements": spec,
            "projectId": project_id,
        },
        headers=_auth(token),
    )
    assert generated.status_code == 200

    duplicate = await client.post(
        f"/api/projects/{project_id}/duplicate",
        headers=_auth(token),
    )
    assert duplicate.status_code == 201

    async with TestSessionLocal() as session:
        copied_version = await session.scalar(
            select(DesignVersion).where(
                DesignVersion.project_id == duplicate.json()["id"]
            )
        )
        assert copied_version is not None
        assert copied_version.requirements_json == generated.json()["requirements"]
        assert copied_version.canonical_layout_json == generated.json()["layout"]
        assert copied_version.quality_json == generated.json()["quality"]

    fetched = await client.get(
        f"/api/versions/{copied_version.id}",
        headers=_auth(token),
    )
    assert fetched.status_code == 200
    assert fetched.json()["layout"] == generated.json()["layout"]


async def test_extract_rejects_prompts_over_two_thousand_characters(client: AsyncClient):
    token = await _register(client, "mvp-long-prompt@example.com")

    response = await client.post(
        "/api/extract",
        json={"prompt": "x" * 2001},
        headers=_auth(token),
    )

    assert response.status_code == 422
    assert response.json()["code"] == "UNPROCESSABLE_ENTITY"
