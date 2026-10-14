"""Revision-safe saving: a save based on an older revision is refused (409)
instead of silently overwriting what another tab or collaborator saved.

Truly simultaneous saves are exercised against real PostgreSQL in the
Playwright suite (frontend/e2e/revisions.spec.ts): this suite's in-memory
SQLite shares one connection between sessions, which cannot model two writers."""
import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.models.design import Design
from app.models.design_version import DesignVersion
from app.tests.conftest import TestSessionLocal, generate_design


async def _setup(client: AsyncClient, email: str) -> tuple[dict, dict]:
    """A user, a project and its generated design. The layout carries
    `projectId` (added here, not by the API) for tests that re-read the design."""
    registered = await client.post(
        "/api/auth/register",
        json={"name": "Rev User", "email": email, "password": "password123"},
    )
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    project = await client.post("/api/projects", json={"title": "Revisions"}, headers=headers)
    loaded = await generate_design(client, headers, project.json()["id"])
    assert loaded.status_code == 200
    return headers, {**loaded.json(), "projectId": project.json()["id"]}


def _edited(layout: dict, label: str) -> dict:
    # A layout is saved without the revision (it travels beside it).
    edited = {key: value for key, value in layout.items() if key not in ("revision", "projectId")}
    edited["rooms"] = [{**room} for room in layout["rooms"]]
    edited["rooms"][0]["label"] = label
    return edited


async def _revision(client: AsyncClient, headers: dict, project_id: str) -> int:
    latest = await client.get(f"/api/design/project/{project_id}/latest", headers=headers)
    return latest.json()["revision"]


async def _counts(design_id: str) -> tuple[int, str]:
    async with TestSessionLocal() as session:
        versions = await session.scalar(
            select(func.count()).select_from(DesignVersion).where(DesignVersion.design_id == design_id)
        )
        design = await session.get(Design, design_id)
        return versions, design.layout_json["rooms"][0]["label"]


async def test_loading_a_design_reports_its_revision(client: AsyncClient):
    _, layout = await _setup(client, "rev-load@example.com")
    assert isinstance(layout["revision"], int)


async def test_every_save_returns_the_next_revision(client: AsyncClient):
    headers, layout = await _setup(client, "rev-next@example.com")
    base = layout["revision"]

    draft = await client.put(
        f"/api/design/{layout['designId']}/draft",
        json={"layout": _edited(layout, "Draft"), "baseRevision": base},
        headers=headers,
    )
    assert draft.status_code == 200
    assert draft.json()["revision"] == base + 1

    manual = await client.put(
        f"/api/design/{layout['designId']}",
        json={"layout": _edited(layout, "Manual"), "baseRevision": base + 1},
        headers=headers,
    )
    assert manual.status_code == 200
    assert manual.json()["revision"] == base + 2


async def test_a_stale_draft_is_refused_and_writes_nothing(client: AsyncClient):
    headers, layout = await _setup(client, "rev-stale-draft@example.com")
    base = layout["revision"]
    first = await client.put(
        f"/api/design/{layout['designId']}/draft",
        json={"layout": _edited(layout, "Tab A"), "baseRevision": base},
        headers=headers,
    )
    assert first.status_code == 200

    stale = await client.put(
        f"/api/design/{layout['designId']}/draft",
        json={"layout": _edited(layout, "Tab B"), "baseRevision": base},
        headers=headers,
    )
    assert stale.status_code == 409
    body = stale.json()
    assert body["code"] == "REVISION_CONFLICT"
    assert body["currentRevision"] == base + 1
    assert body["baseRevision"] == base

    # Tab A's draft is untouched and the revision did not move.
    fetched = await client.get(f"/api/design/{layout['designId']}/draft", headers=headers)
    assert fetched.json()["rooms"][0]["label"] == "Tab A"
    assert fetched.json()["revision"] == base + 1


async def test_a_stale_manual_save_is_refused_and_writes_nothing(client: AsyncClient):
    headers, layout = await _setup(client, "rev-stale-manual@example.com")
    base = layout["revision"]
    versions_before, label_before = await _counts(layout["designId"])
    await client.put(
        f"/api/design/{layout['designId']}",
        json={"layout": _edited(layout, "Tab A"), "baseRevision": base},
        headers=headers,
    )
    versions_after_a, _ = await _counts(layout["designId"])

    stale = await client.put(
        f"/api/design/{layout['designId']}",
        json={"layout": _edited(layout, "Tab B"), "baseRevision": base},
        headers=headers,
    )
    assert stale.status_code == 409
    assert stale.json()["currentRevision"] == base + 1

    versions, label = await _counts(layout["designId"])
    assert versions == versions_after_a == versions_before + 1, "no version was created by the refused save"
    assert label == "Tab A" != label_before


async def test_a_save_without_a_base_revision_still_works_and_bumps(client: AsyncClient):
    headers, layout = await _setup(client, "rev-legacy@example.com")
    base = layout["revision"]
    saved = await client.put(
        f"/api/design/{layout['designId']}/draft",
        json={"layout": _edited(layout, "Older client")},
        headers=headers,
    )
    assert saved.status_code == 200
    assert saved.json()["revision"] == base + 1


async def test_after_a_conflict_the_current_revision_can_be_used_to_save(client: AsyncClient):
    headers, layout = await _setup(client, "rev-rebase@example.com")
    base = layout["revision"]
    await client.put(
        f"/api/design/{layout['designId']}/draft",
        json={"layout": _edited(layout, "Tab A"), "baseRevision": base},
        headers=headers,
    )
    conflict = await client.put(
        f"/api/design/{layout['designId']}",
        json={"layout": _edited(layout, "Tab B"), "baseRevision": base},
        headers=headers,
    )
    assert conflict.status_code == 409

    again = await client.put(
        f"/api/design/{layout['designId']}",
        json={"layout": _edited(layout, "Tab B"), "baseRevision": conflict.json()["currentRevision"]},
        headers=headers,
    )
    assert again.status_code == 200
    assert again.json()["rooms"][0]["label"] == "Tab B"


async def test_a_write_that_fails_after_claiming_the_revision_rolls_the_bump_back(
    client: AsyncClient, monkeypatch
):
    from app.services import design_service

    headers, layout = await _setup(client, "rev-atomic@example.com")
    base = layout["revision"]

    class Boom(RuntimeError):
        pass

    class ExplodingVersion(design_service.DesignVersion):
        def __init__(self, *args, **kwargs):
            raise Boom("insert failed")

    monkeypatch.setattr(design_service, "DesignVersion", ExplodingVersion)
    with pytest.raises(Boom):
        await client.put(
            f"/api/design/{layout['designId']}",
            json={"layout": _edited(layout, "Never saved"), "baseRevision": base},
            headers=headers,
        )
    monkeypatch.undo()

    async with TestSessionLocal() as session:
        design = await session.get(Design, layout["designId"])
        assert design.revision == base, "the revision was not consumed by the failed save"
        assert design.layout_json["rooms"][0]["label"] != "Never saved"

    # And the same base revision still works afterwards.
    retry = await client.put(
        f"/api/design/{layout['designId']}",
        json={"layout": _edited(layout, "Saved"), "baseRevision": base},
        headers=headers,
    )
    assert retry.status_code == 200


async def test_generating_over_a_design_bumps_its_revision(client: AsyncClient):
    headers, layout = await _setup(client, "rev-generate@example.com")
    base = layout["revision"]
    await generate_design(client, headers, layout["projectId"])
    assert await _revision(client, headers, layout["projectId"]) == base + 1
