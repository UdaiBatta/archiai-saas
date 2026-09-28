"""Site boundary import from DXF (roadmap P2).

Picks the largest closed outline in modelspace - closed LWPOLYLINE/POLYLINE,
or a simple loop of LINEs - converts drawing units to metres from $INSUNITS
and maps drawing (x, y) to the canvas plan (x, z) with north = -z, shifted so
the outline's min corner sits at the origin.
"""
import io

import ezdxf
from ezdxf import recover
from ezdxf import units as dxf_units


class NoBoundaryFound(ValueError):
    pass


Point = tuple[float, float]


def _area(points: list[Point]) -> float:
    total = 0.0
    for i, (x0, y0) in enumerate(points):
        x1, y1 = points[(i + 1) % len(points)]
        total += x0 * y1 - x1 * y0
    return abs(total) / 2


def _dedupe_closing(points: list[Point]) -> list[Point]:
    if len(points) > 1 and _close(points[0], points[-1]):
        return points[:-1]
    return points


def _close(a: Point, b: Point, tol: float = 1e-6) -> bool:
    return abs(a[0] - b[0]) <= tol and abs(a[1] - b[1]) <= tol


def _line_loops(lines: list[tuple[Point, Point]]) -> list[list[Point]]:
    """Simple cycles from LINE segments whose endpoints meet exactly (rounded)."""
    key = lambda p: (round(p[0], 6), round(p[1], 6))  # noqa: E731
    adjacency: dict[tuple[float, float], list[tuple[float, float]]] = {}
    for a, b in lines:
        ka, kb = key(a), key(b)
        if ka == kb:
            continue
        adjacency.setdefault(ka, []).append(kb)
        adjacency.setdefault(kb, []).append(ka)
    loops: list[list[Point]] = []
    seen: set[tuple[float, float]] = set()
    for start in adjacency:
        if start in seen:
            continue
        # Walk the component; it is a loop only if every node has degree 2.
        component, stack = [], [start]
        seen.add(start)
        while stack:
            node = stack.pop()
            component.append(node)
            for nxt in adjacency[node]:
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        if len(component) < 3 or any(len(adjacency[n]) != 2 for n in component):
            continue
        ring, prev, node = [start], None, start
        while True:
            a, b = adjacency[node]
            nxt = b if a == prev else a
            if nxt == start:
                break
            ring.append(nxt)
            prev, node = node, nxt
        loops.append(ring)
    return loops


def _candidates(doc) -> list[list[Point]]:
    msp = doc.modelspace()
    rings: list[list[Point]] = []
    # ponytail: bulges (arc segments) are flattened to their chord; boundaries are straight-edged.
    for pl in msp.query("LWPOLYLINE"):
        pts = [(float(x), float(y)) for x, y, *_ in pl.get_points("xy")]
        if pl.closed or (len(pts) > 3 and _close(pts[0], pts[-1])):
            rings.append(_dedupe_closing(pts))
    for pl in msp.query("POLYLINE"):
        if not pl.is_2d_polyline and not pl.is_3d_polyline:
            continue
        pts = [(float(v.dxf.location.x), float(v.dxf.location.y)) for v in pl.vertices]
        if pl.is_closed or (len(pts) > 3 and _close(pts[0], pts[-1])):
            rings.append(_dedupe_closing(pts))
    lines = [
        ((float(e.dxf.start.x), float(e.dxf.start.y)), (float(e.dxf.end.x), float(e.dxf.end.y)))
        for e in msp.query("LINE")
    ]
    rings.extend(_line_loops(lines))
    return [r for r in rings if len(r) >= 3 and _area(r) > 1e-9]


def boundary_from_dxf(data: bytes) -> list[dict[str, float]]:
    """Largest closed outline in the DXF, as plan points in metres."""
    try:
        doc, _auditor = recover.read(io.BytesIO(data))
    except (IOError, ezdxf.DXFStructureError) as exc:
        raise NoBoundaryFound("Not a readable DXF file") from exc
    rings = _candidates(doc)
    if not rings:
        raise NoBoundaryFound("No closed polyline or line loop found in the DXF")
    ring = max(rings, key=_area)
    insunits = int(doc.header.get("$INSUNITS", 0) or 0)
    # Unitless drawings are taken as metres.
    try:
        factor = dxf_units.conversion_factor(insunits, dxf_units.M) if insunits else 1.0
    except (KeyError, ValueError, TypeError) as exc:
        raise NoBoundaryFound(f"Unsupported drawing units ($INSUNITS={insunits})") from exc
    plan = [(x * factor, -y * factor) for x, y in ring]  # north (+y) -> -z
    min_x = min(x for x, _ in plan)
    min_z = min(z for _, z in plan)
    return [{"x": round(x - min_x, 3), "z": round(z - min_z, 3)} for x, z in plan]
