from httpx import AsyncClient
from sqlalchemy import select

from app.models.design import Design
from app.models.design_version import DesignVersion
from app.models.project import Project
from app.tests.conftest import TestSessionLocal
from app.tests.conftest import generate_design


async def _register_and_token(client: AsyncClient, email: str) -> str:
    resp = await client.post(
        "/api/auth/register",
        json={"name": "User", "email": email, "password": "password123"},
    )
    return resp.json()["access_token"]


async def test_create_project_success(client: AsyncClient):
    token = await _register_and_token(client, "proj1@example.com")
    response = await client.post(
        "/api/projects",
        json={"title": "My First Project", "description": "A test project"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "My First Project"
    assert "id" in data
    assert "user_id" in data
    assert "created_at" in data


async def test_create_project_no_token(client: AsyncClient):
    response = await client.post(
        "/api/projects",
        json={"title": "No Auth Project"},
    )
    assert response.status_code == 401
    data = response.json()
    assert data["code"] == "UNAUTHORIZED"


async def test_create_project_blank_title_returns_validation_error(client: AsyncClient):
    token = await _register_and_token(client, "proj-blank@example.com")
    response = await client.post(
        "/api/projects",
        json={"title": "   ", "description": "A test project"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422
    data = response.json()
    assert data["code"] == "UNPROCESSABLE_ENTITY"
    assert "Title is required" in data["error"]


async def test_list_projects_scoped_to_user(client: AsyncClient):
    token_a = await _register_and_token(client, "user_a@example.com")
    token_b = await _register_and_token(client, "user_b@example.com")

    await client.post(
        "/api/projects",
        json={"title": "User A Project"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    await client.post(
        "/api/projects",
        json={"title": "User B Project"},
        headers={"Authorization": f"Bearer {token_b}"},
    )

    response = await client.get(
        "/api/projects", headers={"Authorization": f"Bearer {token_a}"}
    )
    assert response.status_code == 200
    projects = response.json()
    assert len(projects) == 1
    assert projects[0]["title"] == "User A Project"


async def test_get_project_success(client: AsyncClient):
    token = await _register_and_token(client, "get_proj@example.com")
    created = await client.post(
        "/api/projects",
        json={"title": "Fetch Me"},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_id = created.json()["id"]

    response = await client.get(
        f"/api/projects/{project_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Fetch Me"


async def test_get_project_wrong_user(client: AsyncClient):
    token_a = await _register_and_token(client, "owner@example.com")
    token_b = await _register_and_token(client, "intruder@example.com")

    created = await client.post(
        "/api/projects",
        json={"title": "Private Project"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    project_id = created.json()["id"]

    response = await client.get(
        f"/api/projects/{project_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


async def test_update_project_success(client: AsyncClient):
    token = await _register_and_token(client, "update_proj@example.com")
    created = await client.post(
        "/api/projects",
        json={"title": "Old Title"},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_id = created.json()["id"]

    response = await client.put(
        f"/api/projects/{project_id}",
        json={"title": "New Title", "description": "Updated"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "New Title"
    assert data["description"] == "Updated"


async def test_update_project_thumbnail_url(client: AsyncClient):
    token = await _register_and_token(client, "thumb_proj@example.com")
    created = await client.post(
        "/api/projects",
        json={"title": "Thumb Project"},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_id = created.json()["id"]

    response = await client.put(
        f"/api/projects/{project_id}",
        json={"thumbnail_url": "data:image/png;base64,abc123"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["thumbnail_url"] == "data:image/png;base64,abc123"


async def test_update_project_thumbnail_only_does_not_log_activity(client: AsyncClient):
    token = await _register_and_token(client, "thumb_silent@example.com")
    created = await client.post(
        "/api/projects",
        json={"title": "Silent Thumb Project"},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_id = created.json()["id"]

    await client.put(
        f"/api/projects/{project_id}",
        json={"thumbnail_url": "data:image/png;base64,abc123"},
        headers={"Authorization": f"Bearer {token}"},
    )

    response = await client.get(
        f"/api/projects/{project_id}/activity",
        headers={"Authorization": f"Bearer {token}"},
    )
    actions = [e["action"] for e in response.json()]
    assert "project.updated" not in actions
    assert actions == ["project.created"]


async def test_update_project_title_still_logs_activity(client: AsyncClient):
    token = await _register_and_token(client, "title_logs@example.com")
    created = await client.post(
        "/api/projects",
        json={"title": "Loud Project"},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_id = created.json()["id"]

    await client.put(
        f"/api/projects/{project_id}",
        json={"title": "Renamed Project"},
        headers={"Authorization": f"Bearer {token}"},
    )

    response = await client.get(
        f"/api/projects/{project_id}/activity",
        headers={"Authorization": f"Bearer {token}"},
    )
    actions = [e["action"] for e in response.json()]
    assert actions == ["project.updated", "project.created"]


async def test_delete_project_success(client: AsyncClient):
    token = await _register_and_token(client, "delete_proj@example.com")
    created = await client.post(
        "/api/projects",
        json={"title": "To Be Deleted"},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_id = created.json()["id"]

    response = await client.delete(
        f"/api/projects/{project_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 204

    get_response = await client.get(
        f"/api/projects/{project_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert get_response.status_code == 404


async def test_delete_project_wrong_user(client: AsyncClient):
    token_a = await _register_and_token(client, "del_owner@example.com")
    token_b = await _register_and_token(client, "del_intruder@example.com")

    created = await client.post(
        "/api/projects",
        json={"title": "Protected Project"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    project_id = created.json()["id"]

    response = await client.delete(
        f"/api/projects/{project_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


async def test_project_versions_api_returns_versions_newest_first(client: AsyncClient):
    token = await _register_and_token(client, "versions@example.com")
    project = await client.post(
        "/api/projects",
        json={"title": "Versioned Project"},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_id = project.json()["id"]
    generated = await generate_design(client, {"Authorization": f"Bearer {token}"}, project_id)
    layout = generated.json()
    layout["rooms"][0]["label"] = "Saved Label"
    await client.put(
        f"/api/design/{layout['designId']}",
        json={
            "layout": layout,
            "versionName": "Manual checkpoint",
            "changeSummary": "Saved edited label",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    response = await client.get(
        f"/api/projects/{project_id}/versions",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    versions = response.json()
    assert [version["version_number"] for version in versions] == [2, 1]
    assert versions[0]["version_name"] == "Manual checkpoint"
    assert versions[0]["version_type"] == "manual"
    assert versions[0]["change_summary"] == "Saved edited label"
    assert versions[0]["created_by"]


async def test_project_versions_wrong_user_forbidden(client: AsyncClient):
    token_a = await _register_and_token(client, "version-owner@example.com")
    token_b = await _register_and_token(client, "version-intruder@example.com")
    project = await client.post(
        "/api/projects",
        json={"title": "Private Versions"},
        headers={"Authorization": f"Bearer {token_a}"},
    )

    response = await client.get(
        f"/api/projects/{project.json()['id']}/versions",
        headers={"Authorization": f"Bearer {token_b}"},
    )

    assert response.status_code == 403


async def test_duplicate_project_copies_latest_design_layout_and_thumbnail(client: AsyncClient):
    token = await _register_and_token(client, "duplicate@example.com")
    project = await client.post(
        "/api/projects",
        json={"title": "Original Project", "description": "Source"},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_id = project.json()["id"]
    generated = await generate_design(client, {"Authorization": f"Bearer {token}"}, project_id)
    layout = generated.json()
    layout["rooms"][0]["label"] = "Copied Room"
    await client.put(
        f"/api/design/{layout['designId']}",
        json={
            "layout": layout,
            "versionName": "Before duplicate",
            "thumbnailUrl": "data:image/png;base64,preview",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    response = await client.post(
        f"/api/projects/{project_id}/duplicate",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    duplicate = response.json()
    assert duplicate["id"] != project_id
    assert duplicate["title"] == "Copy of Original Project"
    assert duplicate["description"] == "Source"
    assert duplicate["thumbnail_url"] == "data:image/png;base64,preview"

    latest_duplicate = await client.get(
        f"/api/design/project/{duplicate['id']}/latest",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert latest_duplicate.status_code == 200
    assert latest_duplicate.json()["rooms"][0]["label"] == "Copied Room"
    assert latest_duplicate.json()["designId"] != layout["designId"]

    async with TestSessionLocal() as session:
        original = await session.get(Project, project_id)
        original_design = await session.get(Design, layout["designId"])
        duplicate_version = await session.scalar(
            select(DesignVersion).where(DesignVersion.project_id == duplicate["id"])
        )

        assert original is not None
        assert original.title == "Original Project"
        assert original_design is not None
        assert original_design.layout_json["rooms"][0]["label"] == "Copied Room"
        assert duplicate_version is not None
        assert duplicate_version.version_number == 1
        assert duplicate_version.version_type == "duplicate"


async def test_delete_project_with_designs_succeeds(client: AsyncClient):
    token = await _register_and_token(client, "delete-with-designs@example.com")
    project = await client.post(
        "/api/projects",
        json={"title": "Delete With Designs"},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_id = project.json()["id"]
    await generate_design(client, {"Authorization": f"Bearer {token}"}, project_id)

    response = await client.delete(
        f"/api/projects/{project_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 204

    async with TestSessionLocal() as session:
        design = await session.scalar(select(Design).where(Design.project_id == project_id))
        version = await session.scalar(
            select(DesignVersion).where(DesignVersion.project_id == project_id)
        )
        assert design is None
        assert version is None


async def test_project_activity_returns_scoped_entries_newest_first(client: AsyncClient):
    token = await _register_and_token(client, "activity@example.com")
    project = await client.post(
        "/api/projects",
        json={"title": "Activity Project", "description": None},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_id = project.json()["id"]

    generated = await generate_design(client, {"Authorization": f"Bearer {token}"}, project_id)
    design = generated.json()
    await client.put(
        f"/api/design/{design['designId']}",
        json={"layout": design, "versionName": "v"},
        headers={"Authorization": f"Bearer {token}"},
    )

    response = await client.get(
        f"/api/projects/{project_id}/activity",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    entries = response.json()
    actions = [e["action"] for e in entries]
    assert actions == ["layout.saved", "design.generated", "project.created"]


async def test_project_activity_wrong_user_returns_403(client: AsyncClient):
    token_a = await _register_and_token(client, "activity-owner@example.com")
    token_b = await _register_and_token(client, "activity-intruder@example.com")
    project = await client.post(
        "/api/projects",
        json={"title": "Owned", "description": None},
        headers={"Authorization": f"Bearer {token_a}"},
    )

    response = await client.get(
        f"/api/projects/{project.json()['id']}/activity",
        headers={"Authorization": f"Bearer {token_b}"},
    )

    assert response.status_code == 403


async def test_project_activity_isolates_between_projects(client: AsyncClient):
    token = await _register_and_token(client, "activity-iso@example.com")

    project_a = await client.post(
        "/api/projects",
        json={"title": "A", "description": None},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_b = await client.post(
        "/api/projects",
        json={"title": "B", "description": None},
        headers={"Authorization": f"Bearer {token}"},
    )
    await generate_design(client, {"Authorization": f"Bearer {token}"}, project_a.json()["id"])

    activity_a = await client.get(
        f"/api/projects/{project_a.json()['id']}/activity",
        headers={"Authorization": f"Bearer {token}"},
    )
    activity_b = await client.get(
        f"/api/projects/{project_b.json()['id']}/activity",
        headers={"Authorization": f"Bearer {token}"},
    )

    actions_a = sorted(e["action"] for e in activity_a.json())
    actions_b = sorted(e["action"] for e in activity_b.json())

    assert actions_a == ["design.generated", "project.created"]
    assert actions_b == ["project.created"]
