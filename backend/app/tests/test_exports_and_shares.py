from httpx import AsyncClient
from app.tests.conftest import generate_design


async def _register_and_token(client: AsyncClient, email: str) -> str:
    response = await client.post(
        "/api/auth/register",
        json={"name": "User", "email": email, "password": "password123"},
    )
    return response.json()["access_token"]


async def _create_project(
    client: AsyncClient,
    token: str,
    *,
    title: str = "Export Project",
    workspace_id: str | None = None,
) -> dict:
    response = await client.post(
        "/api/projects",
        json={"title": title, "description": "Shareable concept", "workspace_id": workspace_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


async def _create_saved_design(client: AsyncClient, token: str, project_id: str) -> dict:
    generated = await generate_design(client, {"Authorization": f"Bearer {token}"}, project_id)
    assert generated.status_code == 200
    layout = generated.json()
    layout["rooms"][0]["label"] = "Latest Saved Room"
    saved = await client.put(
        f"/api/design/{layout['designId']}",
        json={"layout": layout, "versionName": "Share checkpoint"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert saved.status_code == 200
    return saved.json()


async def _create_workspace(client: AsyncClient, token: str) -> dict:
    response = await client.post(
        "/api/workspaces",
        json={"name": "Export Team", "description": "Shared projects"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


async def _add_workspace_member(
    client: AsyncClient,
    owner_token: str,
    workspace_id: str,
    *,
    email: str,
    role: str = "editor",
) -> None:
    response = await client.post(
        f"/api/workspaces/{workspace_id}/members",
        json={"email": email, "role": role},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert response.status_code == 201


async def test_image_and_pdf_export_endpoints_require_auth(client: AsyncClient):
    image = await client.post("/api/projects/project-id/export/image")
    pdf = await client.post("/api/projects/project-id/export/pdf")

    assert image.status_code == 401
    assert pdf.status_code == 401


async def test_owner_can_record_image_and_pdf_exports_and_activity(client: AsyncClient):
    token = await _register_and_token(client, "export-owner@example.com")
    project = await _create_project(client, token)

    image = await client.post(
        f"/api/projects/{project['id']}/export/image",
        headers={"Authorization": f"Bearer {token}"},
    )
    pdf = await client.post(
        f"/api/projects/{project['id']}/export/pdf",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert image.status_code == 201
    assert image.json()["export_type"] == "image"
    assert image.json()["project_id"] == project["id"]
    assert pdf.status_code == 201
    assert pdf.json()["export_type"] == "pdf"

    activity = await client.get(
        f"/api/projects/{project['id']}/activity",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert [entry["action"] for entry in activity.json()].count("project.exported") == 2


async def test_workspace_member_can_export_and_create_share_link(client: AsyncClient):
    owner_token = await _register_and_token(client, "export-workspace-owner@example.com")
    editor_token = await _register_and_token(client, "export-workspace-editor@example.com")
    workspace = await _create_workspace(client, owner_token)
    await _add_workspace_member(
        client,
        owner_token,
        workspace["id"],
        email="export-workspace-editor@example.com",
    )
    project = await _create_project(client, owner_token, workspace_id=workspace["id"])

    exported = await client.post(
        f"/api/projects/{project['id']}/export/image",
        headers={"Authorization": f"Bearer {editor_token}"},
    )
    shared = await client.post(
        f"/api/projects/{project['id']}/share",
        headers={"Authorization": f"Bearer {editor_token}"},
    )

    assert exported.status_code == 201
    assert shared.status_code == 201
    assert shared.json()["project_id"] == project["id"]


async def test_wrong_user_cannot_export_or_share_private_project(client: AsyncClient):
    owner_token = await _register_and_token(client, "export-private-owner@example.com")
    wrong_token = await _register_and_token(client, "export-private-wrong@example.com")
    project = await _create_project(client, owner_token)

    image = await client.post(
        f"/api/projects/{project['id']}/export/image",
        headers={"Authorization": f"Bearer {wrong_token}"},
    )
    pdf = await client.post(
        f"/api/projects/{project['id']}/export/pdf",
        headers={"Authorization": f"Bearer {wrong_token}"},
    )
    share = await client.post(
        f"/api/projects/{project['id']}/share",
        headers={"Authorization": f"Bearer {wrong_token}"},
    )

    assert image.status_code == 403
    assert pdf.status_code == 403
    assert share.status_code == 403


async def test_share_link_creation_requires_auth_and_returns_public_token_url(client: AsyncClient):
    token = await _register_and_token(client, "share-create@example.com")
    project = await _create_project(client, token)

    unauthenticated = await client.post(f"/api/projects/{project['id']}/share")
    response = await client.post(
        f"/api/projects/{project['id']}/share",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert unauthenticated.status_code == 401
    assert response.status_code == 201
    share = response.json()
    assert share["token"]
    assert share["share_url"].endswith(f"/share/{share['token']}")
    assert share["access_type"] == "public"
    assert share["is_active"] is True


async def test_share_link_can_be_revoked_and_revoked_token_cannot_be_opened(client: AsyncClient):
    token = await _register_and_token(client, "share-revoke@example.com")
    project = await _create_project(client, token)
    await _create_saved_design(client, token, project["id"])
    created = await client.post(
        f"/api/projects/{project['id']}/share",
        headers={"Authorization": f"Bearer {token}"},
    )
    share = created.json()

    before_revoke = await client.get(f"/api/share/{share['token']}")
    revoked = await client.delete(
        f"/api/projects/{project['id']}/share/{share['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    after_revoke = await client.get(f"/api/share/{share['token']}")

    assert before_revoke.status_code == 200
    assert revoked.status_code == 204
    assert after_revoke.status_code == 404


async def test_public_share_returns_latest_saved_layout_and_minimal_project_data(client: AsyncClient):
    token = await _register_and_token(client, "share-public@example.com")
    project = await _create_project(client, token, title="Public Concept")
    saved_layout = await _create_saved_design(client, token, project["id"])
    created = await client.post(
        f"/api/projects/{project['id']}/share",
        headers={"Authorization": f"Bearer {token}"},
    )

    response = await client.get(f"/api/share/{created.json()['token']}")

    assert response.status_code == 200
    shared = response.json()
    assert shared["project"] == {
        "id": project["id"],
        "title": "Public Concept",
        "description": "Shareable concept",
    }
    assert shared["layout"] == saved_layout
    assert "activity" not in shared
    assert "versions" not in shared
    assert "workspace" not in shared
    assert "user_id" not in shared["project"]


async def test_share_actions_create_activity_entries(client: AsyncClient):
    token = await _register_and_token(client, "share-activity@example.com")
    project = await _create_project(client, token)
    created = await client.post(
        f"/api/projects/{project['id']}/share",
        headers={"Authorization": f"Bearer {token}"},
    )
    await client.delete(
        f"/api/projects/{project['id']}/share/{created.json()['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    activity = await client.get(
        f"/api/projects/{project['id']}/activity",
        headers={"Authorization": f"Bearer {token}"},
    )
    actions = [entry["action"] for entry in activity.json()]
    assert "project.shared" in actions
    assert "project.share_revoked" in actions

