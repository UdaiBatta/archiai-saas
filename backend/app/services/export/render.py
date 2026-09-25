"""LayoutPlan -> SVG (workflow Step 1.4, reused by Phase 8's PNG/PDF export).

Pure string generation — no drawing library. Rooms as labeled, type-colored
rects with dimensions; walls as strokes; doors as gap markers with a swing arc;
plot boundary; north arrow derived from facing (north-up convention: north is
always screen-up; the arrow is a fixed reminder, the facing label says which
edge is the front).
"""
from app.schemas.layout_plan import LayoutPlan
from app.schemas.requirements import RoomType

_SCALE = 50  # px per meter
_MARGIN = 40  # px

_COLORS: dict[RoomType, str] = {
    RoomType.bedroom: "#e4c6dd",
    RoomType.master_bedroom: "#deb28d",
    RoomType.bathroom: "#a9c4e4",
    RoomType.kitchen: "#8dc9ab",
    RoomType.living_room: "#bcc0e9",
    RoomType.dining: "#d9c67e",
    RoomType.balcony: "#a4d6b4",
    RoomType.entry: "#9aa4b5",
    RoomType.pooja_room: "#e9d9a8",
    RoomType.study: "#c9bce9",
    RoomType.utility: "#d4d7dc",
    RoomType.parking: "#b5b0ab",
}


def _px(meters: float) -> float:
    return round(meters * _SCALE, 1)


def layout_to_svg(plan: LayoutPlan, title: str | None = None) -> str:
    width_px = _px(plan.plot.width_m) + 2 * _MARGIN
    height_px = _px(plan.plot.depth_m) + 2 * _MARGIN + (24 if title else 0)
    top = _MARGIN + (24 if title else 0)

    parts: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width_px}" height="{height_px}" '
        f'viewBox="0 0 {width_px} {height_px}" font-family="sans-serif">',
        f'<rect width="{width_px}" height="{height_px}" fill="#fafafa"/>',
    ]
    if title:
        parts.append(f'<text x="{_MARGIN}" y="24" font-size="16" fill="#333">{title}</text>')

    # Plot boundary
    parts.append(
        f'<rect x="{_MARGIN}" y="{top}" width="{_px(plan.plot.width_m)}" height="{_px(plan.plot.depth_m)}" '
        f'fill="none" stroke="#333" stroke-width="2"/>'
    )

    for room in plan.rooms:
        x, y = _MARGIN + _px(room.x), top + _px(room.y)
        w, h = _px(room.w), _px(room.h)
        color = _COLORS.get(room.type, "#cccccc")
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{color}" stroke="#555" stroke-width="1"/>')
        cx, cy = x + w / 2, y + h / 2
        parts.append(f'<text x="{cx}" y="{cy - 4}" font-size="11" text-anchor="middle" fill="#222">{room.label}</text>')
        if room.w >= 2.0:  # hide dimension text on very small rooms (doc edge case)
            parts.append(
                f'<text x="{cx}" y="{cy + 10}" font-size="9" text-anchor="middle" fill="#444">'
                f'{room.w:.1f} x {room.h:.1f} m</text>'
            )

    for wall in plan.walls:
        if wall.kind == "open":
            continue
        parts.append(
            f'<line x1="{_MARGIN + _px(wall.x1)}" y1="{top + _px(wall.y1)}" '
            f'x2="{_MARGIN + _px(wall.x2)}" y2="{top + _px(wall.y2)}" '
            f'stroke="#222" stroke-width="{max(1.0, _px(wall.thickness))}" stroke-linecap="square"/>'
        )

    walls_by_id = {w.id: w for w in plan.walls}
    for door in plan.doors:
        wall = walls_by_id.get(door.wall_ref)
        if wall is None:
            continue
        vertical = abs(wall.x2 - wall.x1) < abs(wall.y2 - wall.y1)
        if vertical:
            x = _MARGIN + _px(wall.x1)
            y = top + _px(min(wall.y1, wall.y2) + door.offset)
            gap = _px(door.width)
            parts.append(f'<line x1="{x}" y1="{y}" x2="{x}" y2="{y + gap}" stroke="#fafafa" stroke-width="{max(2.0, _px(wall.thickness) + 1)}"/>')
            parts.append(f'<path d="M {x} {y} A {gap} {gap} 0 0 1 {x + gap} {y + gap}" fill="none" stroke="#a0702c" stroke-width="1"/>')
        else:
            x = _MARGIN + _px(min(wall.x1, wall.x2) + door.offset)
            y = top + _px(wall.y1)
            gap = _px(door.width)
            parts.append(f'<line x1="{x}" y1="{y}" x2="{x + gap}" y2="{y}" stroke="#fafafa" stroke-width="{max(2.0, _px(wall.thickness) + 1)}"/>')
            parts.append(f'<path d="M {x} {y} A {gap} {gap} 0 0 1 {x + gap} {y + gap}" fill="none" stroke="#a0702c" stroke-width="1"/>')

    # North arrow (north-up) + facing label
    ax, ay = width_px - 24, top + 26
    parts.append(f'<path d="M {ax} {ay} l -6 14 l 6 -5 l 6 5 z" fill="#333"/>')
    parts.append(f'<text x="{ax}" y="{ay + 26}" font-size="10" text-anchor="middle" fill="#333">N</text>')
    parts.append(
        f'<text x="{_MARGIN}" y="{height_px - 12}" font-size="10" fill="#555">'
        f'facing: {plan.plot.facing.value} - plot {plan.plot.width_m:.1f} x {plan.plot.depth_m:.1f} m</text>'
    )
    parts.append("</svg>")
    return "\n".join(parts)
