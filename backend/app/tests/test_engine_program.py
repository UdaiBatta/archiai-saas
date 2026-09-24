"""Phase 2.1/2.2a — EngineProgram bridge + RequirementsSpec adapter. Purely
additive: engine.py does not consume either yet (Phase 2.2b), so these tests
only pin the bridge and adapter themselves."""
import json
from pathlib import Path
from typing import NamedTuple

import pytest

from app.schemas.requirements import RequirementsSpec, RoomRequest, RoomType, SpaceRequest
from app.services import catalog
from app.services.layout_engine.subdivision import RoomNeed
from app.services.planning import Edge, Node, ProgramGraph, from_requirements, to_engine_program
from app.services.planning.program_completion import ensure_corridor, ensure_entry
from app.services.planning.program_graph import (
    _apply_type_semantics,
    _classify_node_type,
    _classify_zone,
)


class RoomSpec(NamedTuple):
    label: str
    room_type: str
    w: float
    h: float
    d: float


def from_room_specs(specs: list[RoomSpec]) -> ProgramGraph:
    graph = ProgramGraph()
    for spec in specs:
        graph.add_node(_apply_type_semantics(Node(
            type=_classify_node_type(spec.room_type),
            space_type=spec.room_type,
            label=spec.label,
            zone=_classify_zone(spec.room_type),
            width=spec.w,
            depth=spec.d,
            height=spec.h,
            target_area_sqm=round(spec.w * spec.d, 2),
        )))
    return graph

FIXTURES = Path(__file__).parent / "fixtures" / "requirements"


def test_needs_are_room_need_instances_keyed_by_node_id():
    graph = from_room_specs([
        RoomSpec(label="Bedroom 1", room_type="bedroom", w=4, h=3, d=4),
    ])
    program = to_engine_program(graph)
    assert len(program.needs) == 1
    need = program.needs[0]
    assert isinstance(need, RoomNeed)
    assert need.key == graph.nodes[0].id
    assert need.type == "bedroom"


# ── Sizing precedence: explicit > size_hint x multiplier > catalog > derived ─


def test_explicit_target_area_wins_over_everything():
    node = Node(id="a", space_type="bedroom", target_area_sqm=20.0, size_hint="small")
    graph = ProgramGraph(nodes=[node])
    program = to_engine_program(graph)
    assert program.needs[0].preferred_area == 20.0


def test_size_hint_scales_the_catalog_default_when_no_explicit_area():
    from app.services.catalog import get as catalog_get

    catalog_default = catalog_get("bedroom").preferred_area_m2
    node = Node(id="a", space_type="bedroom", size_hint="large")
    graph = ProgramGraph(nodes=[node])
    program = to_engine_program(graph)
    assert program.needs[0].preferred_area == round(catalog_default * 1.35, 2)


def test_catalog_default_used_when_no_explicit_area_and_no_size_hint():
    from app.services.catalog import get as catalog_get

    node = Node(id="a", space_type="bedroom")
    graph = ProgramGraph(nodes=[node])
    program = to_engine_program(graph)
    assert program.needs[0].preferred_area == catalog_get("bedroom").preferred_area_m2


def test_unknown_space_type_falls_back_to_width_times_depth():
    node = Node(id="a", space_type="recording_studio", width=5.0, depth=4.0)
    graph = ProgramGraph(nodes=[node])
    program = to_engine_program(graph)
    assert program.needs[0].preferred_area == 20.0
    assert program.needs[0].min_w == 1.2
    assert program.needs[0].min_d == 1.2


def test_hard_minima_never_scale_with_size_hint():
    # bathroom: catalog min_w/min_d = 1.5 x 2.1 (from ROOM_SIZING) — a "large"
    # hint must not inflate the hard minimum, only the preferred area.
    node = Node(id="a", space_type="bathroom", size_hint="large")
    graph = ProgramGraph(nodes=[node])
    program = to_engine_program(graph)
    assert (program.needs[0].min_w, program.needs[0].min_d) == (1.5, 2.1)


def test_explicit_node_minima_override_the_catalog():
    node = Node(id="a", space_type="bedroom", min_width_m=5.0, min_depth_m=6.0)
    graph = ProgramGraph(nodes=[node])
    program = to_engine_program(graph)
    assert (program.needs[0].min_w, program.needs[0].min_d) == (5.0, 6.0)


# ── Id-level (not type-level) adjacency ──────────────────────────────────────


def test_must_avoid_are_id_level_so_each_same_type_instance_keeps_its_own_pairs():
    bed1 = Node(id="bed1", space_type="bedroom")
    bed2 = Node(id="bed2", space_type="bedroom")
    bath = Node(id="bath1", space_type="bathroom")
    graph = ProgramGraph(nodes=[bed1, bed2, bath], edges=[
        Edge(node_a="bed1", node_b="bath1", relation_type="adjacent", strength="MUST"),
        Edge(node_a="bed2", node_b="bath1", relation_type="adjacent", strength="AVOID"),
    ])
    program = to_engine_program(graph)
    assert ("bed1", "bath1") in program.must_adjacent
    assert ("bed2", "bath1") not in program.must_adjacent
    assert ("bed2", "bath1") in program.avoid
    assert ("bed1", "bath1") not in program.avoid


def test_should_strength_buckets_separately_from_must():
    graph = ProgramGraph(nodes=[Node(id="a"), Node(id="b")], edges=[
        Edge(node_a="a", node_b="b", relation_type="adjacent", strength="SHOULD"),
    ])
    program = to_engine_program(graph)
    assert program.should_adjacent == [("a", "b")]
    assert program.must_adjacent == []


def test_separated_relation_type_is_an_avoid_regardless_of_strength():
    graph = ProgramGraph(nodes=[Node(id="a"), Node(id="b")], edges=[
        Edge(node_a="a", node_b="b", relation_type="separated", strength="MUST"),
    ])
    program = to_engine_program(graph)
    assert program.avoid == [("a", "b")]
    assert program.must_adjacent == []


# ── zone_of / floor_of / circulation_nodes / entry_node ──────────────────────


def test_zone_of_and_floor_of_cover_every_buildable_node():
    graph = from_room_specs([
        RoomSpec(label="Bedroom", room_type="bedroom", w=4, h=3, d=4),
        RoomSpec(label="Corridor", room_type="corridor", w=6, h=3, d=1.5),
    ])
    program = to_engine_program(graph)
    ids = {n.id for n in graph.nodes}
    assert set(program.zone_of) == ids
    assert set(program.floor_of) == ids


def test_floor_of_resolves_from_floor_preference():
    node = Node(id="a", space_type="bedroom", floor_preference="upper")
    graph = ProgramGraph(nodes=[node])
    program = to_engine_program(graph)
    assert program.floor_of["a"] == 1


def test_circulation_nodes_are_the_buildable_circulation_typed_nodes():
    graph = from_room_specs([
        RoomSpec(label="Bedroom", room_type="bedroom", w=4, h=3, d=4),
        RoomSpec(label="Corridor", room_type="corridor", w=6, h=3, d=1.5),
    ])
    program = to_engine_program(graph)
    corridor_id = graph.first_of_space_type("corridor").id
    assert program.circulation_nodes == [corridor_id]


def test_entry_node_prefers_entry_type_over_other_circulation_types():
    graph = from_room_specs([
        RoomSpec(label="Lobby", room_type="lobby", w=4, h=3, d=4),
        RoomSpec(label="Entry", room_type="entry", w=2, h=3, d=2),
    ])
    program = to_engine_program(graph)
    entry_id = graph.first_of_space_type("entry").id
    assert program.entry_node == entry_id


def test_entry_node_is_none_when_no_entry_like_node_exists():
    graph = from_room_specs([RoomSpec(label="Bedroom", room_type="bedroom", w=4, h=3, d=4)])
    program = to_engine_program(graph)
    assert program.entry_node is None


def test_buildable_nodes_only_openings_and_structural_excluded():
    graph = ProgramGraph(nodes=[
        Node(id="a", type="space", space_type="bedroom"),
        Node(id="b", type="opening", space_type="window"),
        Node(id="c", type="structural", space_type="column"),
    ])
    program = to_engine_program(graph)
    assert [n.key for n in program.needs] == ["a"]


# ── from_requirements(spec) -> ProgramGraph (Phase 2.2a) ─────────────────────


def _load_fixture(name: str) -> RequirementsSpec:
    raw = json.loads((FIXTURES / f"{name}.json").read_text())
    return RequirementsSpec.model_validate(raw)


def test_from_requirements_uses_rooms_when_spaces_is_empty():
    spec = RequirementsSpec(rooms=[
        RoomRequest(type=RoomType.bedroom, count=2),
        RoomRequest(type=RoomType.bathroom, count=1),
    ])
    graph = from_requirements(spec)
    assert len(graph.buildable_nodes()) == 3
    assert len(graph.nodes_of_space_type("bedroom")) == 2
    assert len(graph.nodes_of_space_type("bathroom")) == 1


def test_from_requirements_prefers_spaces_when_populated():
    spec = RequirementsSpec(
        rooms=[RoomRequest(type=RoomType.bedroom, count=2)],
        spaces=[SpaceRequest(space_type="consultation_room", count=3)],
    )
    graph = from_requirements(spec)
    assert len(graph.buildable_nodes()) == 3
    assert len(graph.nodes_of_space_type("consultation_room")) == 3
    assert graph.nodes_of_space_type("bedroom") == []


def test_from_requirements_rejects_an_unknown_space_type_eagerly():
    # The real input boundary (PlanRoom.type migration, engine generalization
    # workflow migration-order item 4): fail fast here with the catalog's
    # nearest-match suggestion, rather than silently falling back to a
    # made-up default size deep inside to_engine_program.
    spec = RequirementsSpec(spaces=[SpaceRequest(space_type="zzz_totally_unknown", count=1)])
    with pytest.raises(catalog.UnknownSpaceType):
        from_requirements(spec)


def test_from_requirements_registers_self_describing_unknown_space():
    key = "voiceover_booth"
    spec = RequirementsSpec(spaces=[SpaceRequest(
        space_type=key,
        count=1,
        zone_guess="private",
        size_guess_m2=12,
        confidence=0.95,
    )])
    try:
        graph = from_requirements(spec)
        node = graph.nodes_of_space_type(key)[0]
        assert node.zone == "private"
        assert node.target_area_sqm is None
        assert catalog.get(key).preferred_area_m2 == 12
    finally:
        catalog.CATALOG.pop(key, None)


def test_from_requirements_matches_free_string_constraint_endpoints():
    spec = RequirementsSpec.model_validate({
        "spaces": [
            {"space_type": "consultation_room", "count": 1},
            {"space_type": "waiting_room", "count": 1},
        ],
        "adjacency": [{
            "room_a": "consultation_room",
            "room_b": "waiting_room",
            "strength": "must",
        }],
    })

    graph = from_requirements(spec)

    assert len(graph.edges) == 1
    assert graph.edges[0].strength == "MUST"


def test_from_requirements_does_not_auto_inject_entry():
    # Contrasts with engine._expand()'s own auto-entry hack — this adapter
    # is a faithful structural translation only; injection stays
    # program_completion.ensure_entry's job (Phase 2.2b).
    spec = RequirementsSpec(rooms=[RoomRequest(type=RoomType.bedroom, count=1)])
    graph = from_requirements(spec)
    assert graph.nodes_of_space_type("entry") == []
    assert graph.nodes_of_space_type("foyer") == []
    assert len(graph.buildable_nodes()) == 1


def test_rooms_sourced_nodes_use_the_raw_room_type_value_not_the_catalog_key():
    # engine.py's own zoning split does RoomType(need.type) against
    # PUBLIC_ROOM_TYPES/PRIVATE_ROOM_TYPES (mvp_defaults.py) — that only
    # accepts real enum strings, so spec.rooms-sourced nodes must carry the
    # raw value ("dining", not "dining_room") for engine.py to consume them.
    spec = RequirementsSpec(rooms=[RoomRequest(type=RoomType.dining, count=1)])
    graph = from_requirements(spec)
    assert graph.nodes_of_space_type("dining") != []
    assert graph.nodes_of_space_type("dining_room") == []
    assert RoomType(graph.nodes_of_space_type("dining")[0].space_type) == RoomType.dining


def test_must_adjacency_resolves_on_the_raw_entry_value():
    # clinic fixture: entry~living_room MUST. spec.rooms-sourced nodes use
    # the raw "entry" value directly (see the test above) — the edge must
    # land on that node.
    spec = _load_fixture("clinic")
    graph = from_requirements(spec)
    entry = graph.first_of_space_type("entry")
    living_room = graph.first_of_space_type("living_room")
    assert entry is not None and living_room is not None
    matching = [
        e for e in graph.edges
        if e.strength == "MUST" and {e.node_a, e.node_b} == {entry.id, living_room.id}
    ]
    assert len(matching) == 1


def test_avoid_adjacency_is_id_level_for_every_multi_instance_room():
    # 3bhk_adjacencies fixture: pooja_room~bathroom AVOID, with 2 bathrooms.
    # Both bathroom instances must get their own AVOID edge to pooja_room —
    # the exact id-level fix Packet 7.2's benchmark audit called for.
    spec = _load_fixture("3bhk_adjacencies")
    graph = from_requirements(spec)
    pooja = graph.first_of_space_type("pooja_room")
    bathrooms = graph.nodes_of_space_type("bathroom")
    assert len(bathrooms) == 2
    avoid_pairs = {
        frozenset((e.node_a, e.node_b))
        for e in graph.edges
        if e.strength == "AVOID"
    }
    for bathroom in bathrooms:
        assert frozenset((pooja.id, bathroom.id)) in avoid_pairs


def test_from_requirements_round_trips_into_engine_program():
    spec = _load_fixture("3bhk_adjacencies")
    graph = from_requirements(spec)
    program = to_engine_program(graph)
    total_rooms = sum(r.count for r in spec.rooms)
    assert len(program.needs) == total_rooms
    assert len(program.avoid) == 4  # 2 bathrooms x (pooja + kitchen)
    assert len(program.must_adjacent) == 2  # master_bedroom x 2 bathrooms


# ── program_completion.ensure_entry (Phase 2.2b) ─────────────────────────────


def test_ensure_entry_injects_a_single_entry_node_matching_room_sizing():
    from app.config.mvp_defaults import ROOM_SIZING

    spec = RequirementsSpec(rooms=[RoomRequest(type=RoomType.bedroom, count=1)])
    graph = from_requirements(spec)
    graph = ensure_entry(graph)
    entries = graph.nodes_of_space_type("entry")
    assert len(entries) == 1
    sizing = ROOM_SIZING[RoomType.entry]
    assert entries[0].target_area_sqm == sizing.preferred_area_m2
    assert entries[0].min_width_m == sizing.min_w
    assert entries[0].min_depth_m == sizing.min_d


def test_ensure_entry_is_idempotent():
    spec = RequirementsSpec(rooms=[RoomRequest(type=RoomType.bedroom, count=1)])
    graph = ensure_entry(from_requirements(spec))
    graph = ensure_entry(graph)
    assert len(graph.nodes_of_space_type("entry")) == 1


def test_ensure_entry_noop_when_program_already_has_one():
    spec = RequirementsSpec(rooms=[
        RoomRequest(type=RoomType.entry, count=1),
        RoomRequest(type=RoomType.bedroom, count=1),
    ])
    graph = from_requirements(spec)
    graph = ensure_entry(graph)
    assert len(graph.nodes_of_space_type("entry")) == 1
    assert len(graph.buildable_nodes()) == 2


# ── program_completion.ensure_corridor (workflow Phase 4.1) ─────────────────


def test_ensure_corridor_injects_when_two_or_more_private_semi_private_rooms():
    from app.services import catalog

    spec = RequirementsSpec(rooms=[
        RoomRequest(type=RoomType.master_bedroom, count=1),
        RoomRequest(type=RoomType.bedroom, count=2),
    ])
    graph = ensure_corridor(ensure_entry(from_requirements(spec)))
    corridors = graph.nodes_of_space_type("corridor")
    assert len(corridors) == 1
    space = catalog.get("corridor")
    assert corridors[0].target_area_sqm == space.preferred_area_m2
    assert corridors[0].min_width_m == space.min_w
    assert corridors[0].min_depth_m == space.min_d


def test_ensure_corridor_threshold_is_exactly_two():
    # Below threshold: a single private room has nothing to be landlocked
    # behind, so no corridor is warranted.
    one_private = RequirementsSpec(rooms=[
        RoomRequest(type=RoomType.bedroom, count=1),
        RoomRequest(type=RoomType.bathroom, count=1),  # service, not private/semi_private
    ])
    assert ensure_corridor(ensure_entry(from_requirements(one_private))).nodes_of_space_type("corridor") == []

    # At threshold: 2 genuinely private rooms is already enough for one to
    # end up with no neighbour but the other (workflow 4.5's own
    # counterexample — lowered from the doc's literal ">= 3" after this was
    # found live; see the module-level comment on _MIN_ROOMS_NEEDING_CORRIDOR).
    two_private = RequirementsSpec(rooms=[
        RoomRequest(type=RoomType.bedroom, count=1),
        RoomRequest(type=RoomType.pooja_room, count=1),
    ])
    assert len(ensure_corridor(ensure_entry(from_requirements(two_private))).nodes_of_space_type("corridor")) == 1


def test_ensure_corridor_does_not_fire_just_because_entry_exists():
    # The exact false-positive already caught for the archetype selector
    # (Phase 3.2): "no circulation node" must NOT mean "no node of type
    # circulation" (entry counts as that), since ensure_entry has always
    # already run by this point and would make the broad check never fire.
    spec = RequirementsSpec(rooms=[
        RoomRequest(type=RoomType.master_bedroom, count=1),
        RoomRequest(type=RoomType.bedroom, count=2),
    ])
    graph = ensure_entry(from_requirements(spec))
    assert graph.nodes_of_space_type("entry"), "fixture must actually have an entry by this point"
    graph = ensure_corridor(graph)
    assert len(graph.nodes_of_space_type("corridor")) == 1


def test_ensure_corridor_is_idempotent():
    spec = RequirementsSpec(rooms=[
        RoomRequest(type=RoomType.master_bedroom, count=1),
        RoomRequest(type=RoomType.bedroom, count=2),
    ])
    graph = ensure_corridor(ensure_entry(from_requirements(spec)))
    graph = ensure_corridor(graph)
    assert len(graph.nodes_of_space_type("corridor")) == 1


def test_ensure_corridor_noop_when_program_already_has_a_hallway():
    spec = RequirementsSpec(spaces=[
        SpaceRequest(space_type="master_bedroom", count=1),
        SpaceRequest(space_type="bedroom", count=2),
        SpaceRequest(space_type="hallway", count=1),
    ])
    graph = ensure_corridor(ensure_entry(from_requirements(spec)))
    assert len(graph.nodes_of_space_type("hallway")) == 1
    assert graph.nodes_of_space_type("corridor") == []
