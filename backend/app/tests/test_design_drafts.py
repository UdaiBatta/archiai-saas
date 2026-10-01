from httpx import AsyncClient
from sqlalchemy import func, select

from app.models.design_version import DesignVersion
from app.tests.conftest import TestSessionLocal
from app.tests.conftest import generate_design


async def _register_and_token(client: AsyncClient, email: str) -> str:
    response = await client.post(
        "/api/auth/register",
        json={"name": "Draft User", "email": email, "password": "password123"},
    )
    return response.json()["access_token"]


async def _create_design(client: AsyncClient, token: str, email_slug: str) -> dict:
    project = await client.post(
        "/api/projects",
        json={"title": f"Draft Project {email_slug}", "description": None},
        headers={"Authorization": f"Bearer {token}"},
    )
    response = await generate_design(client, {"Authorization": f"Bearer {token}"}, project.json()["id"])
    return response.json()


def _draft_layout(layout: dict, label: str = "Draft Living Room") -> dict:
    draft = {
        **layout,
        "rooms": [{**room} for room in layout["rooms"]],
    }
    draft["rooms"][0]["label"] = label
    draft["metadata"] = {
        **draft["metadata"],
        "draftMarker": label,
    }
    return draft


async def test_authenticated_user_can_save_draft_for_own_design(client: AsyncClient):
    token = await _register_and_token(client, "draft-save@example.com")
    layout = await _create_design(client, token, "save")
    draft = _draft_layout(layout)

    response = await client.put(
        f"/api/design/{layout['designId']}/draft",
        json={"layout": draft},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["designId"] == layout["designId"]
    assert data["rooms"][0]["label"] == "Draft Living Room"


async def test_saving_draft_creates_auto_draft_design_version(client: AsyncClient):
    token = await _register_and_token(client, "draft-version@example.com")
    layout = await _create_design(client, token, "version")
    draft = _draft_layout(layout)

    response = await client.put(
        f"/api/design/{layout['designId']}/draft",
        json={"layout": draft},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200

    async with TestSessionLocal() as session:
        draft_version = await session.scalar(
            select(DesignVersion).where(
                DesignVersion.design_id == layout["designId"],
                DesignVersion.version_type == "auto_draft",
            )
        )
        assert draft_version is not None
        assert draft_version.layout_json["rooms"][0]["label"] == "Draft Living Room"


async def test_resaving_draft_replaces_existing_auto_draft(client: AsyncClient):
    token = await _register_and_token(client, "draft-replace@example.com")
    layout = await _create_design(client, token, "replace")

    first = await client.put(
        f"/api/design/{layout['designId']}/draft",
        json={"layout": _draft_layout(layout, "First Draft")},
        headers={"Authorization": f"Bearer {token}"},
    )
    second = await client.put(
        f"/api/design/{layout['designId']}/draft",
        json={"layout": _draft_layout(layout, "Second Draft")},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert first.status_code == 200
    assert second.status_code == 200

    async with TestSessionLocal() as session:
        draft_count = await session.scalar(
            select(func.count()).select_from(DesignVersion).where(
                DesignVersion.design_id == layout["designId"],
                DesignVersion.version_type == "auto_draft",
            )
        )
        draft_version = await session.scalar(
            select(DesignVersion).where(
                DesignVersion.design_id == layout["designId"],
                DesignVersion.version_type == "auto_draft",
            )
        )
        assert draft_count == 1
        assert draft_version is not None
        assert draft_version.layout_json["rooms"][0]["label"] == "Second Draft"


async def test_draft_save_does_not_increment_or_overwrite_manual_versions(client: AsyncClient):
    token = await _register_and_token(client, "draft-manual@example.com")
    layout = await _create_design(client, token, "manual")
    manual_layout = _draft_layout(layout, "Manual Save")
    manual = await client.put(
        f"/api/design/{layout['designId']}",
        json={
            "layout": manual_layout,
            "versionName": "Named checkpoint",
            "changeSummary": "Manual save before draft",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert manual.status_code == 200

    draft = await client.put(
        f"/api/design/{layout['designId']}/draft",
        json={"layout": _draft_layout(layout, "Unsaved Draft")},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert draft.status_code == 200

    async with TestSessionLocal() as session:
        non_draft_versions = (
            await session.scalars(
                select(DesignVersion)
                .where(
                    DesignVersion.design_id == layout["designId"],
                    DesignVersion.version_type != "auto_draft",
                )
                .order_by(DesignVersion.version_number)
            )
        ).all()
        assert [version.version_number for version in non_draft_versions] == [1, 2]
        assert non_draft_versions[1].version_name == "Named checkpoint"
        assert non_draft_versions[1].layout_json["rooms"][0]["label"] == "Manual Save"


async def test_user_can_fetch_latest_draft_for_recovery(client: AsyncClient):
    token = await _register_and_token(client, "draft-fetch@example.com")
    layout = await _create_design(client, token, "fetch")
    draft = _draft_layout(layout, "Recoverable Draft")
    saved = await client.put(
        f"/api/design/{layout['designId']}/draft",
        json={"layout": draft},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert saved.status_code == 200

    response = await client.get(
        f"/api/design/{layout['designId']}/draft",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["designId"] == layout["designId"]
    assert data["rooms"][0]["label"] == "Recoverable Draft"
    assert data["metadata"]["draftMarker"] == "Recoverable Draft"


async def test_fetch_draft_returns_404_when_no_draft_exists(client: AsyncClient):
    token = await _register_and_token(client, "draft-missing@example.com")
    layout = await _create_design(client, token, "missing")

    response = await client.get(
        f"/api/design/{layout['designId']}/draft",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


async def test_wrong_user_cannot_save_draft_for_another_users_design(client: AsyncClient):
    token_a = await _register_and_token(client, "draft-owner@example.com")
    token_b = await _register_and_token(client, "draft-intruder@example.com")
    layout = await _create_design(client, token_a, "owner")

    response = await client.put(
        f"/api/design/{layout['designId']}/draft",
        json={"layout": _draft_layout(layout)},
        headers={"Authorization": f"Bearer {token_b}"},
    )

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


async def test_wrong_user_cannot_fetch_another_users_draft(client: AsyncClient):
    token_a = await _register_and_token(client, "draft-fetch-owner@example.com")
    token_b = await _register_and_token(client, "draft-fetch-intruder@example.com")
    layout = await _create_design(client, token_a, "fetch-owner")
    saved = await client.put(
        f"/api/design/{layout['designId']}/draft",
        json={"layout": _draft_layout(layout)},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert saved.status_code == 200

    response = await client.get(
        f"/api/design/{layout['designId']}/draft",
        headers={"Authorization": f"Bearer {token_b}"},
    )

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


async def test_draft_layout_json_persists_exactly(client: AsyncClient):
    token = await _register_and_token(client, "draft-exact@example.com")
    layout = await _create_design(client, token, "exact")
    draft = _draft_layout(layout, "Exact Draft")
    draft["metadata"]["nestedDraftData"] = {"mode": "autosave", "count": 2}

    response = await client.put(
        f"/api/design/{layout['designId']}/draft",
        json={"layout": draft},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200

    async with TestSessionLocal() as session:
        draft_version = await session.scalar(
            select(DesignVersion).where(
                DesignVersion.design_id == layout["designId"],
                DesignVersion.version_type == "auto_draft",
            )
        )
        assert draft_version is not None
        assert draft_version.layout_json == draft


async def test_saved_layout_keeps_editor_metadata_on_reload(client: AsyncClient):
    token = await _register_and_token(client, "keep-meta@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    layout = await _create_design(client, token, "keep-meta")
    design_id = layout.pop("designId")
    layout.pop("designVersionId", None)
    view = {"id": "v1", "name": "Street", "preset": "axo"}
    layout["metadata"] = {**layout["metadata"], "savedViews": [view], "site": {"boundary": [[0, 0]]}}

    saved = await client.put(f"/api/design/{design_id}", json={"layout": layout}, headers=headers)
    assert saved.json()["metadata"]["savedViews"] == [view]

    project_id = (await client.get("/api/projects", headers=headers)).json()[0]["id"]
    latest = await client.get(f"/api/design/project/{project_id}/latest", headers=headers)
    assert latest.json()["metadata"]["savedViews"] == [view]
    assert latest.json()["metadata"]["site"] == {"boundary": [[0, 0]]}
