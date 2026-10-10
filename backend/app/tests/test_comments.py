from datetime import datetime, timezone

from httpx import AsyncClient


async def _user(client: AsyncClient, email: str, name: str = "User") -> dict:
    resp = await client.post("/api/auth/register", json={"name": name, "email": email, "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _project(client: AsyncClient, headers: dict) -> str:
    resp = await client.post("/api/projects", json={"title": "Commented"}, headers=headers)
    return resp.json()["id"]


async def test_comment_thread_round_trip(client: AsyncClient):
    owner = await _user(client, "c-owner@example.com", "Asha")
    project = await _project(client, owner)
    url = f"/api/projects/{project}/comments"

    first = await client.post(url, json={"body": "  Widen this door  ", "room_id": "r1", "x": 2, "y": 0, "z": 3}, headers=owner)
    assert first.status_code == 201
    pin = first.json()
    assert pin["body"] == "Widen this door" and pin["author_name"] == "Asha" and pin["room_id"] == "r1"

    reply = await client.post(url, json={"body": "Done", "parent_id": pin["id"]}, headers=owner)
    assert reply.status_code == 201
    # Threads are one level deep.
    nested = await client.post(url, json={"body": "x", "parent_id": reply.json()["id"]}, headers=owner)
    assert nested.status_code == 422

    resolved = await client.patch(f"{url}/{pin['id']}", json={"resolved": True}, headers=owner)
    assert resolved.json()["resolved"] is True

    listed = (await client.get(url, headers=owner)).json()
    assert [c["body"] for c in listed] == ["Widen this door", "Done"]

    assert (await client.delete(f"{url}/{reply.json()['id']}", headers=owner)).status_code == 204
    assert len((await client.get(url, headers=owner)).json()) == 1


async def test_comments_are_private_to_the_project(client: AsyncClient):
    owner = await _user(client, "c-owner2@example.com")
    stranger = await _user(client, "c-stranger@example.com")
    project = await _project(client, owner)
    url = f"/api/projects/{project}/comments"
    pin = (await client.post(url, json={"body": "Mine"}, headers=owner)).json()

    assert (await client.get(url, headers=stranger)).status_code == 403
    assert (await client.post(url, json={"body": "Hi"}, headers=stranger)).status_code == 403
    assert (await client.delete(f"{url}/{pin['id']}", headers=stranger)).status_code == 403
    assert (await client.post(url, json={"body": "   "}, headers=owner)).status_code == 422


async def test_replies_list_after_their_thread_even_with_the_same_timestamp(client: AsyncClient):
    owner = await _user(client, "c-owner3@example.com")
    project = await _project(client, owner)
    url = f"/api/projects/{project}/comments"
    root = (await client.post(url, json={"body": "First"}, headers=owner)).json()
    for i in range(5):
        await client.post(url, json={"body": f"Reply {i}", "parent_id": root["id"]}, headers=owner)

    # Force one shared timestamp, as a fast database clock or SQLite second
    # resolution would: only the tie-break orders them now.
    from sqlalchemy import update
    from app.models.comment import Comment
    from app.tests.conftest import TestSessionLocal
    async with TestSessionLocal() as db:
        await db.execute(update(Comment).values(created_at=datetime(2026, 1, 1, tzinfo=timezone.utc)))
        await db.commit()

    listed = (await client.get(url, headers=owner)).json()
    assert listed[0]["body"] == "First"
    assert all(c["parent_id"] == root["id"] for c in listed[1:])
