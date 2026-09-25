from httpx import AsyncClient
from sqlalchemy import func, select

from app.models.activity_log import ActivityLog
from app.models.design_version import DesignVersion
from app.models.project import Project
from app.tests.conftest import TestSessionLocal
from app.tests.conftest import generate_design


async def _register_and_token(client: AsyncClient, email: str) -> str:
    resp = await client.post(
        "/api/auth/register",
        json={"name": "Design User", "email": email, "password": "password123"},
    )
    return resp.json()["access_token"]


async def test_latest_design_returns_saved_layout(client: AsyncClient):
    token = await _register_and_token(client, "latest-design@example.com")
    project = await client.post(
        "/api/projects",
        json={"title": "Latest Design", "description": None},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_id = project.json()["id"]

    generated = await generate_design(client, {"Authorization": f"Bearer {token}"}, project_id)

    latest = await client.get(
        f"/api/design/project/{project_id}/latest",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert latest.status_code == 200
    assert latest.json()["designId"] == generated.json()["designId"]
    assert latest.json()["rooms"] == generated.json()["rooms"]


async def test_save_design_updates_layout_and_creates_new_version(client: AsyncClient):
    token = await _register_and_token(client, "save-design@example.com")
    project = await client.post(
        "/api/projects",
        json={"title": "Save Design", "description": None},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_id = project.json()["id"]
    generated = await generate_design(client, {"Authorization": f"Bearer {token}"}, project_id)
    data = generated.json()
    data["rooms"][0]["label"] = "Edited Room"

    saved = await client.put(
        f"/api/design/{data['designId']}",
        json={"layout": data},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert saved.status_code == 200
    assert saved.json()["rooms"][0]["label"] == "Edited Room"

    async with TestSessionLocal() as session:
        version_count = await session.scalar(
            select(func.count()).select_from(DesignVersion).where(
                DesignVersion.design_id == data["designId"]
            )
        )
        assert version_count == 2

        activity_result = await session.scalars(select(ActivityLog.action))
        assert "layout.saved" in activity_result.all()


async def test_manual_save_stores_version_metadata_and_thumbnail(client: AsyncClient):
    token = await _register_and_token(client, "manual-version@example.com")
    project = await client.post(
        "/api/projects",
        json={"title": "Manual Version", "description": None},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_id = project.json()["id"]
    generated = await generate_design(client, {"Authorization": f"Bearer {token}"}, project_id)
    layout = generated.json()
    layout["rooms"][0]["label"] = "Named Save Room"

    saved = await client.put(
        f"/api/design/{layout['designId']}",
        json={
            "layout": layout,
            "versionName": "Client review",
            "changeSummary": "Moved the main room",
            "thumbnailUrl": "data:image/png;base64,abc123",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert saved.status_code == 200

    async with TestSessionLocal() as session:
        latest_version = await session.scalar(
            select(DesignVersion)
            .where(DesignVersion.design_id == layout["designId"])
            .order_by(DesignVersion.version_number.desc())
        )
        project_row = await session.get(Project, project_id)

        assert latest_version is not None
        assert latest_version.version_number == 2
        assert latest_version.version_name == "Client review"
        assert latest_version.version_type == "manual"
        assert latest_version.change_summary == "Moved the main room"
        assert latest_version.layout_json["rooms"][0]["label"] == "Named Save Room"
        assert project_row is not None
        assert project_row.thumbnail_url == "data:image/png;base64,abc123"


async def test_save_design_accepts_legacy_layout_metadata(client: AsyncClient):
    token = await _register_and_token(client, "legacy-save@example.com")
    project = await client.post(
        "/api/projects",
        json={"title": "Legacy Save", "description": None},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_id = project.json()["id"]
    generated = await generate_design(client, {"Authorization": f"Bearer {token}"}, project_id)
    layout = generated.json()
    layout["metadata"] = {"totalFloors": 1, "totalRooms": len(layout["rooms"])}

    saved = await client.put(
        f"/api/design/{layout['designId']}",
        json={"layout": layout, "versionName": "Legacy metadata save"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert saved.status_code == 200, saved.text
    assert saved.json()["metadata"]["totalFloors"] == 1
    assert saved.json()["metadata"]["prompt"] is None


async def test_all_supported_component_types_survive_save_latest_version_and_share(client: AsyncClient):
    supported_types = [
        "room",
        "wall",
        "door",
        "window",
        "stair",
        "floor",
        "open_space",
        "corridor",
        "lift",
        "shaft",
        "furniture",
        "column",
        "generic",
    ]
    token = await _register_and_token(client, "component-parity@example.com")
    project = await client.post(
        "/api/projects",
        json={"title": "Component Parity", "description": None},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_id = project.json()["id"]
    generated = await generate_design(client, {"Authorization": f"Bearer {token}"}, project_id)
    layout = generated.json()
    layout["rooms"] = [
        {
            "id": f"{object_type}-1",
            "label": object_type.replace("_", " ").title(),
            "roomType": "stairs" if object_type == "stair" else object_type,
            "objectType": object_type,
            "floorId": "floor_0",
            "floorLevel": 0,
            "position": {"x": index * 1.5, "y": 1.5, "z": 0},
            "size": {"w": 1.2, "h": 2.4, "d": 1.2},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "color": "#999999",
        }
        for index, object_type in enumerate(supported_types)
    ]
    layout["floors"] = [
        {
            "id": "floor_0",
            "name": "Ground Floor",
            "level": 0,
            "elevation": 0,
            "rooms": layout["rooms"],
        }
    ]
    for room in layout["rooms"]:
        if room["objectType"] in ("door", "window"):
            room["hostWallId"] = "wall-1"

    saved = await client.put(
        f"/api/design/{layout['designId']}",
        json={"layout": layout, "versionName": "All component types"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert saved.status_code == 200, saved.text
    assert [room["objectType"] for room in saved.json()["rooms"]] == supported_types

    latest = await client.get(
        f"/api/design/project/{project_id}/latest",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert latest.status_code == 200
    assert [room["objectType"] for room in latest.json()["rooms"]] == supported_types

    version = await client.get(
        f"/api/design/version/{saved.json()['designVersionId']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert version.status_code == 200
    assert [room["objectType"] for room in version.json()["rooms"]] == supported_types

    share = await client.post(
        f"/api/projects/{project_id}/share",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert share.status_code == 201
    shared = await client.get(f"/api/share/{share.json()['token']}")
    assert shared.status_code == 200
    assert [room["objectType"] for room in shared.json()["layout"]["rooms"]] == supported_types

    for response_layout in (saved.json(), latest.json(), version.json(), shared.json()["layout"]):
        for objects in (response_layout["rooms"], response_layout["floors"][0]["rooms"]):
            openings = [room for room in objects if room["objectType"] in ("door", "window")]
            assert len(openings) == 2
            assert all(room["hostWallId"] == "wall-1" for room in openings)


async def test_fetch_version_returns_correct_layout(client: AsyncClient):
    token = await _register_and_token(client, "fetch-version@example.com")
    project = await client.post(
        "/api/projects",
        json={"title": "Version Fetch Project", "description": None},
        headers={"Authorization": f"Bearer {token}"},
    )
    project_id = project.json()["id"]
    generated = await generate_design(client, {"Authorization": f"Bearer {token}"}, project_id)
    design_id = generated.json()["designId"]
    version_id = generated.json()["designVersionId"]

    response = await client.get(
        f"/api/design/version/{version_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["designId"] == design_id
    assert data["designVersionId"] == version_id
    assert isinstance(data["rooms"], list)
    assert len(data["rooms"]) > 0


async def test_fetch_version_wrong_user_returns_403(client: AsyncClient):
    token_a = await _register_and_token(client, "version-owner@example.com")
    token_b = await _register_and_token(client, "version-intruder@example.com")
    project = await client.post(
        "/api/projects",
        json={"title": "Protected Version Project", "description": None},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    generated = await generate_design(client, {"Authorization": f"Bearer {token_a}"}, project.json()["id"])
    version_id = generated.json()["designVersionId"]

    response = await client.get(
        f"/api/design/version/{version_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


async def test_fetch_version_not_found_returns_404(client: AsyncClient):
    token = await _register_and_token(client, "version-404@example.com")

    response = await client.get(
        "/api/design/version/nonexistent-version-id",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
