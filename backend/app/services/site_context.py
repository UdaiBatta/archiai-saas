"""Surrounding buildings for a site, from OpenStreetMap (Site Atlas context).

The Overpass API returns building outlines (lat/lon) and, when mapped, a
height or a number of levels. They are converted to local metres around the
requested point (x east, z south, matching the canvas) so the editor can draw
them as grey context massing. Data is © OpenStreetMap contributors (ODbL):
the frontend shows that credit wherever it draws them.
"""
from __future__ import annotations

import math
import re
import time
from collections import OrderedDict

import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
LEVEL_HEIGHT_M = 3.2
DEFAULT_HEIGHT_M = 9.0
MAX_BUILDINGS = 400
_CACHE_TTL_S = 24 * 3600
_CACHE_SIZE = 64
_cache: OrderedDict[tuple[float, float, int], tuple[float, list[dict]]] = OrderedDict()


class ContextUnavailable(Exception):
    """The map service could not be reached or answered with an error."""


def _height(tags: dict) -> float:
    raw = tags.get("height") or tags.get("building:height")
    if raw:
        match = re.match(r"\s*([0-9]+(?:\.[0-9]+)?)", str(raw))
        if match:
            value = float(match.group(1))
            if "ft" in str(raw):
                value *= 0.3048
            if 2 <= value <= 600:
                return round(value, 2)
    levels = tags.get("building:levels")
    if levels:
        try:
            n = float(str(levels).split(";")[0])
            if 1 <= n <= 200:
                return round(n * LEVEL_HEIGHT_M, 2)
        except ValueError:
            pass
    return DEFAULT_HEIGHT_M


def buildings_from_overpass(payload: dict, lat0: float, lon0: float) -> list[dict]:
    """Overpass `out geom` JSON -> [{footprint: [{x, z}], height_m}] in local metres."""
    kx = 111_320.0 * math.cos(math.radians(lat0))
    kz = 110_540.0
    out: list[dict] = []
    for element in payload.get("elements", []):
        if element.get("type") != "way":
            continue
        geometry = element.get("geometry") or []
        points = [
            {"x": round((g["lon"] - lon0) * kx, 2), "z": round(-(g["lat"] - lat0) * kz, 2)}
            for g in geometry
            if isinstance(g, dict) and "lat" in g and "lon" in g
        ]
        if len(points) > 1 and points[0] == points[-1]:
            points = points[:-1]
        if len(points) < 3:
            continue
        out.append({"footprint": points, "height_m": _height(element.get("tags") or {})})
        if len(out) >= MAX_BUILDINGS:
            break
    return out


def _query(lat: float, lon: float, radius_m: int) -> str:
    return f'[out:json][timeout:20];way["building"](around:{radius_m},{lat},{lon});out geom tags;'


async def fetch_context(lat: float, lon: float, radius_m: int) -> list[dict]:
    key = (round(lat, 5), round(lon, 5), radius_m)
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < _CACHE_TTL_S:
        _cache.move_to_end(key)
        return hit[1]
    try:
        async with httpx.AsyncClient(timeout=25.0, headers={"User-Agent": "ArchiAI/1.0 (site context)"}) as client:
            response = await client.post(OVERPASS_URL, data={"data": _query(lat, lon, radius_m)})
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ContextUnavailable("The map service did not answer. Try again in a minute.") from exc
    buildings = buildings_from_overpass(payload, lat, lon)
    _cache[key] = (time.monotonic(), buildings)
    while len(_cache) > _CACHE_SIZE:
        _cache.popitem(last=False)
    return buildings
