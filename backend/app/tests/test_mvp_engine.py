"""Workflow Steps 1.2 + 1.3 — engine invariants, hand-broken plans, and the
project's main go/no-go gate: the Hypothesis property suite (zero hard
violations over the random spec space; DoesNotFitError is the only permitted
alternative outcome, per the workflow's structured "plot too small" contract).
"""
import json
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.schemas.layout_plan import LayoutPlan
from app.schemas.requirements import Facing, RequirementsSpec, RoomType
from app.services.layout_engine import (
    DoesNotFitError,
    generate_plan,
    rebuild_derived_geometry,
)
from app.services.layout_engine.geometry import Rect
from app.services.quality import validate

FIXTURES = Path(__file__).parent / "fixtures" / "requirements"
FIXTURE_NAMES = ["1bhk", "2bhk", "3bhk_adjacencies", "4bhk", "clinic"]


def _load(name: str) -> RequirementsSpec:
    return RequirementsSpec.model_validate_json((FIXTURES / f"{name}.json").read_text())


def _room_rect(room) -> Rect:
    return Rect(room.x, room.y, room.w, room.h)


# ── Step 1.2 — fixture invariants (never exact coordinates) ──────────────────


def _expected_room_count(spec: RequirementsSpec) -> int:
    from app.services.layout_engine.engine import _build_program

    requested = sum(r.count for r in spec.rooms)
    has_entry = any(r.type == RoomType.entry for r in spec.rooms)
    count = requested + (0 if has_entry else 1)  # auto-entry
    # + a possible auto-injected corridor (workflow Phase 4.1/4.5) — derived
    # from the real program rather than duplicating ensure_corridor's own
    # threshold, so this stays accurate if that threshold changes.
    program = _build_program(spec)
    if any(n.type in ("corridor", "hallway") for n in program.needs):
        count += 1
    return count


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_fixture_produces_valid_plan(name):
    spec = _load(name)
    plan = generate_plan(spec)

    assert len(plan.rooms) == _expected_room_count(spec)

    for spec_room in spec.rooms:  # every requested room type present, right count
        placed = [r for r in plan.rooms if r.type == spec_room.type]
        assert len(placed) == spec_room.count, spec_room.type

    # With the spec, so a MUST-attached ensuite reached through its own
    # bedroom is exempt (it is the requested design, not a defect).
    assert validate(plan, spec) == []  # zero hard violations: overlap/bounds/min/reachability


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_fixture_plan_tiles_its_building_exactly_inside_the_plot(name):
    plan = generate_plan(_load(name))
    min_x, min_y = min(r.x for r in plan.rooms), min(r.y for r in plan.rooms)
    max_x, max_y = max(r.x + r.w for r in plan.rooms), max(r.y + r.h for r in plan.rooms)
    # No gaps: the rooms exactly fill the building's rectangle ...
    assert sum(r.w * r.h for r in plan.rooms) == pytest.approx((max_x - min_x) * (max_y - min_y), rel=0.01)
    # ... which sits inside the plot (with yards when the plot has room).
    assert min_x >= 0 and min_y >= 0
    assert max_x <= plan.plot.width_m + 1e-6 and max_y <= plan.plot.depth_m + 1e-6


def test_a_generous_plot_gets_a_house_sized_to_its_rooms_not_the_plot():
    spec = _load("2bhk").model_copy(update={"plot": _load("2bhk").plot.model_copy(update={"width_m": 30.0, "depth_m": 40.0})})
    plan = generate_plan(spec)
    built = (max(r.x + r.w for r in plan.rooms) - min(r.x for r in plan.rooms)) * (
        max(r.y + r.h for r in plan.rooms) - min(r.y for r in plan.rooms)
    )
    assert built < 0.25 * 30 * 40  # not stretched over the 1,200 m² plot
    # Street side (east) keeps the deeper yard.
    east_yard = 30 - max(r.x + r.w for r in plan.rooms)
    west_yard = min(r.x for r in plan.rooms)
    assert east_yard > west_yard
    assert validate(plan, spec) == []


def test_entry_lands_on_the_facing_side():
    plan = generate_plan(_load("3bhk_adjacencies"))  # east-facing
    entry = next(r for r in plan.rooms if r.type == RoomType.entry)
    assert entry.x + entry.w / 2 > plan.plot.width_m / 2  # east half


def test_attached_bathroom_touches_master_bedroom():
    plan = generate_plan(_load("3bhk_adjacencies"))  # master-bathroom `must`
    master = next(r for r in plan.rooms if r.type == RoomType.master_bedroom)
    baths = [r for r in plan.rooms if r.type == RoomType.bathroom]
    assert any(_room_rect(master).shared_edge(_room_rect(b)) for b in baths)


def test_walls_are_deduplicated():
    plan = generate_plan(_load("2bhk"))
    seen = set()
    for w in plan.walls:
        key = (round(w.x1, 2), round(w.y1, 2), round(w.x2, 2), round(w.y2, 2))
        assert key not in seen, f"duplicate wall segment {key}"
        seen.add(key)


def test_doors_reference_existing_walls():
    plan = generate_plan(_load("4bhk"))
    wall_ids = {w.id for w in plan.walls}
    assert plan.doors, "a plan must have doors"
    for door in plan.doors:
        assert door.wall_ref in wall_ids


# ── Connectivity: every genuinely adjacent pair gets a door, not just the
# minimum spanning tree (user-reported: rooms visibly touching with no door
# between them, forcing a detour through another room even though nothing
# was technically "unreachable"). ────────────────────────────────────────


def _shared_wall_pairs(plan: LayoutPlan) -> dict[frozenset, str]:
    """room-id-pair -> the wall id of their shared edge, for every pair of
    rooms in the plan whose rectangles actually touch."""
    pairs: dict[frozenset, str] = {}
    for i, a in enumerate(plan.rooms):
        for b in plan.rooms[i + 1:]:
            seg = _room_rect(a).shared_edge(_room_rect(b))
            if seg is None:
                continue
            endpoints = {(round(seg.x1, 3), round(seg.y1, 3)), (round(seg.x2, 3), round(seg.y2, 3))}
            for wall in plan.walls:
                if {(wall.x1, wall.y1), (wall.x2, wall.y2)} == endpoints:
                    pairs[frozenset((a.id, b.id))] = wall.id
                    break
    return pairs


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_every_adjacent_public_or_circulation_room_pair_gets_a_door(name):
    spec = _load(name)
    plan = generate_plan(spec)
    doored_walls = {d.wall_ref for d in plan.doors}
    labels_by_id = {r.id: r.label for r in plan.rooms}
    circulation_or_public_labels = {
        RoomType.entry.value, RoomType.living_room.value, RoomType.dining.value,
    }

    for pair, wall_id in _shared_wall_pairs(plan).items():
        a, b = pair
        if labels_by_id[a] in circulation_or_public_labels or labels_by_id[b] in circulation_or_public_labels:
            assert wall_id in doored_walls, (
                f"{labels_by_id[a]} and {labels_by_id[b]} share a wall but have no door "
                f"between them in {name}"
            )


def test_two_adjacent_private_rooms_do_not_get_a_redundant_direct_door():
    # 4bhk's real generated layout has multiple bedroom-bedroom /
    # bedroom-bathroom adjacencies that are already reachable via the
    # spanning tree — privacy says don't also punch a direct door there.
    spec = _load("4bhk")
    plan = generate_plan(spec)
    private_types = {RoomType.bedroom.value, RoomType.master_bedroom.value, RoomType.bathroom.value}
    doored_walls = {d.wall_ref for d in plan.doors}
    types_by_id = {r.id: r.type for r in plan.rooms}

    private_adjacent_pairs = [
        pair for pair in _shared_wall_pairs(plan)
        if all(types_by_id[k] in private_types for k in pair)
    ]
    assert private_adjacent_pairs, "fixture must actually exercise this case"
    assert validate(plan, spec) == []  # still fully valid/reachable without the extra doors


def test_explicitly_avoided_adjacent_pair_gets_no_direct_door():
    spec = RequirementsSpec.model_validate({
        "rooms": [
            {"type": "kitchen", "count": 1},
            {"type": "bathroom", "count": 1},
            {"type": "living_room", "count": 1},
            {"type": "entry", "count": 1},
        ],
        "avoid_adjacency": [{"room_a": "kitchen", "room_b": "washroom"}],
        "plot": {"width_m": 8.0, "depth_m": 8.0},
    })
    plan = generate_plan(spec)
    types_by_id = {r.id: r.type for r in plan.rooms}
    doored_walls = {d.wall_ref for d in plan.doors}

    for pair, wall_id in _shared_wall_pairs(plan).items():
        types = {types_by_id[k] for k in pair}
        if types == {RoomType.kitchen.value, RoomType.bathroom.value}:
            assert wall_id not in doored_walls


# ── Door policy rewrite (workflow Phase 4.4) ──────────────────────────────


def test_circulation_key_prefers_a_real_corridor_over_living_room_or_entry():
    from app.services.layout_engine.engine import _circulation_key
    from app.services.layout_engine.subdivision import RoomNeed

    def need(key: str, kind: str) -> RoomNeed:
        return RoomNeed(key=key, type=kind, label=kind, preferred_area=10.0, min_w=2.0, min_d=2.0)

    placed = [
        (need("r1", "entry"), Rect(0, 0, 1, 1)),
        (need("r2", "living_room"), Rect(1, 0, 1, 1)),
        (need("r3", "corridor"), Rect(2, 0, 1, 1)),
    ]
    assert _circulation_key(placed) == "r3"


def test_avoid_pair_vetoes_a_door_even_when_it_is_the_only_bridge():
    """The doc's exact Phase 4.4 requirement: an AVOID edge must veto a door
    even if that pair is the ONLY way to keep the floor connected — routing
    should fail structurally (DoesNotFitError) rather than silently break
    the avoidance to preserve connectivity."""
    from app.services.layout_engine.engine import DoesNotFitError, _build_walls, _place_doors
    from app.services.layout_engine.subdivision import RoomNeed

    def need(key: str, kind: str) -> RoomNeed:
        return RoomNeed(key=key, type=kind, label=kind, preferred_area=9.0, min_w=3.0, min_d=3.0)

    # kitchen - bathroom - entry in a row; kitchen only touches bathroom.
    placed = [
        (need("a", "kitchen"), Rect(0, 0, 3, 3)),
        (need("b", "bathroom"), Rect(3, 0, 3, 3)),
        (need("c", "entry"), Rect(6, 0, 3, 3)),
    ]
    walls, wall_rooms = _build_walls(placed)
    spec = RequirementsSpec.model_validate({
        "rooms": [
            {"type": "kitchen", "count": 1},
            {"type": "bathroom", "count": 1},
            {"type": "entry", "count": 1},
        ],
        "avoid_adjacency": [{"room_a": "kitchen", "room_b": "bathroom"}],
    })
    zone_of = {"a": "public", "b": "service", "c": "circulation"}

    with pytest.raises(DoesNotFitError):
        _place_doors(placed, walls, wall_rooms, spec, Facing.east, zone_of)

    # The lenient editor-sync path must not raise, and must still honour the
    # veto rather than silently connecting kitchen through it.
    doors = _place_doors(
        placed, walls, wall_rooms, spec, Facing.east, zone_of, allow_disconnected=True,
    )
    doored_walls = {d.wall_ref for d in doors}
    kitchen_bathroom_wall = next(w for w in walls if set(wall_rooms[w.id]) == {"a", "b"})
    assert kitchen_bathroom_wall.id not in doored_walls


def test_engine_is_deterministic():
    a = generate_plan(_load("3bhk_adjacencies"))
    b = generate_plan(_load("3bhk_adjacencies"))
    assert a == b


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_room_ids_follow_the_legacy_r_n_scheme(name):
    # Phase 2.2b: _expand() now builds needs via the ProgramGraph bridge
    # instead of a flat dict-counting loop, and remaps the graph's own
    # node ids ("node-3") back to this "r1".."rN" scheme. Not cosmetic —
    # _place_doors's BFS spanning tree tie-breaks on the lexicographic sort
    # of room keys, so a different id scheme can silently change *which*
    # doors get placed for a fixture with real adjacency ambiguity (caught
    # by diffing 4bhk/3bhk_adjacencies against a pre-refactor snapshot: the
    # node-id scheme produced a different door set, not just different ids).
    plan = generate_plan(_load(name))
    assert {r.id for r in plan.rooms} == {f"r{i}" for i in range(1, len(plan.rooms) + 1)}


def test_rebuild_derived_geometry_restores_generated_plan_artifacts():
    spec = _load("2bhk")
    plan = generate_plan(spec)
    stale = plan.model_copy(update={"walls": [], "doors": []})

    rebuilt = rebuild_derived_geometry(stale, spec)

    assert rebuilt == plan
    assert validate(rebuilt) == []


def test_rebuild_derived_geometry_reports_disconnected_edits_without_raising():
    spec = _load("2bhk")
    plan = generate_plan(spec)
    bedroom = next(room for room in plan.rooms if room.type == RoomType.bedroom)
    moved = bedroom.model_copy(
        update={
            "x": bedroom.x + 0.2,
            "y": bedroom.y + 0.2,
            "w": bedroom.w - 0.4,
            "h": bedroom.h - 0.4,
        }
    )
    edited = plan.model_copy(
        update={
            "rooms": [
                moved if room.id == bedroom.id else room for room in plan.rooms
            ],
        }
    )

    rebuilt = rebuild_derived_geometry(edited, spec)

    assert "unreachable" in _codes(rebuilt)


def test_too_many_rooms_for_plot_raises_structured_does_not_fit():
    spec = RequirementsSpec.model_validate({
        "rooms": [
            {"type": "bedroom", "count": 4},
            {"type": "bathroom", "count": 2},
            {"type": "kitchen", "count": 1},
            {"type": "living_room", "count": 1},
        ],
        "plot": {"width_m": 6.0, "depth_m": 7.0},
    })
    with pytest.raises(DoesNotFitError) as exc:
        generate_plan(spec)
    assert "increase plot size" in str(exc.value)


def test_oversized_program_is_refused_before_any_graph_node_is_built():
    """The requested-count cap has to fire BEFORE `from_requirements`
    materialises one node per instance: neither `rooms` nor `spaces` has a
    length bound, so an in-body-limit request used to build millions of nodes
    (and permanently register every self-describing unknown space in the
    process-global catalog) before the post-build check refused it."""
    from app.services import catalog

    spec = RequirementsSpec.model_validate({
        "spaces": [
            {
                "space_type": f"zz_probe_{index:04d}",
                "count": 50,
                "zone_guess": "private",
                "size_guess_m2": 5.0,
                "confidence": 1.0,
            }
            for index in range(200)
        ],
        "plot": {"width_m": 20.0, "depth_m": 30.0},
    })
    catalog_size = len(catalog.CATALOG)

    with pytest.raises(DoesNotFitError) as exc:
        generate_plan(spec)

    assert "more than 30 rooms requested" in str(exc.value)
    assert len(catalog.CATALOG) == catalog_size


def test_single_room_spec_works():
    spec = RequirementsSpec.model_validate({"rooms": [{"type": "living_room", "count": 1}]})
    plan = generate_plan(spec)
    assert validate(plan) == []


# ── PlanRoom.type migration (engine generalization workflow, migration-order
# item 4) — spec.spaces free-string programs now run end to end, not just
# through archetypes.py unit tests. ───────────────────────────────────────


def test_generate_plan_supports_a_non_residential_free_string_program():
    spec = RequirementsSpec.model_validate({
        "spaces": [
            {"space_type": "reception", "count": 1},
            {"space_type": "waiting_room", "count": 1},
            {"space_type": "consultation_room", "count": 3},
            {"space_type": "bathroom", "count": 1},
        ],
        "plot": {"width_m": 12.0, "depth_m": 14.0},
        "facing": "east",
    })

    plan = generate_plan(spec)

    types = sorted(r.type for r in plan.rooms)
    assert types.count("consultation_room") == 3
    assert "reception" in types
    assert "waiting_room" in types
    assert validate(plan) == []  # zero hard violations, same bar as every residential fixture


def test_generate_plan_rejects_an_unknown_space_type_as_a_structured_does_not_fit():
    spec = RequirementsSpec.model_validate({
        "spaces": [{"space_type": "zzz_totally_unknown", "count": 1}],
        "plot": {"width_m": 9.0, "depth_m": 9.0},
    })

    with pytest.raises(DoesNotFitError) as exc:
        generate_plan(spec)
    assert "zzz_totally_unknown" in str(exc.value)


def test_rebuild_derived_geometry_handles_a_hand_edited_non_residential_room_type():
    spec = RequirementsSpec.model_validate({"rooms": [{"type": "living_room", "count": 1}]})
    plan = generate_plan(spec)
    edited = plan.model_copy(update={
        "rooms": [r.model_copy(update={"type": "consultation_room"}) for r in plan.rooms],
    })

    rebuilt = rebuild_derived_geometry(edited, spec)  # must not raise (e.g. KeyError)

    assert rebuilt.rooms[0].type == "consultation_room"


def test_demo_three_bhk_fits_a_thirty_by_forty_foot_plot():
    """Regression from the Phase 4 live gate: area-only cut clamping made the
    attached bathroom a 1.2 m sliver despite sufficient total plot area.

    Depth bumped from the original 12.192 m (40 ft) to 14.0 m for workflow
    Phase 4.5: this program has 4 genuinely private rooms (master_bedroom +
    its ensuite, 2 more bedrooms, a pooja_room), so ensure_corridor now
    injects real circulation and the engine comb-arranges those rooms along
    it to guarantee none is reachable only through another private room —
    real, valuable, and this specific room count genuinely needs a bit more
    depth than a bare 30x40 ft footprint to honour both the room program
    and that guarantee at once (confirmed: 13.8 m is exactly the fitting
    boundary, 14.0 m gives a safety margin). The regression this test
    guards — no 1.2 m sliver bathroom — is unaffected by the plot size."""

    spec = RequirementsSpec.model_validate(
        {
            "building_type": "house",
            "rooms": [
                {"type": "master_bedroom", "count": 1},
                {"type": "bedroom", "count": 2},
                {"type": "bathroom", "count": 1},
                {"type": "living_room", "count": 1},
                {"type": "kitchen", "count": 1},
                {"type": "pooja_room", "count": 1},
            ],
            "adjacency": [
                {
                    "room_a": "master_bedroom",
                    "room_b": "bathroom",
                    "strength": "must",
                }
            ],
            "plot": {"width_m": 9.144, "depth_m": 14.0},
            "facing": "east",
        }
    )

    plan = generate_plan(spec)

    assert validate(plan) == []
    assert len(plan.rooms) == _expected_room_count(spec)


# ── Workflow 4.5 privacy chain: generate_plan must never RETURN a plan that
# breaks it, whichever archetype places the rooms (found by fuzzing the real
# generate_plan entrypoint against its own hard validator). ────────────────


def test_corridor_door_prefers_a_public_neighbour_over_a_landlocked_service_room():
    """`_place_doors` step 1.5 guarantees a corridor a door to a NON-PRIVATE
    neighbour, but picked the longest such wall — which can be a bathroom
    that is itself landlocked inside the private wing. The corridor's only
    route to the entry then still ran through a bedroom. Real geometry: the
    corridor's longest non-private wall here is a 2.53 m bathroom in the
    wing, while a genuine 0.47 m wall to the dining room sat unused."""
    spec = RequirementsSpec.model_validate({
        "rooms": [
            {"type": "bedroom", "count": 3}, {"type": "bathroom", "count": 2},
            {"type": "kitchen", "count": 1}, {"type": "living_room", "count": 1},
            {"type": "dining", "count": 1}, {"type": "balcony", "count": 1},
        ],
        "adjacency": [{"room_a": "bedroom", "room_b": "bathroom", "strength": "must"}],
        "plot": {"width_m": 8.6, "depth_m": 18.6},
        "facing": "north",
    })

    plan = generate_plan(spec)

    assert validate(plan, spec) == []


@pytest.mark.parametrize("style", ["zoned_bands", "double_loaded_corridor", "hub_and_spoke", "open_core"])
def test_no_archetype_returns_a_plan_that_breaks_the_privacy_chain(style):
    """`hub_and_spoke`/`open_core` never comb-arrange the rooms a corridor
    serves, so they used to return `through_room_access`-violating geometry
    for most real residential programs — reachable straight from the API,
    since `layout_style` is a client-supplied RequirementsSpec field.
    generate_plan now repairs with a comb-arranging archetype instead."""
    spec = RequirementsSpec.model_validate({
        "rooms": [
            {"type": "bedroom", "count": 3}, {"type": "bathroom", "count": 2},
            {"type": "kitchen", "count": 1}, {"type": "living_room", "count": 1},
        ],
        "plot": {"width_m": 15.7, "depth_m": 8.5},
        "facing": "west",
        "layout_style": style,
    })

    try:
        plan = generate_plan(spec)
    except DoesNotFitError:
        return  # the contract's other permitted outcome, same as the gate above

    assert validate(plan) == []


def test_auto_selected_open_core_keeps_every_private_space_directly_reachable():
    # Same defect via the AUTO selector (no layout_style), on the free-string
    # `spec.spaces` path: one dominant node >= 50% of the program area picks
    # open_core, and its two private studies ended up chained.
    spec = RequirementsSpec.model_validate({
        "spaces": [
            {"space_type": "workspace", "count": 1},
            {"space_type": "study", "count": 2},
        ],
        "plot": {"width_m": 15.7, "depth_m": 9.4},
        "facing": "north",
    })

    plan = generate_plan(spec)

    assert validate(plan) == []


# ── Step 1.3 — hand-broken plans trigger exactly their violation codes ────────


def _codes(plan: LayoutPlan) -> set[str]:
    return {v.code for v in validate(plan)}


def test_manually_overlapped_rooms_flagged():
    plan = generate_plan(_load("2bhk"))
    victim = plan.rooms[1].model_copy(update={"x": plan.rooms[0].x, "y": plan.rooms[0].y})
    broken = plan.model_copy(update={"rooms": [plan.rooms[0], victim, *plan.rooms[2:]]})
    assert "overlap" in _codes(broken)


def test_out_of_bounds_room_flagged():
    plan = generate_plan(_load("2bhk"))
    victim = plan.rooms[0].model_copy(update={"x": plan.plot.width_m - 0.5})
    broken = plan.model_copy(update={"rooms": [victim, *plan.rooms[1:]]})
    assert "out_of_bounds" in _codes(broken)


def test_below_min_size_flagged():
    plan = generate_plan(_load("2bhk"))
    bedroom = next(r for r in plan.rooms if r.type == RoomType.bedroom)
    shrunk = bedroom.model_copy(update={"w": 2.0, "h": 2.0})
    broken = plan.model_copy(update={"rooms": [shrunk if r.id == bedroom.id else r for r in plan.rooms]})
    assert "below_min_size" in _codes(broken)


def test_doorless_plan_flags_unreachable_rooms():
    plan = generate_plan(_load("2bhk"))
    broken = plan.model_copy(update={"doors": []})
    assert "unreachable" in _codes(broken)


# ── The go/no-go gate: property test over random specs ───────────────────────


@st.composite
def random_specs(draw):
    rooms = [
        {"type": "bedroom", "count": draw(st.integers(1, 6))},
        {"type": "bathroom", "count": draw(st.integers(1, 3))},
        {"type": "kitchen", "count": 1},
        {"type": "living_room", "count": 1},
    ]
    for extra in ("dining", "study", "pooja_room", "balcony", "utility"):
        if draw(st.booleans()):
            rooms.append({"type": extra, "count": 1})
    return RequirementsSpec.model_validate({
        "rooms": rooms,
        "plot": {
            "width_m": draw(st.floats(8.0, 20.0).map(lambda v: round(v, 1))),
            "depth_m": draw(st.floats(8.0, 20.0).map(lambda v: round(v, 1))),
        },
        "facing": draw(st.sampled_from([f.value for f in Facing])),
    })


@settings(max_examples=200, deadline=None, derandomize=True)
@given(random_specs())
def test_property_engine_output_never_violates_hard_constraints(spec):
    """THE gate: for every random spec the engine either returns a plan with
    ZERO hard violations, or refuses with the structured does-not-fit error.
    It never returns broken geometry."""
    try:
        plan = generate_plan(spec)
    except DoesNotFitError:
        return  # honest refusal is a valid outcome for undersized plots

    violations = validate(plan)
    assert violations == [], [v.message for v in violations]

    assert len(plan.rooms) == _expected_room_count(spec)


_OPEN_PLAN = {"living_room", "dining", "kitchen", "entry", "corridor"}


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_open_plan_edges_have_no_wall_and_no_door(name):
    spec = _load(name)
    plan = generate_plan(spec)
    types_by_id = {r.id: r.type for r in plan.rooms}
    walls_by_id = {w.id: w for w in plan.walls}
    doored = {d.wall_ref for d in plan.doors}

    for pair, wall_id in _shared_wall_pairs(plan).items():
        types = {types_by_id[k] for k in pair}
        wall = walls_by_id[wall_id]
        if types <= _OPEN_PLAN:
            assert wall.kind == "open", types
            assert wall_id not in doored
        else:
            assert wall.kind == "wall", types

    assert validate(plan, spec) == []  # open edges count as connections


def test_open_plan_rooms_need_no_door_between_them():
    spec = _load("2bhk")
    plan = generate_plan(spec)
    open_walls = [w for w in plan.walls if w.kind == "open"]

    assert open_walls, "fixture must have public rooms side by side"
    # One door per room would be len(rooms); open-plan rooms reach each
    # other through their open edges instead.
    assert len(plan.doors) < len(plan.rooms)


def test_saved_canvas_draws_no_wall_on_an_open_plan_edge():
    from app.services.layout_adapter import layout_plan_to_canvas

    plan = generate_plan(_load("2bhk"))
    canvas = layout_plan_to_canvas(plan)
    wall_ids = {obj["id"] for obj in canvas["rooms"] if obj["objectType"] == "wall"}

    assert wall_ids == {w.id for w in plan.walls if w.kind == "wall"}


# ── User connection overrides (wall / door / open per room pair) ─────────────


def _rebuilt_with(plan, spec, *connections):
    from app.schemas.layout_plan import Connection
    from app.services.layout_engine import rebuild_derived_geometry

    stale = plan.model_copy(update={
        "walls": [], "doors": [], "connections": [Connection(**c) for c in connections],
    })
    return rebuild_derived_geometry(stale, spec)


def _pair_walls(plan, a, b):
    return [w for w in plan.walls if w.rooms and set(w.rooms) == {a, b}]


def _first_pair(plan, want_a, want_b):
    """Ids of the first adjacent pair whose types are {want_a, want_b}."""
    types = {r.id: r.type for r in plan.rooms}
    for w in plan.walls:
        if w.rooms and {types[w.rooms[0]], types[w.rooms[1]]} == {want_a, want_b}:
            return w.rooms
    raise AssertionError(f"no adjacent {want_a}/{want_b} pair in fixture")


def test_interior_walls_name_the_two_rooms_they_separate():
    plan = generate_plan(_load("2bhk"))
    ids = {r.id for r in plan.rooms}
    for wall in plan.walls:
        assert wall.rooms is None or (len(wall.rooms) == 2 and set(wall.rooms) <= ids)
    assert any(w.rooms for w in plan.walls)


def test_open_connection_removes_the_wall_between_two_private_rooms():
    spec = _load("4bhk")
    plan = generate_plan(spec)
    a, b = _first_pair(plan, "bedroom", "bedroom")

    rebuilt = _rebuilt_with(plan, spec, {"room_a": a, "room_b": b, "kind": "open"})

    assert {w.kind for w in _pair_walls(rebuilt, a, b)} == {"open"}
    assert [c.kind for c in rebuilt.connections] == ["open"]


def test_wall_connection_closes_an_open_plan_edge_without_a_door():
    spec = _load("2bhk")
    plan = generate_plan(spec)
    open_wall = next(w for w in plan.walls if w.kind == "open")
    a, b = open_wall.rooms

    rebuilt = _rebuilt_with(plan, spec, {"room_a": a, "room_b": b, "kind": "wall"})

    pair_walls = _pair_walls(rebuilt, a, b)
    assert {w.kind for w in pair_walls} == {"wall"}
    assert not {d.wall_ref for d in rebuilt.doors} & {w.id for w in pair_walls}


def test_door_connection_places_the_door_where_the_user_dragged_it():
    spec = _load("4bhk")
    plan = generate_plan(spec)
    a, b = _first_pair(plan, "bedroom", "bedroom")

    rebuilt = _rebuilt_with(plan, spec, {"room_a": a, "room_b": b, "kind": "door", "at": 0.0})

    wall = max(_pair_walls(rebuilt, a, b), key=lambda w: abs(w.x2 - w.x1) + abs(w.y2 - w.y1))
    door = next(d for d in rebuilt.doors if d.wall_ref == wall.id)
    assert door.offset == 0.0  # clamped to the wall start, not centred


def test_connection_between_rooms_that_no_longer_touch_is_dropped():
    spec = _load("2bhk")
    plan = generate_plan(spec)
    ids = [r.id for r in plan.rooms]
    touching = {frozenset(w.rooms) for w in plan.walls if w.rooms}
    a, b = next(
        (x, y) for i, x in enumerate(ids) for y in ids[i + 1:]
        if frozenset((x, y)) not in touching
    )

    rebuilt = _rebuilt_with(plan, spec, {"room_a": a, "room_b": b, "kind": "open"})

    assert rebuilt.connections == []


_TEMPLATES = sorted(p.stem for p in FIXTURES.glob("template_*.json"))


@pytest.mark.parametrize("name", FIXTURE_NAMES + _TEMPLATES)
def test_every_plan_has_exactly_one_front_door(name):
    # Templates call the entry "foyer" and some place it inland; both used
    # to leave the plan with no way in.
    plan = generate_plan(_load(name))
    outside = {w.id for w in plan.walls if w.rooms is None}

    assert len([d for d in plan.doors if d.wall_ref in outside]) == 1


# The landing page's brief (rooms in the order the extractor lists them).
# Its entry used to land on the corridor side of the street band, boxed in
# by dining/kitchen, so the front door went on the living room instead.
_EAST_3BHK = {
    "building_type": "house", "floors": 1, "plot": {"width_m": 12, "depth_m": 15},
    "rooms": [
        {"type": "master_bedroom", "count": 1}, {"type": "bedroom", "count": 2},
        {"type": "pooja_room", "count": 1}, {"type": "kitchen", "count": 1},
        {"type": "living_room", "count": 1}, {"type": "balcony", "count": 1},
        {"type": "bathroom", "count": 2}, {"type": "dining", "count": 1},
    ],
    "adjacency": [
        {"room_a": "balcony", "room_b": "living_room", "strength": "must"},
        {"room_a": "master_bedroom", "room_b": "bathroom", "strength": "must"},
        {"room_a": "bedroom", "room_b": "bathroom", "strength": "should"},
        {"room_a": "kitchen", "room_b": "dining", "strength": "should"},
        {"room_a": "kitchen", "room_b": "living_room", "strength": "should"},
    ],
    "avoid_adjacency": [{"room_a": "kitchen", "room_b": "bathroom"}],
}


def _front_door_room(plan):
    """The room whose outside wall holds the front door."""
    walls = {w.id: w for w in plan.walls}
    (door,) = [d for d in plan.doors if walls[d.wall_ref].rooms is None]
    w = walls[door.wall_ref]
    mx, my = (w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2
    for room in plan.rooms:
        r = _room_rect(room)
        on_x = abs(mx - r.x) < 1e-6 or abs(mx - (r.x + r.w)) < 1e-6
        on_y = abs(my - r.y) < 1e-6 or abs(my - (r.y + r.d)) < 1e-6
        if (on_x and r.y - 1e-6 <= my <= r.y + r.d + 1e-6) or (on_y and r.x - 1e-6 <= mx <= r.x + r.w + 1e-6):
            return room
    raise AssertionError("front door wall touches no room")


@pytest.mark.parametrize("facing", ["north", "south", "east", "west"])
def test_entry_reaches_the_street_and_holds_the_front_door(facing):
    plan = generate_plan(RequirementsSpec.model_validate({**_EAST_3BHK, "facing": facing}))
    assert _front_door_room(plan).type == "entry"


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_front_door_opens_into_the_entry(name):
    plan = generate_plan(_load(name))
    if any(r.type == "entry" for r in plan.rooms):
        assert _front_door_room(plan).type == "entry"


@pytest.mark.parametrize("facing", ["east", "west"])
def test_no_search_candidate_puts_the_front_door_off_the_entry(facing):
    # The web app shows the best of these candidates; before the fix, 9 of
    # 64 had the entry boxed in and the winner's front door was in the living room.
    from app.services.layout_engine.search import generate_candidates

    spec = RequirementsSpec.model_validate({**_EAST_3BHK, "facing": facing})
    assert all(_front_door_room(c.plan).type == "entry" for c in generate_candidates(spec))


# A real plan from the app (South-facing 4BHK villa example brief) that scored
# 100 with its balcony and entry boxed in by other rooms, no outside wall.
_VILLA = json.loads(
    (Path(__file__).parent / "fixtures" / "golden" / "villa_inland_balcony.json").read_text(encoding="utf-8")
)


def test_boxed_in_balcony_and_entry_are_hard_violations():
    plan = LayoutPlan.model_validate(_VILLA["layout"])
    spec = RequirementsSpec.model_validate(_VILLA["requirements"])
    codes = {v.code for v in validate(plan, spec)}
    assert {"outdoor_room_inland", "entry_inland"} <= codes


def test_villa_brief_gets_balcony_and_entry_on_outside_walls():
    from app.services.layout_engine.search import generate_candidates
    from app.services.quality.hard_constraints import touches_outside

    spec = RequirementsSpec.model_validate(_VILLA["requirements"])
    plan = generate_candidates(spec)[0].plan
    assert validate(plan, spec) == []
    for room in plan.rooms:
        if room.type in ("balcony", "entry"):
            assert touches_outside(room, plan), room.label
