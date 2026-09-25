from httpx import AsyncClient
from app.tests.conftest import generate_design


async def _register_and_token(client: AsyncClient, email: str) -> str:
    response = await client.post(
        "/api/auth/register",
        json={"name": "User", "email": email, "password": "password123"},
    )
    return response.json()["access_token"]


async def _create_workspace(client: AsyncClient, token: str) -> dict:
    response = await client.post(
        "/api/workspaces",
        json={"name": "Shared Studio", "description": "Team concepts"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


async def _add_member(
    client: AsyncClient,
    owner_token: str,
    workspace_id: str,
    email: str,
    role: str,
) -> None:
    response = await client.post(
        f"/api/workspaces/{workspace_id}/members",
        json={"email": email, "role": role},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert response.status_code == 201


async def _create_workspace_project(
    client: AsyncClient,
    token: str,
    workspace_id: str,
    title: str = "Shared Project",
) -> dict:
    response = await client.post(
        "/api/projects",
        json={"title": title, "workspace_id": workspace_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


async def test_workspace_owner_and_editor_can_create_shared_projects(client: AsyncClient):
    owner_token = await _register_and_token(client, "shared-create-owner@example.com")
    editor_token = await _register_and_token(client, "shared-create-editor@example.com")
    workspace = await _create_workspace(client, owner_token)
    await _add_member(
        client,
        owner_token,
        workspace["id"],
        "shared-create-editor@example.com",
        "editor",
    )

    owner_project = await _create_workspace_project(client, owner_token, workspace["id"], "Owner Project")
    editor_project = await _create_workspace_project(client, editor_token, workspace["id"], "Editor Project")

    assert owner_project["workspace_id"] == workspace["id"]
    assert editor_project["workspace_id"] == workspace["id"]


async def test_workspace_viewer_cannot_create_shared_project(client: AsyncClient):
    owner_token = await _register_and_token(client, "shared-viewer-owner@example.com")
    viewer_token = await _register_and_token(client, "shared-viewer@example.com")
    workspace = await _create_workspace(client, owner_token)
    await _add_member(client, owner_token, workspace["id"], "shared-viewer@example.com", "viewer")

    response = await client.post(
        "/api/projects",
        json={"title": "Forbidden", "workspace_id": workspace["id"]},
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert response.status_code == 403


async def test_workspace_members_list_and_open_shared_projects(client: AsyncClient):
    owner_token = await _register_and_token(client, "shared-list-owner@example.com")
    viewer_token = await _register_and_token(client, "shared-list-viewer@example.com")
    workspace = await _create_workspace(client, owner_token)
    await _add_member(client, owner_token, workspace["id"], "shared-list-viewer@example.com", "viewer")
    project = await _create_workspace_project(client, owner_token, workspace["id"])

    listed = await client.get("/api/projects", headers={"Authorization": f"Bearer {viewer_token}"})
    opened = await client.get(
        f"/api/projects/{project['id']}",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [project["id"]]
    assert opened.status_code == 200
    assert opened.json()["workspace_id"] == workspace["id"]


async def test_non_member_cannot_open_shared_project(client: AsyncClient):
    owner_token = await _register_and_token(client, "shared-private-owner@example.com")
    intruder_token = await _register_and_token(client, "shared-private-intruder@example.com")
    workspace = await _create_workspace(client, owner_token)
    project = await _create_workspace_project(client, owner_token, workspace["id"])

    response = await client.get(
        f"/api/projects/{project['id']}",
        headers={"Authorization": f"Bearer {intruder_token}"},
    )

    assert response.status_code == 403


async def test_workspace_editor_can_update_but_viewer_cannot(client: AsyncClient):
    owner_token = await _register_and_token(client, "shared-edit-owner@example.com")
    editor_token = await _register_and_token(client, "shared-edit-editor@example.com")
    viewer_token = await _register_and_token(client, "shared-edit-viewer@example.com")
    workspace = await _create_workspace(client, owner_token)
    await _add_member(client, owner_token, workspace["id"], "shared-edit-editor@example.com", "editor")
    await _add_member(client, owner_token, workspace["id"], "shared-edit-viewer@example.com", "viewer")
    project = await _create_workspace_project(client, owner_token, workspace["id"])

    edited = await client.put(
        f"/api/projects/{project['id']}",
        json={"title": "Editor Updated"},
        headers={"Authorization": f"Bearer {editor_token}"},
    )
    forbidden = await client.put(
        f"/api/projects/{project['id']}",
        json={"title": "Viewer Updated"},
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert edited.status_code == 200
    assert edited.json()["title"] == "Editor Updated"
    assert forbidden.status_code == 403


async def test_workspace_admin_can_delete_but_editor_cannot(client: AsyncClient):
    owner_token = await _register_and_token(client, "shared-delete-owner@example.com")
    admin_token = await _register_and_token(client, "shared-delete-admin@example.com")
    editor_token = await _register_and_token(client, "shared-delete-editor@example.com")
    workspace = await _create_workspace(client, owner_token)
    await _add_member(client, owner_token, workspace["id"], "shared-delete-admin@example.com", "admin")
    await _add_member(client, owner_token, workspace["id"], "shared-delete-editor@example.com", "editor")
    project = await _create_workspace_project(client, owner_token, workspace["id"])

    forbidden = await client.delete(
        f"/api/projects/{project['id']}",
        headers={"Authorization": f"Bearer {editor_token}"},
    )
    deleted = await client.delete(
        f"/api/projects/{project['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert forbidden.status_code == 403
    assert deleted.status_code == 204


async def test_workspace_editor_can_generate_and_save_design_while_viewer_can_load(client: AsyncClient):
    owner_token = await _register_and_token(client, "shared-design-owner@example.com")
    editor_token = await _register_and_token(client, "shared-design-editor@example.com")
    viewer_token = await _register_and_token(client, "shared-design-viewer@example.com")
    workspace = await _create_workspace(client, owner_token)
    await _add_member(client, owner_token, workspace["id"], "shared-design-editor@example.com", "editor")
    await _add_member(client, owner_token, workspace["id"], "shared-design-viewer@example.com", "viewer")
    project = await _create_workspace_project(client, owner_token, workspace["id"])

    generated = await generate_design(client, {"Authorization": f"Bearer {editor_token}"}, project["id"])
    loaded = await client.get(
        f"/api/design/project/{project['id']}/latest",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    layout = loaded.json()
    saved = await client.put(
        f"/api/design/{generated.json()['designId']}",
        json={"layout": layout},
        headers={"Authorization": f"Bearer {editor_token}"},
    )

    assert generated.status_code == 200
    assert loaded.status_code == 200
    assert saved.status_code == 200


async def test_workspace_viewer_cannot_generate_or_save_design(client: AsyncClient):
    owner_token = await _register_and_token(client, "shared-design-block-owner@example.com")
    viewer_token = await _register_and_token(client, "shared-design-block-viewer@example.com")
    workspace = await _create_workspace(client, owner_token)
    await _add_member(client, owner_token, workspace["id"], "shared-design-block-viewer@example.com", "viewer")
    project = await _create_workspace_project(client, owner_token, workspace["id"])
    generated = await generate_design(client, {"Authorization": f"Bearer {owner_token}"}, project["id"])

    forbidden_generate = await generate_design(client, {"Authorization": f"Bearer {viewer_token}"}, project["id"])
    forbidden_save = await client.put(
        f"/api/design/{generated.json()['designId']}",
        json={"layout": generated.json()},
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert forbidden_generate.status_code == 403
    assert forbidden_save.status_code == 403


async def test_workspace_design_drafts_follow_member_roles(client: AsyncClient):
    owner_token = await _register_and_token(client, "shared-draft-owner@example.com")
    editor_token = await _register_and_token(client, "shared-draft-editor@example.com")
    viewer_token = await _register_and_token(client, "shared-draft-viewer@example.com")
    workspace = await _create_workspace(client, owner_token)
    await _add_member(client, owner_token, workspace["id"], "shared-draft-editor@example.com", "editor")
    await _add_member(client, owner_token, workspace["id"], "shared-draft-viewer@example.com", "viewer")
    project = await _create_workspace_project(client, owner_token, workspace["id"])
    generated = await generate_design(client, {"Authorization": f"Bearer {owner_token}"}, project["id"])
    design_id = generated.json()["designId"]

    draft_saved = await client.put(
        f"/api/design/{design_id}/draft",
        json={"layout": generated.json()},
        headers={"Authorization": f"Bearer {editor_token}"},
    )
    draft_loaded = await client.get(
        f"/api/design/{design_id}/draft",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert draft_saved.status_code == 200
    assert draft_loaded.status_code == 200


async def test_workspace_activity_includes_shared_project_design_actions(client: AsyncClient):
    owner_token = await _register_and_token(client, "shared-log-owner@example.com")
    workspace = await _create_workspace(client, owner_token)
    project = await _create_workspace_project(client, owner_token, workspace["id"])
    generated = await generate_design(client, {"Authorization": f"Bearer {owner_token}"}, project["id"])
    await client.put(
        f"/api/design/{generated.json()['designId']}/draft",
        json={"layout": generated.json()},
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    response = await client.get(
        f"/api/workspaces/{workspace['id']}/activity",
        headers={"Authorization": f"Bearer {owner_token}"},
    )

    assert response.status_code == 200
    actions = [entry["action"] for entry in response.json()]
    assert actions[:4] == [
        "design.draft_saved",
        "design.generated",
        "project.created",
        "workspace.created",
    ]
