"""Canonical-to-canvas compatibility checks for the MVP layout adapter."""

from pathlib import Path

from app.schemas.layout_plan import LayoutPlan
from app.schemas.requirements import RequirementsSpec
from app.services.layout_adapter import layout_plan_to_canvas
from app.services.layout_engine import generate_plan
from app.services.layout_engine.engine import rebuild_derived_geometry
from app.services.quality.hard_constraints import validate


def test_canvas_footprint_uses_min_corner_and_contains_converted_rooms():
    spec = RequirementsSpec.model_validate(
        {
            "rooms": [
                {"type": "bedroom", "count": 2},
                {"type": "living_room", "count": 1},
                {"type": "kitchen", "count": 1},
                {"type": "bathroom", "count": 1},
            ],
            "plot": {"width_m": 9.0, "depth_m": 12.0},
            "facing": "east",
        }
    )

    canvas = layout_plan_to_canvas(generate_plan(spec))
    floor = canvas["floors"][0]
    footprint = floor["footprint"]

    assert footprint == {"x": 0.0, "z": 0.0, "w": 9.0, "d": 12.0}
    assert canvas["building"]["footprint"] == footprint

    for room in floor["rooms"]:
        if room["objectType"] != "room":
            continue
        half_w = room["size"]["w"] / 2
        half_d = room["size"]["d"] / 2
        assert room["position"]["x"] - half_w >= footprint["x"]
        assert room["position"]["x"] + half_w <= footprint["x"] + footprint["w"]
        assert room["position"]["z"] - half_d >= footprint["z"]
        assert room["position"]["z"] + half_d <= footprint["z"] + footprint["d"]


def test_rotated_room_keeps_its_world_footprint_on_the_canvas():
    """Canonical w/h are world bounds; a canvas box is local and rendered
    rotated, so a quarter turn must swap them (same rule as the frontend
    adapter). Without the swap a saved rotated room reloads transposed."""

    plan = LayoutPlan.model_validate(
        {
            "plot": {"width_m": 9.0, "depth_m": 12.0, "facing": "east"},
            "rooms": [
                {
                    "id": "r1", "type": "bedroom", "label": "Bedroom 1",
                    "x": 0.0, "y": 0.0, "w": 4.5, "h": 12.0, "rotation": 0,
                },
                {
                    "id": "r2", "type": "bedroom", "label": "Bedroom 2",
                    "x": 4.5, "y": 0.0, "w": 4.5, "h": 12.0, "rotation": 90,
                },
            ],
            "walls": [],
            "doors": [],
        }
    )

    rooms = {
        room["id"]: room
        for room in layout_plan_to_canvas(plan)["rooms"]
        if room["objectType"] == "room"
    }

    assert rooms["r1"]["size"] == {"w": 4.5, "h": 3.0, "d": 12.0}
    assert rooms["r2"]["size"] == {"w": 12.0, "h": 3.0, "d": 4.5}
    for room, canonical in zip(plan.rooms, (rooms["r1"], rooms["r2"])):
        swapped = room.rotation in (90, 270)
        world_w = canonical["size"]["d"] if swapped else canonical["size"]["w"]
        world_d = canonical["size"]["w"] if swapped else canonical["size"]["d"]
        assert (world_w, world_d) == (room.w, room.h)


def test_canvas_metadata_preserves_explicit_vastu_opt_in_only():
    spec = RequirementsSpec.model_validate(
        {
            "rooms": [{"type": "bedroom", "count": 1}],
            "plot": {"width_m": 9.0, "depth_m": 12.0},
            "facing": "east",
        }
    )
    plan = generate_plan(spec)

    default_canvas = layout_plan_to_canvas(plan, prompt="One bedroom house")
    vastu_canvas = layout_plan_to_canvas(plan, prompt="One bedroom Vastu house")

    assert default_canvas["metadata"]["mvpVastuEnabled"] is False
    assert vastu_canvas["metadata"]["mvpVastuEnabled"] is True


def test_odd_millimetre_room_width_preserves_its_origin_after_conversion():
    plan = LayoutPlan.model_validate({
        "plot": {"width_m": 12, "depth_m": 15, "facing": "east"},
        "rooms": [{"id": "r1", "type": "corridor", "label": "Corridor", "x": 5.212, "y": 0, "w": 1.553, "h": 15, "rotation": 0}],
        "walls": [], "doors": [],
    })
    room = layout_plan_to_canvas(plan)["rooms"][0]
    assert round(room["position"]["x"] - room["size"]["w"] / 2, 3) == 5.212


def test_saved_millimetre_boundary_drift_does_not_disconnect_the_corridor():
    # Former independently rounded centres produced 5.213 + 1.553 = 6.766
    # beside the public band's 6.765 edge. That is within the existing 1 mm
    # policy; binary float noise must not turn it into a disconnected plan.
    spec = RequirementsSpec.model_validate({"plot": {"width_m": 12, "depth_m": 15}, "facing": "east", "rooms": [{"type": "bedroom", "count": 2}, {"type": "bathroom", "count": 2}, {"type": "kitchen", "count": 1}, {"type": "living_room", "count": 1}]})
    rectangles = [
        ("kitchen", 6.765, 0, 5.235, 4.821), ("living_room", 6.765, 4.821, 5.235, 8.572),
        ("entry", 6.765, 13.393, 5.235, 1.607), ("corridor", 5.213, 0, 1.553, 15),
        ("bedroom", 0, 0, 5.212, 5.25), ("bathroom", 0, 5.25, 5.212, 2.25),
        ("bathroom", 0, 7.5, 5.212, 2.25), ("bedroom", 0, 9.75, 5.212, 5.25),
    ]
    plan = LayoutPlan.model_validate({
        "plot": {"width_m": 12, "depth_m": 15, "facing": "east"},
        "rooms": [{"id": f"r{i}", "type": kind, "label": kind, "x": x, "y": y, "w": w, "h": h, "rotation": 0} for i, (kind, x, y, w, h) in enumerate(rectangles)],
        "walls": [], "doors": [],
    })
    rebuilt = rebuild_derived_geometry(plan, spec)
    assert not [issue for issue in validate(rebuilt) if issue.code == "unreachable"]


def test_multi_floor_plan_maps_objects_to_existing_canvas_levels():
    spec = RequirementsSpec.model_validate({
        "building_type": "duplex",
        "floors": 2,
        "rooms": [
            {"type": "living_room", "count": 1},
            {"type": "kitchen", "count": 1},
            {"type": "bedroom", "count": 3},
            {"type": "bathroom", "count": 2},
        ],
        "plot": {"width_m": 12, "depth_m": 14},
    })

    canvas = layout_plan_to_canvas(generate_plan(spec))

    assert canvas["metadata"]["totalFloors"] == 2
    assert [floor["level"] for floor in canvas["floors"]] == [0, 1]
    assert all(
        room["floorLevel"] == floor["level"]
        for floor in canvas["floors"]
        for room in floor["rooms"]
    )
    stairs = [room for room in canvas["rooms"] if room["objectType"] == "stair"]
    assert len(stairs) == 2
    assert {stair["floorLevel"] for stair in stairs} == {0, 1}
    assert {
        stair["position"]["y"] for stair in stairs
    } == {1.5, 4.5}


def test_hierarchical_zone_metadata_reaches_the_existing_canvas_contract():
    fixture = (
        Path(__file__).parent
        / "fixtures"
        / "requirements"
        / "phase10_composed_school.json"
    )
    spec = RequirementsSpec.model_validate_json(fixture.read_text(encoding="utf-8"))

    canvas = layout_plan_to_canvas(generate_plan(spec))

    reasons = canvas["metadata"]["archetypeReasons"]
    assert {reason["archetype"] for reason in reasons} >= {
        "double_loaded_corridor",
        "open_core",
    }
    canonical_rooms = [
        room for room in canvas["rooms"]
        if room["objectType"] in {"room", "stair"}
    ]
    assert all(room["zoneId"] for room in canonical_rooms)
