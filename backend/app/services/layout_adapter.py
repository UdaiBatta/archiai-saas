"""Bridge the canonical MVP LayoutPlan to the existing canvas JSON shape.

The new pipeline uses NW-corner ``x/y`` rectangles.  The current editor uses
center-based ``x/z`` boxes.  Keeping this conversion in one deterministic
boundary lets Design, DesignVersion, share, and project-loading flows continue
to consume their established schema while canonical artifacts remain intact.
"""

from math import hypot, radians

from app.config.mvp_defaults import WALL_HEIGHT_M
from app.schemas.layout_plan import Door, LayoutPlan, PlanRoom, Wall
from app.services.parser.vastu import is_vastu_requested

ROOM_COLORS: dict[str, str] = {
    "living_room":    "#b3b8e9",
    "kitchen":        "#6bc0a1",
    "master_bedroom": "#dea97d",
    "bedroom":        "#e4a6c6",
    "bathroom":       "#9abbe4",
    "dining_room":    "#d6bd5d",
    "office":         "#c8bced",
    "study":          "#d2b7ed",
    "workspace":      "#ac95e1",
    "meeting_room":   "#9977d4",
    "reception":      "#3cb4a6",
    "waiting_room":   "#66bfb4",
    "consultation_room": "#79bddb",
    "classroom":      "#d0a254",
    "retail_display": "#50bb77",
    "checkout":       "#cead48",
    "storage":        "#b7b4b2",
    "entry":          "#7d8795",
    "hallway":        "#afb6c1",
    "balcony":        "#80cc9c",
    "garage":         "#888380",
    "utility":        "#e4e7ec",
    "stairs":         "#b3b6bc",
    "wall":           "#475569",
    "door":           "#a0702c",
    "window":         "#79bddb",
}
_FALLBACK_COLOR = "#94a3b8"
_ROOM_COLOR_ALIASES = {
    "dining": "dining_room",
    "parking": "garage",
}


def _rotation(degrees: int = 0) -> dict[str, float]:
    return {"x": 0.0, "y": radians(degrees), "z": 0.0}


def _room_color(room_type: str) -> str:
    key = _ROOM_COLOR_ALIASES.get(room_type, room_type)
    return ROOM_COLORS.get(key, _FALLBACK_COLOR)


def _bounded_center(origin: float, span: float, plot_span: float) -> float:
    """Keep half-millimetre centres so converting back preserves shared edges."""

    half = span / 2
    return min(plot_span - half, max(half, origin + half))


def _box_size(room: PlanRoom) -> dict[str, float]:
    """Canvas boxes carry their LOCAL size and are rendered rotated; canonical
    ``w``/``h`` are the room's WORLD bounds. A quarter turn therefore swaps
    them, exactly as the frontend adapter (``mvpLayoutAdapter.ts``) does — a
    rotated room written without the swap comes back with its footprint
    transposed on reload/share/export.
    """
    swapped = room.rotation in (90, 270)
    return {
        "w": room.h if swapped else room.w,
        "h": WALL_HEIGHT_M,
        "d": room.w if swapped else room.h,
    }


def _wall_object(wall: Wall, index: int) -> dict:
    horizontal = abs(wall.x2 - wall.x1) >= abs(wall.y2 - wall.y1)
    length = hypot(wall.x2 - wall.x1, wall.y2 - wall.y1)
    return {
        "id": wall.id,
        "label": f"Wall {index}",
        "roomType": "wall",
        "objectType": "wall",
        "floorId": f"floor_{wall.floor}",
        "floorLevel": wall.floor,
        "position": {
            "x": round((wall.x1 + wall.x2) / 2, 3),
            "y": wall.floor * WALL_HEIGHT_M + WALL_HEIGHT_M / 2,
            "z": round((wall.y1 + wall.y2) / 2, 3),
        },
        "size": {
            "w": round(length if horizontal else wall.thickness, 3),
            "h": WALL_HEIGHT_M,
            "d": round(wall.thickness if horizontal else length, 3),
        },
        "rotation": _rotation(),
        "color": ROOM_COLORS["wall"],
        **({"betweenRooms": list(wall.rooms)} if wall.rooms else {}),
    }


def room_edges(plan: LayoutPlan) -> list[dict]:
    """Every adjacent room pair and how it meets: open / door / wall.
    Mirrors ``edgesFromLayout`` in the frontend adapter."""
    doored = {door.wall_ref for door in plan.doors}
    by_pair: dict[tuple[str, str], str] = {}
    for wall in plan.walls:
        if not wall.rooms:
            continue
        pair = tuple(sorted(wall.rooms))
        kind = "open" if wall.kind == "open" else ("door" if wall.id in doored else "wall")
        previous = by_pair.get(pair)
        # A pair can share several wall segments; any door wins over solid wall.
        if previous is None or (previous == "wall" and kind == "door"):
            by_pair[pair] = kind
    return [{"rooms": list(pair), "kind": kind} for pair, kind in by_pair.items()]


def _door_object(door: Door, wall: Wall, index: int) -> dict:
    dx = wall.x2 - wall.x1
    dy = wall.y2 - wall.y1
    length = hypot(dx, dy)
    at = min(door.offset + door.width / 2, length)
    unit_x = dx / length if length else 0.0
    unit_y = dy / length if length else 0.0
    horizontal = abs(dx) >= abs(dy)
    marker_thickness = max(wall.thickness * 1.5, 0.16)
    return {
        "id": door.id,
        "label": f"Door {index}",
        "roomType": "door",
        "objectType": "door",
        "floorId": f"floor_{door.floor}",
        "floorLevel": door.floor,
        "hostWallId": wall.id,
        "position": {
            "x": round(wall.x1 + unit_x * at, 3),
            "y": door.floor * WALL_HEIGHT_M + 1.05,
            "z": round(wall.y1 + unit_y * at, 3),
        },
        "size": {
            "w": round(door.width if horizontal else marker_thickness, 3),
            "h": 2.1,
            "d": round(marker_thickness if horizontal else door.width, 3),
        },
        "rotation": _rotation(),
        "color": ROOM_COLORS["door"],
    }


def layout_plan_to_canvas(
    plan: LayoutPlan,
    *,
    prompt: str | None = None,
    building_type: str = "house",
    requirements: dict | None = None,
    quality: dict | None = None,
) -> dict:
    """Convert a canonical plan to byte-stable legacy canvas JSON."""

    room_objects = [
        {
            "id": room.id,
            "label": room.label,
            "roomType": room.type,
            "objectType": (
                "stair" if room.type in {"staircase", "stairs"} else "room"
            ),
            "floorId": f"floor_{room.floor}",
            "floorLevel": room.floor,
            "position": {
                "x": _bounded_center(room.x, room.w, plan.plot.width_m),
                "y": room.floor * WALL_HEIGHT_M + WALL_HEIGHT_M / 2,
                "z": _bounded_center(room.y, room.h, plan.plot.depth_m),
            },
            "size": _box_size(room),
            "rotation": _rotation(room.rotation),
            "color": _room_color(room.type),
            **({"zoneId": room.zone_id} if room.zone_id is not None else {}),
        }
        for room in plan.rooms
    ]
    wall_objects = [
        _wall_object(wall, index)
        for index, wall in enumerate(plan.walls, start=1)
        if wall.kind != "open"  # open-plan edge: no physical wall
    ]
    walls_by_id = {wall.id: wall for wall in plan.walls}
    door_objects = [
        _door_object(door, walls_by_id[door.wall_ref], index)
        for index, door in enumerate(plan.doors, start=1)
        if door.wall_ref in walls_by_id
    ]
    objects = [*room_objects, *wall_objects, *door_objects]
    total_floors = max((room.floor for room in plan.rooms), default=0) + 1
    footprint = {
        # Existing canvas footprints store their minimum X/Z corner, not their
        # centre. The canonical plan already starts at the NW origin (0, 0).
        "x": 0.0,
        "z": 0.0,
        "w": plan.plot.width_m,
        "d": plan.plot.depth_m,
    }
    total_area = round(sum(room.w * room.h for room in plan.rooms), 3)
    metadata = {
        "pipeline": "mvp",
        "prompt": prompt,
        "building_type": building_type,
        "buildingType": building_type,
        "style": "concept",
        "room_count": len(room_objects),
        "totalFloors": total_floors,
        "totalRooms": len(room_objects),
        "totalObjects": len(objects),
        "totalAreaSqm": total_area,
        "placementEngine": "mvp_subdivision",
        "candidateCount": 1,
        # The frontend needs the original opt-in intent when it re-scores an
        # edited plan after save/reload. Never infer Vastu from room content.
        "mvpVastuEnabled": is_vastu_requested(prompt or ""),
        "mvpEdges": room_edges(plan),
        "mvpConnections": [c.model_dump(mode="json") for c in plan.connections],
        **({"mvpFootprint": plan.footprint.model_dump(mode="json")} if plan.footprint else {}),
    }
    if requirements is not None:
        metadata["mvpRequirements"] = requirements
    if quality is not None:
        metadata["mvpQuality"] = quality
    if plan.archetype_reasons:
        metadata["archetypeReasons"] = [
            reason.model_dump(mode="json")
            for reason in plan.archetype_reasons
        ]

    return {
        "version": "1.0",
        "metadata": metadata,
        "building": {
            "floorHeight": WALL_HEIGHT_M,
            "footprint": footprint,
        },
        "floors": [
            {
                "id": f"floor_{floor}",
                "name": (
                    "Ground Floor"
                    if floor == 0
                    else ("First Floor" if floor == 1 else f"Floor {floor}")
                ),
                "level": floor,
                "elevation": floor * WALL_HEIGHT_M,
                "footprint": footprint,
                "rooms": [
                    item for item in objects
                    if item["floorLevel"] == floor
                ],
            }
            for floor in range(total_floors)
        ],
        "rooms": objects,
    }
