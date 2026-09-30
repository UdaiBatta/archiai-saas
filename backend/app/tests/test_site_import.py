import io

import ezdxf
import pytest
from httpx import AsyncClient

from app.services.site_import import NoBoundaryFound, boundary_from_dxf


def _dxf(build, units=ezdxf.units.M) -> bytes:
    doc = ezdxf.new("R2013", units=units)
    build(doc.modelspace())
    stream = io.StringIO()
    doc.write(stream)
    return stream.getvalue().encode("utf-8")


def _bbox(points):
    xs = [p["x"] for p in points]
    zs = [p["z"] for p in points]
    return min(xs), min(zs), max(xs) - min(xs), max(zs) - min(zs)


def test_largest_closed_lwpolyline_wins_and_is_normalised():
    def build(msp):
        msp.add_lwpolyline([(0, 0), (2, 0), (2, 2)], close=True)  # small
        msp.add_lwpolyline([(100, 50), (120, 50), (120, 80), (100, 80)], close=True)
        msp.add_lwpolyline([(0, 0), (500, 0), (500, 500)])  # open: ignored

    boundary = boundary_from_dxf(_dxf(build))
    assert len(boundary) == 4
    assert _bbox(boundary) == (0, 0, 20, 30)
    # Drawing north (+y) becomes -z: the y=80 edge is now at z=0.
    assert {"x": 0, "z": 0} in boundary and {"x": 0, "z": 30} in boundary
    assert boundary[0] == {"x": 0, "z": 30}  # (100, 50) is the south-west corner


def test_insunits_millimetres_convert_to_metres():
    boundary = boundary_from_dxf(
        _dxf(lambda msp: msp.add_lwpolyline([(0, 0), (12000, 0), (12000, 15000), (0, 15000)], close=True), ezdxf.units.MM)
    )
    assert _bbox(boundary) == (0, 0, 12, 15)


def test_old_style_polyline_and_line_loops():
    boundary = boundary_from_dxf(
        _dxf(lambda msp: msp.add_polyline2d([(0, 0), (8, 0), (8, 6), (0, 6)], close=True))
    )
    assert _bbox(boundary) == (0, 0, 8, 6)

    def lines(msp):
        pts = [(0, 0), (10, 0), (10, 10), (5, 15), (0, 10)]
        for a, b in zip(pts, pts[1:] + pts[:1]):
            msp.add_line(a, b)
        msp.add_line((50, 50), (60, 60))  # stray line, not a loop

    boundary = boundary_from_dxf(_dxf(lines))
    assert len(boundary) == 5
    assert _bbox(boundary) == (0, 0, 10, 15)


def test_no_boundary_or_garbage_raises():
    with pytest.raises(NoBoundaryFound):
        boundary_from_dxf(_dxf(lambda msp: msp.add_line((0, 0), (1, 1))))
    with pytest.raises(NoBoundaryFound):
        boundary_from_dxf(b"not a dxf at all")


async def _headers(client: AsyncClient) -> dict:
    response = await client.post(
        "/api/auth/register",
        json={"name": "Site User", "email": "site@example.com", "password": "password123"},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_import_dxf_endpoint(client: AsyncClient):
    data = _dxf(lambda msp: msp.add_lwpolyline([(0, 0), (20, 0), (20, 30), (0, 30)], close=True))
    files = {"file": ("site.dxf", data, "application/dxf")}

    assert (await client.post("/api/site/import-dxf", files=files)).status_code == 401

    headers = await _headers(client)
    response = await client.post("/api/site/import-dxf", files=files, headers=headers)
    assert response.status_code == 200
    assert _bbox(response.json()["boundary"]) == (0, 0, 20, 30)

    bad = await client.post(
        "/api/site/import-dxf", files={"file": ("x.dxf", b"junk", "application/dxf")}, headers=headers
    )
    assert bad.status_code == 422

    big = await client.post(
        "/api/site/import-dxf",
        files={"file": ("big.dxf", b"0" * (2 * 1024 * 1024 + 10), "application/dxf")},
        headers=headers,
    )
    assert big.status_code == 413
