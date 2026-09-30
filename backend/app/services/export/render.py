"""LayoutPlan -> SVG: the plan as a vector drawing (Illustrator, Inkscape,
Figma, browsers, presentations).

Same building model as the DXF/IFC/3D exports: rooms of any shape with name
and area, walls with real gaps at openings, door swings, window glazing.
Storeys side by side, north up, each titled. All text is escaped.
"""
from __future__ import annotations

from math import atan2, cos, degrees, radians, sin
from xml.sax.saxutils import escape

from app.schemas.layout_plan import LayoutPlan
from app.services.export.model import Building, WallGeom, building_from_plan

_SCALE = 50  # px per metre
_MARGIN = 40
_GAP_M = 3.0
_ROOM_FILL = {
    "living_room": "#f3e3dc", "dining": "#f3e3dc", "dining_room": "#f3e3dc",
    "kitchen": "#f1e6d6", "entry": "#efe0d4", "foyer": "#efe0d4", "balcony": "#e9eadf",
    "bedroom": "#ecebe8", "master_bedroom": "#e6e4e0",
    "bathroom": "#e2e7ea", "toilet": "#e2e7ea",
}


def _storey_name(floor: int) -> str:
    return "Ground floor" if floor == 0 else f"Floor {floor}"


def layout_to_svg(plan: LayoutPlan, title: str | None = None) -> str:
    building = building_from_plan(plan)
    xs = [x for r in building.rooms for x, _ in r.points] or [0.0, building.width]
    ys = [y for r in building.rooms for _, y in r.points] or [0.0, building.depth]
    x0, y0 = min(xs), min(ys)
    house_w, house_d = max(xs) - x0, max(ys) - y0
    n = len(building.floors)
    width = _MARGIN * 2 + (n * house_w + (n - 1) * _GAP_M) * _SCALE + 50  # + room for the north arrow
    height = _MARGIN * 2 + house_d * _SCALE + 60

    def pt(x: float, y: float, dx: float) -> tuple[float, float]:
        # Plan space is already north-up on screen (y grows south = down).
        return (round(_MARGIN + (x - x0 + dx) * _SCALE, 1), round(_MARGIN + 30 + (y - y0) * _SCALE, 1))

    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="0 0 {width:.0f} {height:.0f}" font-family="Helvetica, Arial, sans-serif">',
        f'<rect width="{width:.0f}" height="{height:.0f}" fill="#ffffff"/>',
    ]
    if title:
        out.append(f'<text x="{_MARGIN}" y="24" font-size="16" fill="#222">{escape(title)}</text>')

    for index, floor in enumerate(building.floors):
        dx = index * (house_w + _GAP_M)
        if index == 0:
            boundary = (
                [(vertex.x, vertex.y) for vertex in plan.plot.boundary]
                if plan.plot.boundary
                else [(0.0, 0.0), (building.width, 0.0), (building.width, building.depth), (0.0, building.depth)]
            )
            points = " ".join(f"{a},{b}" for a, b in (pt(x, y, dx) for x, y in boundary))
            out.append(f'<polygon points="{points}" fill="none" stroke="#777" stroke-width="1.5" stroke-dasharray="5 3"/>')
        for room in (r for r in building.rooms if r.floor == floor):
            points = " ".join(f"{a},{b}" for a, b in (pt(x, y, dx) for x, y in room.points))
            out.append(f'<polygon points="{points}" fill="{_ROOM_FILL.get(room.type, "#eeeeee")}" stroke="none"/>')
            cx, cy = pt(*room.centroid, dx)
            out.append(f'<text x="{cx}" y="{cy - 3}" font-size="11" text-anchor="middle" fill="#222">{escape(room.label)}</text>')
            out.append(f'<text x="{cx}" y="{cy + 11}" font-size="9" text-anchor="middle" fill="#666">{room.area:.1f} m²</text>')
        for wall in (w for w in building.walls if w.floor == floor):
            out.extend(_wall_svg(wall, pt, dx))
        bx, by = pt(x0, y0 + house_d, dx)
        out.append(f'<text x="{bx}" y="{by + 24}" font-size="12" fill="#444">{_storey_name(floor)}</text>')

    # North arrow
    ax, ay = width - 30, 40
    out.append(f'<path d="M {ax} {ay} l -7 16 l 7 -6 l 7 6 z" fill="#222"/>')
    out.append(f'<text x="{ax}" y="{ay + 30}" font-size="10" text-anchor="middle" fill="#222">N</text>')
    out.append("</svg>")
    return "\n".join(out)


def _wall_svg(wall: WallGeom, pt, dx: float) -> list[str]:
    parts = []
    stroke = max(2.0, wall.thickness * _SCALE)
    for start, end in wall.solid_spans():
        (ax, ay), (bx, by) = pt(*wall.point_at(start), dx), pt(*wall.point_at(end), dx)
        parts.append(f'<line x1="{ax}" y1="{ay}" x2="{bx}" y2="{by}" stroke="#222" stroke-width="{stroke:.1f}" stroke-linecap="butt"/>')
    for opening in wall.openings:
        (ax, ay), (bx, by) = pt(*wall.point_at(opening.start), dx), pt(*wall.point_at(opening.end), dx)
        if opening.kind == "window":
            parts.append(f'<line x1="{ax}" y1="{ay}" x2="{bx}" y2="{by}" stroke="#5b8fb0" stroke-width="{stroke / 3:.1f}"/>')
            continue
        # Door: leaf standing open from the hinge, and its swing.
        r = opening.width * _SCALE
        a = atan2(by - ay, bx - ax)
        lx, ly = ax + r * cos(a - radians(90)), ay + r * sin(a - radians(90))
        parts.append(f'<line x1="{ax}" y1="{ay}" x2="{lx:.1f}" y2="{ly:.1f}" stroke="#a0702c" stroke-width="1.2"/>')
        parts.append(f'<path d="M {lx:.1f} {ly:.1f} A {r:.1f} {r:.1f} 0 0 1 {bx} {by}" fill="none" stroke="#a0702c" stroke-width="0.8" stroke-dasharray="3 2"/>')
    return parts
