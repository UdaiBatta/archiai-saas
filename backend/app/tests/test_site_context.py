import pytest
from httpx import AsyncClient

from app.services import site_context
from app.services.site_context import buildings_from_overpass


def test_converts_overpass_ways_to_local_metres_with_heights():
    lat0, lon0 = 28.6, 77.2
    payload = {"elements": [
        {"type": "way", "tags": {"building": "yes", "building:levels": "5"}, "geometry": [
            {"lat": lat0, "lon": lon0}, {"lat": lat0, "lon": lon0 + 0.0001},
            {"lat": lat0 + 0.0001, "lon": lon0 + 0.0001}, {"lat": lat0, "lon": lon0},
        ]},
        {"type": "way", "tags": {"building": "yes", "height": "40 m"}, "geometry": [
            {"lat": lat0, "lon": lon0}, {"lat": lat0, "lon": lon0 + 0.0002}, {"lat": lat0 - 0.0002, "lon": lon0},
        ]},
        {"type": "way", "tags": {"building": "yes"}, "geometry": [{"lat": lat0, "lon": lon0}]},
        {"type": "node", "lat": lat0, "lon": lon0},
    ]}
    out = buildings_from_overpass(payload, lat0, lon0)
    assert len(out) == 2
    first = out[0]
    assert len(first["footprint"]) == 3  # closing point dropped
    assert first["height_m"] == 16.0  # 5 levels x 3.2
    assert first["footprint"][1]["x"] == pytest.approx(9.77, abs=0.05)  # 0.0001 deg of longitude east
    assert first["footprint"][2]["z"] == pytest.approx(-11.05, abs=0.05)  # north is negative z
    assert out[1]["height_m"] == 40.0


async def test_context_endpoint_requires_auth_and_maps_upstream_errors(client: AsyncClient, monkeypatch):
    assert (await client.get("/api/site/context", params={"lat": 28.6, "lon": 77.2})).status_code == 401
    token = (await client.post("/api/auth/register", json={"name": "U", "email": "ctx@example.com", "password": "password123"})).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    async def ok(lat, lon, radius):
        return [{"footprint": [{"x": 0, "z": 0}, {"x": 5, "z": 0}, {"x": 5, "z": 5}], "height_m": 9.0}]

    monkeypatch.setattr("app.api.site.router.fetch_context", ok)
    body = (await client.get("/api/site/context", params={"lat": 28.6, "lon": 77.2, "radius": 120}, headers=headers)).json()
    assert body["radius_m"] == 120 and len(body["buildings"]) == 1 and "OpenStreetMap" in body["attribution"]

    async def down(lat, lon, radius):
        raise site_context.ContextUnavailable("The map service did not answer.")

    monkeypatch.setattr("app.api.site.router.fetch_context", down)
    assert (await client.get("/api/site/context", params={"lat": 28.6, "lon": 77.2}, headers=headers)).status_code == 502
    assert (await client.get("/api/site/context", params={"lat": 28.6, "lon": 77.2, "radius": 9000}, headers=headers)).status_code == 422
