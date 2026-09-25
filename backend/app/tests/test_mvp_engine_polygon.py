"""generate_plan()'s polygon-boundary path (workflow Phase 8). Kept separate
from test_mvp_engine.py's fixture-driven suite since these specs are built
in-line (no polygon fixtures exist yet). Real polygon overlap, containment,
and tiling checks supplement the engine's topology validation.
"""
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.schemas.requirements import (
    Facing,
    PlotSpec,
    RequirementsSpec,
    RoomRequest,
    RoomType,
    Vertex,
)
from app.schemas.layout_plan import Door, LayoutPlan, PlanPlot, PlanRoom, Wall
from app.services.layout_engine import (
    DoesNotFitError,
    generate_plan,
    rebuild_derived_geometry,
)
from app.services.layout_engine import polygon as polygon_mod
from app.services.layout_engine.geometry import Rect
from app.services.quality.hard_constraints import validate

_TRAPEZOID = [
    Vertex(x=0, y=0), Vertex(x=12, y=0), Vertex(x=12, y=6), Vertex(x=8, y=10), Vertex(x=0, y=10),
]


def _spec(boundary, rooms=None, facing=Facing.south) -> RequirementsSpec:
    return RequirementsSpec(
        rooms=rooms or [
            RoomRequest(type=RoomType.living_room, count=1),
            RoomRequest(type=RoomType.bedroom, count=2),
            RoomRequest(type=RoomType.bathroom, count=1),
            RoomRequest(type=RoomType.kitchen, count=1),
        ],
        plot=PlotSpec(boundary=boundary),
        facing=facing,
    )


def _room_polygon(room):
    if room.vertices is not None:
        return polygon_mod.polygon_from_vertices(room.vertices)
    return polygon_mod.rect_to_polygon(Rect(room.x, room.y, room.w, room.h))


def _expected_room_count(spec: RequirementsSpec) -> int:
    """Mirrors test_mvp_engine.py's own helper: a bare count formula went
    stale the moment Phase 4.1 (ensure_corridor) started sometimes injecting
    a corridor node — derive the expectation from the real program instead
    of duplicating ensure_corridor's own threshold here."""
    from app.services.layout_engine.engine import _build_program

    requested = sum(r.count for r in spec.rooms)
    has_entry = any(r.type == RoomType.entry for r in spec.rooms)
    count = requested + (0 if has_entry else 1)  # auto-entry
    program = _build_program(spec)
    if any(n.type in ("corridor", "hallway") for n in program.needs):
        count += 1
    return count


def _assert_polygon_plan_is_sound(plan):
    """Real polygon-vs-polygon checks (not bbox), independent of the
    not-yet-polygon-aware `services.quality.validate`: no true overlaps,
    every room actually inside the plot boundary, zero-gap tiling."""
    plot_poly = polygon_mod.polygon_from_vertices(plan.plot.boundary)
    room_polys = [_room_polygon(r) for r in plan.rooms]

    for i, a in enumerate(room_polys):
        for b in room_polys[i + 1:]:
            assert a.intersection(b).area <= 1e-6, "rooms must not truly overlap"

    for poly in room_polys:
        assert poly.difference(plot_poly).area <= 1e-6, "a room must not extend past the plot boundary"

    total = sum(p.area for p in room_polys)
    assert total == pytest.approx(plot_poly.area, rel=0.01), "rooms must tile the plot with zero gaps"

    wall_ids = {w.id for w in plan.walls}
    assert plan.doors, "a plan must have doors"
    for door in plan.doors:
        assert door.wall_ref in wall_ids


def test_trapezoidal_plot_produces_a_sound_plan():
    spec = _spec(_TRAPEZOID)
    plan = generate_plan(spec)
    assert len(plan.rooms) == _expected_room_count(spec)
    _assert_polygon_plan_is_sound(plan)


def test_a_room_clipped_by_the_slant_carries_vertices():
    plan = generate_plan(_spec(_TRAPEZOID))
    assert any(r.vertices is not None for r in plan.rooms), "the slanted edge should clip at least one leaf"


def test_rect_shaped_leaves_stay_plain_rects():
    plan = generate_plan(_spec(_TRAPEZOID))
    assert any(r.vertices is None for r in plan.rooms), "leaves away from the slant should stay plain rects"


def test_walls_are_deduplicated_on_a_polygon_plot():
    plan = generate_plan(_spec(_TRAPEZOID))
    seen = set()
    for w in plan.walls:
        key = (round(w.x1, 2), round(w.y1, 2), round(w.x2, 2), round(w.y2, 2))
        assert key not in seen, f"duplicate wall segment {key}"
        seen.add(key)


def test_engine_is_deterministic_on_a_polygon_plot():
    spec = _spec(_TRAPEZOID)
    assert generate_plan(spec) == generate_plan(spec)


def test_rectangular_boundary_field_behaves_like_the_plain_rect_path():
    # A degenerate "polygon" that's actually just a rectangle should still
    # route through _generate_plan_polygon (boundary is set) and produce an
    # equally sound, all-plain-rect plan.
    boundary = [Vertex(x=0, y=0), Vertex(x=10, y=0), Vertex(x=10, y=10), Vertex(x=0, y=10)]
    plan = generate_plan(_spec(boundary))
    assert all(r.vertices is None for r in plan.rooms)
    _assert_polygon_plan_is_sound(plan)


def test_invalid_self_intersecting_boundary_raises_does_not_fit():
    bowtie = [Vertex(x=0, y=0), Vertex(x=10, y=10), Vertex(x=10, y=0), Vertex(x=0, y=10)]
    with pytest.raises(DoesNotFitError):
        generate_plan(_spec(bowtie))


def test_undersized_polygon_plot_raises_does_not_fit():
    tiny = [Vertex(x=0, y=0), Vertex(x=3, y=0), Vertex(x=3, y=3), Vertex(x=0, y=3)]
    with pytest.raises(DoesNotFitError):
        generate_plan(_spec(tiny))


def test_l_shaped_non_convex_plot_produces_a_sound_plan():
    # A non-convex boundary (missing corner notch), sized generously — Phase
    # 1's unbanded single-shot subdivider needs more headroom on a non-convex
    # shape than a rectangle of the same nominal area (a known, documented
    # scope limit: zone-aware banding is deferred). This is verified to fit;
    # smaller/denser L-shapes can legitimately hit the min-size gate and
    # raise DoesNotFitError instead, which is the correct designed behavior,
    # not a bug (see the property gate below for that contract).
    l_shape = [
        Vertex(x=0, y=0), Vertex(x=14, y=0), Vertex(x=14, y=9),
        Vertex(x=9, y=9), Vertex(x=9, y=14), Vertex(x=0, y=14),
    ]
    plan = generate_plan(_spec(l_shape, rooms=[
        RoomRequest(type=RoomType.living_room, count=1),
        RoomRequest(type=RoomType.bedroom, count=1),
        RoomRequest(type=RoomType.bathroom, count=1),
        RoomRequest(type=RoomType.kitchen, count=1),
    ]))
    _assert_polygon_plan_is_sound(plan)


def test_slanted_shared_wall_is_reachable_without_bbox_false_overlap():
    boundary = [
        Vertex(x=0, y=0), Vertex(x=4, y=0),
        Vertex(x=4, y=4), Vertex(x=0, y=4),
    ]
    plan = LayoutPlan(
        plot=PlanPlot(width_m=4, depth_m=4, boundary=boundary),
        rooms=[
            PlanRoom(
                id="entry", type="entry", label="Entry",
                x=0, y=0, w=4, h=4,
                vertices=[boundary[0], boundary[1], boundary[3]],
            ),
            PlanRoom(
                id="bedroom", type="bedroom", label="Bedroom",
                x=0, y=0, w=4, h=4,
                vertices=[boundary[1], boundary[2], boundary[3]],
            ),
        ],
        walls=[Wall(id="diagonal", x1=4, y1=0, x2=0, y2=4)],
        doors=[Door(id="door", wall_ref="diagonal", offset=1, width=0.9)],
    )

    assert validate(plan) == []


def test_polygon_room_in_an_l_plot_notch_is_out_of_bounds():
    boundary = [
        Vertex(x=0, y=0), Vertex(x=10, y=0), Vertex(x=10, y=6),
        Vertex(x=6, y=6), Vertex(x=6, y=10), Vertex(x=0, y=10),
    ]
    room_vertices = [
        Vertex(x=7, y=7), Vertex(x=9, y=7),
        Vertex(x=9, y=9), Vertex(x=7, y=9),
    ]
    plan = LayoutPlan(
        plot=PlanPlot(width_m=10, depth_m=10, boundary=boundary),
        rooms=[PlanRoom(
            id="outside", type="entry", label="Outside",
            x=7, y=7, w=2, h=2, vertices=room_vertices,
        )],
    )

    assert "out_of_bounds" in {violation.code for violation in validate(plan)}


def test_polygon_editor_sync_rebuilds_real_edges_without_losing_vertices():
    spec = _spec(_TRAPEZOID)
    plan = generate_plan(spec)

    rebuilt = rebuild_derived_geometry(plan, spec)

    assert rebuilt.plot.boundary == plan.plot.boundary
    assert [room.vertices for room in rebuilt.rooms] == [
        room.vertices for room in plan.rooms
    ]
    assert len(rebuilt.walls) == len(plan.walls)
    assert len(rebuilt.doors) == len(plan.doors)
    # Rebuilding reproduces the plan; it never changes the verdict on it.
    assert validate(rebuilt, spec) == validate(plan, spec)


def test_polygon_home_has_no_room_behind_the_kitchen():
    spec = _spec(_TRAPEZOID)
    assert validate(generate_plan(spec), spec) == []


# ── Go/no-go property gate, mirroring test_mvp_engine.py's rect-path gate ────


@st.composite
def random_polygon_specs(draw):
    w = draw(st.floats(9.0, 20.0).map(lambda v: round(v, 1)))
    d = draw(st.floats(9.0, 20.0).map(lambda v: round(v, 1)))
    shape = draw(st.sampled_from(["rect", "one_corner_cut", "two_corners_cut", "l_shape"]))
    cut = draw(st.floats(0.5, min(w, d) * 0.3).map(lambda v: round(v, 2)))

    if shape == "rect":
        verts = [(0, 0), (w, 0), (w, d), (0, d)]
    elif shape == "one_corner_cut":
        verts = [(0, 0), (w - cut, 0), (w, cut), (w, d), (0, d)]
    elif shape == "two_corners_cut":
        verts = [
            (cut, 0), (w - cut, 0), (w, cut), (w, d - cut),
            (w - cut, d), (cut, d), (0, d - cut), (0, cut),
        ]
    else:  # l_shape — non-convex
        notch_w, notch_d = min(cut + 1.0, w * 0.4), min(cut + 1.0, d * 0.4)
        verts = [
            (0, 0), (w, 0), (w, d - notch_d),
            (w - notch_w, d - notch_d), (w - notch_w, d), (0, d),
        ]

    boundary = [Vertex(x=x, y=y) for x, y in verts]
    rooms = [
        {"type": "bedroom", "count": draw(st.integers(1, 4))},
        {"type": "bathroom", "count": draw(st.integers(1, 2))},
        {"type": "kitchen", "count": 1},
        {"type": "living_room", "count": 1},
    ]
    return RequirementsSpec.model_validate({
        "rooms": rooms,
        "plot": {"boundary": [v.model_dump() for v in boundary]},
        "facing": draw(st.sampled_from([f.value for f in Facing])),
    })


@settings(max_examples=200, deadline=None, derandomize=True)
@given(random_polygon_specs())
def test_property_polygon_engine_never_produces_broken_geometry(spec):
    """THE polygon-path gate, mirroring the rect path's: for every random
    straight-edge boundary (convex and L-shaped), the engine either returns a
    genuinely sound plan (real polygon overlap/containment/tiling checks, not
    validate()'s not-yet-polygon-aware bbox checks) or refuses with the
    structured does-not-fit error. Never broken geometry."""
    try:
        plan = generate_plan(spec)
    except DoesNotFitError:
        return  # honest refusal is a valid outcome for an undersized plot

    _assert_polygon_plan_is_sound(plan)
    assert len(plan.rooms) == _expected_room_count(spec)
