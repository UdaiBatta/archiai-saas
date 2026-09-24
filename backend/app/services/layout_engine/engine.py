"""RequirementsSpec -> LayoutPlan orchestrator (workflow Step 1.2, banding
generalized in Phase 3.1a).

Pipeline: build the program graph (auto-entry, master rule is upstream in the
spec) -> archetypes.zoned_bands assigns rooms to an ordered N-zone band
progression (public/circulation/semi_private/service/private/..., driven by
the graph's own catalog-based zone_of, not a residential-only enum) -> split
the plot into those bands, facing-side first -> recursive subdivision per
band -> leaf min-size check (a room that would fall below its sizing-table
minimum raises DoesNotFitError — the structured "plot too small" the API
turns into a clarification) -> emit deduplicated walls (one wall per shared
edge) -> place doors (must-adjacency first, then a BFS spanning tree from the
circulation room so the access graph is connected by construction, plus the
front door on the entry's facing wall).

For `floors > 1`, the graph is partitioned without splitting MUST components,
an aligned stair/lift core is pre-carved, and this same placement/door pipeline
runs independently per level. Coordinates remain floor-local and every emitted
room, wall, and door carries its zero-based floor. Rooms use rotation=0.

Polygon boundary path (workflow Phase 8): when `spec.plot.boundary` is set on a
single-floor brief, `generate_plan` dispatches to `_generate_plan_polygon`
instead — a parallel
pipeline (own subdivider, own wall builder) that mirrors this one structurally
but operates on a general straight-edge polygon rather than plot_w x plot_d.
It is deliberately NOT unified with the rect path: GEOS/shapely floating-point
arithmetic is not guaranteed bit-identical to the exact `Rect` arithmetic this
file already leans on (see the "round EDGES, not x/w independently" comment
below — this file has been bitten by float-path drift before), so routing
every rectangular plot through shapely for a superficially cleaner abstraction
would mean re-proving float-for-float equivalence against the whole existing
test suite. Two smaller parallel functions is the safer, smaller diff.
`_place_doors` below is reused UNCHANGED by both paths — it only ever reads
`RoomNeed`/`Wall`/wall-length, never the shape type, confirmed genuinely
shape-agnostic.
"""
import dataclasses
import math

from app.config.mvp_defaults import (
    DEFAULT_FACING,
    DEFAULT_PLOT_DEPTH_M,
    DEFAULT_PLOT_WIDTH_M,
    DOOR_WIDTH_M,
    MAX_ROOMS_PER_LAYOUT,
    WALL_THICKNESS_M,
)
from app.schemas.layout_plan import (
    ArchetypeReason,
    Door,
    LayoutPlan,
    PlanPlot,
    PlanRoom,
    PlanZoneSpan,
    Vertex,
    Wall,
)
from app.schemas.requirements import BuildingType, Facing, RequirementsSpec, RoomType
from app.services import catalog
from app.services.layout_engine import polygon
from app.services.layout_engine.archetypes import (
    BandPlan,
    hierarchical_bands,
    macro_zone,
    select_archetype,
    vertical_core_bands,
    zoned_bands,
)
from app.services.layout_engine.geometry import EPS, Rect, Segment
from app.services.layout_engine.polygon_subdivision import subdivide_polygon
from app.services.layout_engine.subdivision import RoomNeed, SubdivisionError, subdivide
from app.services.planning import (
    EngineProgram,
    assign_floors,
    from_requirements,
    to_engine_program,
)
from app.services.planning.program_completion import (
    ensure_corridor,
    ensure_entry,
    ensure_vertical_circulation,
)

_MIN_DOOR_EDGE = DOOR_WIDTH_M + 0.1     # a door needs this much shared wall
_NARROW_DOOR_WIDTH = 0.7                # connectivity fallback on tight edges
_NARROW_DOOR_EDGE = _NARROW_DOOR_WIDTH + 0.1
_PRIVACY_THRESHOLD = 2  # matches quality.hard_constraints' own through_room_access threshold

_SANITARY_TYPES = frozenset({"bathroom", "ensuite", "toilet", "washroom", "wc"})

# Shared edges between two of these get no wall and no door (open plan).
_OPEN_PLAN_TYPES = frozenset({
    "living_room", "open_plan_living", "dining_room", "dining_area", "kitchen",
    "foyer", "corridor", "hallway",
})


def _edge_kind(type_a: str, type_b: str) -> str:
    def canon(t: str) -> str:
        return catalog.resolve_alias(t) or t
    return "open" if {canon(type_a), canon(type_b)} <= _OPEN_PLAN_TYPES else "wall"


class DoesNotFitError(ValueError):
    """Structured 'plot too small' error. Phase 4 maps this to a 422
    clarification ("increase plot size?")."""

    def __init__(self, message: str, *, required_area: float | None = None, plot_area: float | None = None):
        super().__init__(message)
        self.required_area = required_area
        self.plot_area = plot_area


# ── Expansion + zoning ────────────────────────────────────────────────────────


def _remap_program(program: EngineProgram, prefix: str = "r") -> EngineProgram:
    remap = {
        need.key: f"{prefix}{index}"
        for index, need in enumerate(program.needs, start=1)
    }

    def _pairs(pairs: list[tuple[str, str]]) -> list[tuple[str, str]]:
        return [(remap[a], remap[b]) for a, b in pairs if a in remap and b in remap]

    return dataclasses.replace(
        program,
        needs=[dataclasses.replace(need, key=remap[need.key]) for need in program.needs],
        zone_of={remap[key]: value for key, value in program.zone_of.items() if key in remap},
        must_adjacent=_pairs(program.must_adjacent),
        should_adjacent=_pairs(program.should_adjacent),
        avoid=_pairs(program.avoid),
        circulation_nodes=[remap[key] for key in program.circulation_nodes if key in remap],
        floor_of={remap[key]: value for key, value in program.floor_of.items() if key in remap},
        entry_node=remap.get(program.entry_node),
    )


def _guard_program_size(spec: RequirementsSpec) -> None:
    """Reject an oversized program BEFORE any graph is built.

    ``plan_from_program`` already refuses more than ``MAX_ROOMS_PER_LAYOUT``
    needs, but only *after* ``from_requirements`` has materialised one graph
    node per requested instance — and neither ``rooms``/``spaces`` list has a
    length bound, only a per-entry ``count <= 50``. A single request inside
    the 3 MB body cap therefore built millions of nodes (measured: 3,000
    spaces x 50 = 36 s of CPU and 237 MB before the existing check fired),
    and every unknown-but-self-describing space also permanently registered
    itself in the process-global catalog on the way. Checking the requested
    total first is the same refusal with the same message, just before the
    work instead of after it. The threshold is deliberately identical:
    ``_build_program`` may still add an entry and a corridor, so the
    post-injection check downstream stays the authoritative one and this
    guard only short-circuits programs that could never pass it.
    """
    requested = sum(room.count for room in spec.rooms) + sum(
        space.count for space in spec.spaces
    )
    if requested > MAX_ROOMS_PER_LAYOUT:
        raise DoesNotFitError(f"more than {MAX_ROOMS_PER_LAYOUT} rooms requested")


def _build_program(spec: RequirementsSpec, *, inject_corridor: bool = True) -> EngineProgram:
    """Program construction via the ProgramGraph bridge (workflow Phase 2.2b,
    extended in 3.1a): ``from_requirements`` builds the graph, ``ensure_entry``
    replaces the old inline auto-entry hack, ``to_engine_program`` derives the
    full :class:`EngineProgram` — the flat needs list subdivision consumes,
    plus ``zone_of``/``must_adjacent``/etc. that ``archetypes.zoned_bands`` now
    consumes for banding (Phase 2.2b only kept ``needs``, discarding the rest).
    Sizing/labels for a ``spec.rooms``-sourced program are byte-identical to
    the pre-graph version (see ``from_requirements``'s docstring for why it
    uses raw ``RoomType`` values and ``ROOM_SIZING``, not the catalog, for
    this path).

    Every node-id-keyed field is remapped from the graph's own node ids
    ("node-3") back to the legacy "r1".."rN" scheme, in the same list order
    the graph already produces (spec.rooms order, entry appended last if
    injected — matching the old dict-based ``_expand``'s insertion order
    exactly). This isn't cosmetic: ``_place_doors`` below tie-breaks its BFS
    spanning tree on the lexicographic sort of room keys, so a different key
    scheme can change *which* doors get placed, not just their id — confirmed
    by diffing against a pre-refactor golden snapshot of all 5 fixtures
    before this key remap was added.
    """
    _guard_program_size(spec)
    try:
        graph = ensure_entry(from_requirements(spec))
        if inject_corridor:
            graph = ensure_corridor(graph)
    except catalog.UnknownSpaceType as exc:
        # `spec.spaces`'s free-string boundary (from_requirements validates
        # it eagerly) — translate into the existing clarification path
        # rather than a raw 500; `spec.rooms`'s closed RoomType enum can
        # never reach here (Pydantic already rejects an invalid value).
        raise DoesNotFitError(str(exc)) from exc
    return _remap_program(to_engine_program(graph))


def _programs_by_floor(spec: RequirementsSpec) -> list[EngineProgram]:
    _guard_program_size(spec)
    try:
        graph = ensure_corridor(ensure_entry(from_requirements(spec)))
        graph = ensure_vertical_circulation(
            graph,
            spec.floors,
            commercial=spec.building_type in {BuildingType.clinic, BuildingType.office},
            accessibility=spec.accessibility_mode,
        )
    except catalog.UnknownSpaceType as exc:
        raise DoesNotFitError(str(exc)) from exc

    assignment = assign_floors(graph, spec.floors)
    full = dataclasses.replace(to_engine_program(graph), floor_of=assignment.floor_of)
    programs: list[EngineProgram] = []
    for floor in range(spec.floors):
        keys = {
            key for key, assigned_floor in assignment.floor_of.items()
            if assigned_floor == floor
        }

        def _floor_pairs(pairs: list[tuple[str, str]]) -> list[tuple[str, str]]:
            return [(a, b) for a, b in pairs if a in keys and b in keys]

        program = dataclasses.replace(
            full,
            needs=[need for need in full.needs if need.key in keys],
            zone_of={key: value for key, value in full.zone_of.items() if key in keys},
            must_adjacent=_floor_pairs(full.must_adjacent),
            should_adjacent=_floor_pairs(full.should_adjacent),
            avoid=_floor_pairs(full.avoid),
            circulation_nodes=[key for key in full.circulation_nodes if key in keys],
            floor_of={key: floor for key in keys},
            entry_node=full.entry_node if full.entry_node in keys else None,
        )
        programs.append(_remap_program(program, prefix=f"f{floor}-r"))
    return programs


# ── Walls (deduplicated) + doors ─────────────────────────────────────────────


def _round(v: float) -> float:
    return round(v, 3)


def _build_walls(
    placed: list[tuple[RoomNeed, Rect]],
    plot_w: float,
    plot_d: float,
    *,
    floor: int = 0,
    id_prefix: str = "",
):
    """One wall per shared edge (never two overlapping ones) + boundary walls.

    Returns (walls, wall_rooms) where wall_rooms maps wall id -> (key_a, key_b)
    with key_b None for boundary walls — the internal adjacency the door placer
    and validator need but the LayoutPlan contract deliberately omits.
    """
    walls: list[Wall] = []
    wall_rooms: dict[str, tuple[str, str | None]] = {}

    def add(seg: Segment, a: str, b: str | None, kind: str = "wall") -> str:
        wall_id = f"{id_prefix}w{len(walls) + 1}"
        walls.append(Wall(
            id=wall_id,
            x1=_round(seg.x1), y1=_round(seg.y1),
            x2=_round(seg.x2), y2=_round(seg.y2),
            thickness=WALL_THICKNESS_M,
            floor=floor,
            kind=kind,
        ))
        wall_rooms[wall_id] = (a, b)
        return wall_id

    for i, (need_a, rect_a) in enumerate(placed):
        for need_b, rect_b in placed[i + 1:]:
            seg = rect_a.shared_edge(rect_b)
            if seg is not None:
                add(seg, need_a.key, need_b.key, _edge_kind(need_a.type, need_b.type))

    for need, rect in placed:  # boundary portions belong to exactly one room
        if rect.x <= EPS:
            add(Segment(0.0, rect.y, 0.0, rect.y2), need.key, None)
        if rect.x2 >= plot_w - EPS:
            add(Segment(plot_w, rect.y, plot_w, rect.y2), need.key, None)
        if rect.y <= EPS:
            add(Segment(rect.x, 0.0, rect.x2, 0.0), need.key, None)
        if rect.y2 >= plot_d - EPS:
            add(Segment(rect.x, plot_d, rect.x2, plot_d), need.key, None)
    return walls, wall_rooms


def _wall_length(w: Wall) -> float:
    # Euclidean, not Manhattan: a slanted polygon-boundary wall isn't
    # axis-aligned, and abs(dx)+abs(dy) understates/overstates its true
    # length, corrupting door-offset centering in _place_doors. A no-op for
    # every axis-aligned wall (Manhattan == Euclidean when one of dx/dy is
    # exactly zero) — verified byte-identical against all 5 fixtures.
    return math.hypot(w.x2 - w.x1, w.y2 - w.y1)


def _build_walls_polygon(
    placed: list[tuple[RoomNeed, "polygon.Polygon"]],
    plot_polygon: "polygon.Polygon",
    *,
    floor: int = 0,
    id_prefix: str = "",
):
    """Polygon counterpart of `_build_walls` — same one-wall-per-shared-edge
    contract, computed via `polygon.shared_edges`/`polygon.is_on_boundary`
    instead of `Rect.shared_edge`/coordinate-vs-plot-span comparisons."""
    walls: list[Wall] = []
    wall_rooms: dict[str, tuple[str, str | None]] = {}

    def add(seg: Segment, a: str, b: str | None, kind: str = "wall") -> str:
        wall_id = f"{id_prefix}w{len(walls) + 1}"
        walls.append(Wall(
            id=wall_id,
            x1=_round(seg.x1), y1=_round(seg.y1),
            x2=_round(seg.x2), y2=_round(seg.y2),
            thickness=WALL_THICKNESS_M,
            floor=floor,
            kind=kind,
        ))
        wall_rooms[wall_id] = (a, b)
        return wall_id

    for i, (need_a, poly_a) in enumerate(placed):
        for need_b, poly_b in placed[i + 1:]:
            for seg in polygon.shared_edges(poly_a, poly_b):
                add(seg, need_a.key, need_b.key, _edge_kind(need_a.type, need_b.type))

    for need, poly in placed:  # boundary portions belong to exactly one room
        coords = list(poly.exterior.coords)
        for (x1, y1), (x2, y2) in zip(coords, coords[1:]):
            mid = ((x1 + x2) / 2, (y1 + y2) / 2)
            if polygon.is_on_boundary(mid, plot_polygon):
                add(Segment(x1, y1, x2, y2), need.key, None)
    return walls, wall_rooms


def _circulation_key(placed: list[tuple[RoomNeed, Rect]]) -> str:
    """The room the door graph roots at. Workflow Phase 4.4: a real
    corridor/hallway spine (`program_completion.ensure_corridor`) wins when
    one exists — routing "through the living room" was always a fiction for
    circulation, just a tolerable one while no program ever had a real
    corridor node. Falls back to the pre-4.4 behavior otherwise, so nothing
    changes for a program without one."""
    by_type = {n.type: n.key for n, _ in placed}
    for spine_type in ("corridor", "hallway", "staircase", "stairs", "lift", "elevator"):
        if spine_type in by_type:
            return by_type[spine_type]
    if RoomType.living_room.value in by_type:
        return by_type[RoomType.living_room.value]
    if RoomType.entry.value in by_type:
        return by_type[RoomType.entry.value]
    return placed[0][0].key


def _pair_priority(pair: frozenset, zone_of: dict[str, str]) -> int:
    """Workflow Phase 4.4's connecting-wall preference order: circulation-to-
    room first, then public-to-public, everything else (routing through an
    arbitrary room) last. Used only to break ties in which pair the BFS
    spanning tree grows through next — connectivity itself is unaffected,
    only which walls end up hosting the doors that provide it."""
    zones = {zone_of.get(k, "semi_private") for k in pair}
    if "circulation" in zones:
        return 0
    if zones == {"public"}:
        return 1
    return 2


def _place_doors(
    placed: list[tuple[RoomNeed, Rect]],
    walls: list[Wall],
    wall_rooms: dict[str, tuple[str, str | None]],
    spec: RequirementsSpec,
    facing: Facing,
    zone_of: dict[str, str],
    *,
    allow_disconnected: bool = False,
    id_prefix: str = "",
) -> list[Door]:
    doors: list[Door] = []
    doored_walls: set[str] = set()

    def add_door(wall: Wall, width: float) -> None:
        if wall.id in doored_walls:
            return
        doored_walls.add(wall.id)
        offset = max(0.0, (_wall_length(wall) - width) / 2)
        doors.append(Door(
            id=f"{id_prefix}d{len(doors) + 1}",
            wall_ref=wall.id,
            offset=_round(offset),
            width=width,
            floor=wall.floor,
        ))

    interior = [
        w for w in walls if wall_rooms[w.id][1] is not None and w.kind != "open"
    ]
    open_links = [wall_rooms[w.id] for w in walls if w.kind == "open"]
    by_pair: dict[frozenset, list[Wall]] = {}
    for wall in interior:
        a, b = wall_rooms[wall.id]
        by_pair.setdefault(frozenset((a, b)), []).append(wall)

    types_by_key = {n.key: n.type for n, _ in placed}
    # Workflow Phase 4.4: a `separated`/AVOID pair is vetoed from ever
    # getting a direct door, even when it would be the shortest way to
    # connect two otherwise-disconnected parts of the floor — connectivity
    # must route AROUND an explicit avoidance, not through it. Computed once,
    # used by both the spanning tree (step 2) and the "door every remaining
    # adjacent pair" pass (step 3, which already respected this).
    def canonical_type(value: str) -> str:
        return catalog.resolve_alias(value) or value

    avoid_type_pairs = {
        frozenset((canonical_type(p.room_a), canonical_type(p.room_b)))
        for p in spec.avoid_adjacency
    }

    def is_avoided(pair: frozenset) -> bool:
        pair_types = frozenset(canonical_type(types_by_key[k]) for k in pair)
        return pair_types in avoid_type_pairs

    # 1. `must`-adjacency doors (attached bathroom onto its bedroom, etc.).
    for pref in spec.adjacency:
        if pref.strength != "must":
            continue
        for pair, pair_walls in by_pair.items():
            pair_types = {canonical_type(types_by_key[k]) for k in pair}
            pref_a = canonical_type(pref.room_a)
            pref_b = canonical_type(pref.room_b)
            if pair_types == {pref_a, pref_b} or (
                pref_a == pref_b
                and len(pair_types) == 1
                and pair_types == {pref_a}
            ):
                best = max(pair_walls, key=_wall_length)
                if _wall_length(best) >= _MIN_DOOR_EDGE:
                    add_door(best, DOOR_WIDTH_M)
                break

    # 1.5. Guarantee any corridor/hallway spine has a door to a NON-PRIVATE
    #      neighbour, using its widest available shared wall even if narrow
    #      (below the usual narrow-door floor). Found live: the corridor's
    #      position is computed independently of the public band's own
    #      internal subdivision, so their shared edge can end up a genuine
    #      sliver by coincidence of proportions — without this, the BFS
    #      spanning tree (step 2 below) can end up bridging the corridor to
    #      the rest of the house ONLY through one of the private rooms it
    #      exists to serve, defeating the entire point of workflow 4.5's
    #      privacy-chain guarantee (every OTHER room the corridor serves
    #      becomes reachable only by passing through whichever private room
    #      happens to be that accidental bridge). A physically-real minimum
    #      still applies — this is a deliberately narrow service door, not
    #      an invented opening.
    _MIN_PHYSICAL_DOOR_EDGE = 0.4
    for corridor_key in (k for k, t in types_by_key.items() if t in ("corridor", "hallway")):
        candidates = [
            (pair, walls) for pair, walls in by_pair.items()
            if corridor_key in pair
            and catalog.privacy_level_for(types_by_key[next(iter(pair - {corridor_key}))]) < _PRIVACY_THRESHOLD
            and not is_avoided(pair)
        ]
        if not candidates:
            continue
        if any(w.id in doored_walls for _, walls in candidates for w in walls):
            continue  # already bridged to something non-private
        # Prefer a PUBLIC-macro-zone neighbour over merely a non-private one,
        # even when its shared wall is shorter. "Non-private" (privacy < 2)
        # also covers service rooms — a bathroom/utility that is itself
        # landlocked inside the private wing, reachable only through the
        # bedrooms it sits between. Bridging the corridor to one of those
        # satisfies this step's letter while leaving its whole point unmet:
        # the corridor's only route to the entry still runs through a private
        # room. Found live on a 3-bed north-facing plan where the corridor's
        # longest non-private wall was a 2.53 m bathroom in the wing while a
        # real 0.47 m wall to the dining room sat unused.
        def _rank(pw: tuple[frozenset, list[Wall]]) -> tuple[int, float]:
            partner = next(iter(pw[0] - {corridor_key}))
            public = macro_zone(zone_of.get(partner, "semi_private")) == "public"
            return (0 if public else 1, -max(_wall_length(w) for w in pw[1]))

        best_walls = min(candidates, key=_rank)[1]
        best = max(best_walls, key=_wall_length)
        if _wall_length(best) >= _MIN_DOOR_EDGE:
            add_door(best, DOOR_WIDTH_M)
        elif _wall_length(best) >= _NARROW_DOOR_EDGE:
            add_door(best, _NARROW_DOOR_WIDTH)
        elif _wall_length(best) >= _MIN_PHYSICAL_DOOR_EDGE:
            add_door(best, _wall_length(best))

    # 2. BFS spanning tree from the circulation room — connectivity by
    #    construction. Wide doors preferred; narrow fallback keeps a tight
    #    plan reachable rather than failing it.
    circulation = _circulation_key(placed)
    connected = {circulation}
    for door in doors:  # must-doors already made may pre-connect rooms
        a, b = wall_rooms[door.wall_ref]
        if a in connected or (b or "") in connected:
            connected.update({a, b} if b else {a})

    def extend_through_existing_doors() -> None:
        extended = True
        while extended:
            extended = False
            links = [wall_rooms[d.wall_ref] for d in doors] + open_links
            for a, b in links:
                if b is None or (a in connected) == (b in connected):
                    continue
                connected.update((a, b))
                extended = True

    extend_through_existing_doors()

    ranked_pairs = sorted(
        by_pair.items(),
        key=lambda kv: (_pair_priority(kv[0], zone_of), sorted(kv[0])),
    )

    def connect_one(tier: int) -> bool:
        """Add one door from the reached set to an unreached room.

        Tier 0 grows only out of public/circulation rooms; tier 1 may also
        grow out of a bathroom; tier 2 out of anything. The caller always
        retries the lowest tier first, so a room is only reached through a
        bathroom, or last of all through a private room, when nothing better
        reaches it (a room reachable only through a bedroom fails the
        validator's through_room_access check)."""
        for pair, pair_walls in ranked_pairs:
            a, b = sorted(pair)
            if (a in connected) == (b in connected):
                continue
            if is_avoided(pair):
                continue
            source = a if a in connected else b
            private = catalog.privacy_level_for(types_by_key[source]) >= _PRIVACY_THRESHOLD
            sanitary = canonical_type(types_by_key[source]) in _SANITARY_TYPES
            if (tier == 0 and (private or sanitary)) or (tier == 1 and private):
                continue
            best = max(pair_walls, key=_wall_length)
            if _wall_length(best) >= _MIN_DOOR_EDGE:
                add_door(best, DOOR_WIDTH_M)
            elif _wall_length(best) >= _NARROW_DOOR_EDGE:
                add_door(best, _NARROW_DOOR_WIDTH)
            else:
                continue
            connected.update(pair)
            # A newly reached room may already be joined to others by a
            # MUST door or an open-plan edge — follow those before adding a
            # redundant door.
            extend_through_existing_doors()
            return True
        return False

    while connect_one(0) or connect_one(1) or connect_one(2):
        pass

    unreachable = [n.label for n, _ in placed if n.key not in connected]
    if unreachable and not allow_disconnected:
        raise DoesNotFitError(
            f"no door-sized wall reaches: {', '.join(unreachable)} — increase plot size"
        )

    # 4. Front door on the entry's facing-side boundary wall (best effort).
    entry_key = next((n.key for n, _ in placed if n.type == RoomType.entry.value), None)
    if entry_key is not None:
        def on_facing(wall: Wall) -> bool:
            if facing == Facing.east:
                return abs(wall.x1 - wall.x2) <= EPS and wall.x1 > 0
            if facing == Facing.west:
                return abs(wall.x1 - wall.x2) <= EPS and wall.x1 <= EPS
            if facing == Facing.south:
                return abs(wall.y1 - wall.y2) <= EPS and wall.y1 > 0
            return abs(wall.y1 - wall.y2) <= EPS and wall.y1 <= EPS

        boundary = [
            w for w in walls
            if wall_rooms[w.id] == (entry_key, None) and _wall_length(w) >= _MIN_DOOR_EDGE
        ]
        best = next((w for w in boundary if on_facing(w)), None) or (boundary[0] if boundary else None)
        if best is not None:
            add_door(best, DOOR_WIDTH_M)

    return doors


# ── Public entrypoint ─────────────────────────────────────────────────────────


def rebuild_derived_geometry(
    plan: LayoutPlan,
    spec: RequirementsSpec,
) -> LayoutPlan:
    """Recreate walls and doors from the plan's current room rectangles.

    Walls and doors are derived artifacts in the canonical ``LayoutPlan``
    contract. Editor geometry changes therefore invalidate any supplied copies.
    This helper deliberately permits disconnected edited states: it emits every
    valid hosted door it can, then lets the quality validator explain any rooms
    that remain unreachable. Initial generation remains strict.
    """

    if not plan.rooms:
        return plan.model_copy(update={"walls": [], "doors": []})

    floors = sorted({room.floor for room in plan.rooms})
    multi_floor = len(floors) > 1 or floors != [0]
    all_walls: list[Wall] = []
    all_doors: list[Door] = []
    polygon_mode = plan.plot.boundary is not None or any(
        room.vertices is not None for room in plan.rooms
    )
    plot_polygon = polygon.plot_to_polygon(plan.plot) if polygon_mode else None
    for floor in floors:
        placed = []
        for room in plan.rooms:
            if room.floor != floor:
                continue
            min_w, min_d = catalog.min_dimensions(room.type)
            shape = polygon.room_to_polygon(room) if polygon_mode else None
            placed.append(
                (
                    RoomNeed(
                        key=room.id,
                        type=room.type,
                        label=room.label,
                        preferred_area=(shape.area if shape is not None else room.w * room.h),
                        min_w=min_w,
                        min_d=min_d,
                    ),
                    shape if shape is not None else Rect(room.x, room.y, room.w, room.h),
                )
            )

        prefix = f"f{floor}-" if multi_floor else ""
        if polygon_mode:
            walls, wall_rooms = _build_walls_polygon(
                placed, plot_polygon, floor=floor, id_prefix=prefix
            )
        else:
            walls, wall_rooms = _build_walls(
                placed,
                plan.plot.width_m,
                plan.plot.depth_m,
                floor=floor,
                id_prefix=prefix,
            )
        zone_of = {need.key: catalog.zone_for(need.type) for need, _ in placed}
        doors = _place_doors(
            placed,
            walls,
            wall_rooms,
            spec,
            plan.plot.facing,
            zone_of,
            allow_disconnected=True,
            id_prefix=prefix,
        )
        all_walls.extend(walls)
        all_doors.extend(doors)
    return plan.model_copy(update={"walls": all_walls, "doors": all_doors})


def plan_from_program(
    spec: RequirementsSpec, program: EngineProgram, plot_w: float, plot_d: float, facing: Facing,
    *,
    band_plan: BandPlan | None = None,
    floor: int = 0,
    id_prefix: str = "",
) -> LayoutPlan:
    """The placement -> doors -> PlanRoom-assembly tail of ``generate_plan``,
    parameterized by an already-built ``EngineProgram`` instead of deriving
    one from ``spec`` internally. ``generate_plan`` itself is just this
    function fed its own freshly-built program (see below) — pulled out so
    workflow Phase 5's candidate search (``layout_engine/search.py``) can
    run the exact same proven placement/door/assembly pipeline over
    DIFFERENT room orderings of the SAME program without reimplementing it,
    carrying the identical zero-overlap/zero-gap/reachability guarantees a
    single-shot plan already has. The polygon-boundary path (workflow Phase
    8, ``_generate_plan_polygon`` below) does not go through this function —
    it has no archetype/band concept to vary an ordering over, so Phase 5
    search is rect-path only for now."""
    needs = program.needs
    if not needs:
        raise DoesNotFitError("no rooms requested")
    if len(needs) > MAX_ROOMS_PER_LAYOUT:
        raise DoesNotFitError(f"more than {MAX_ROOMS_PER_LAYOUT} rooms requested")

    plot_area = plot_w * plot_d
    required = sum(n.min_area for n in needs)
    if required * 1.05 > plot_area:
        raise DoesNotFitError(
            f"rooms need at least {required:.0f} m^2 but the plot is {plot_area:.0f} m^2 — increase plot size",
            required_area=required, plot_area=plot_area,
        )

    def _place(
        prog: EngineProgram,
        archetype_fn,
    ) -> tuple[list[tuple[RoomNeed, Rect]], BandPlan]:
        used_band_plan = archetype_fn(prog, plot_w, plot_d, facing)
        result: list[tuple[RoomNeed, Rect]] = []
        for band_rect, group in used_band_plan.bands:
            result.extend(subdivide(group, band_rect, facing))
        return result, used_band_plan

    if band_plan is None:
        composed = None
        if spec.layout_style is None:
            try:
                composed = hierarchical_bands(program, plot_w, plot_d, facing)
            except SubdivisionError:
                # Hierarchy is an enhancement, never a new fit requirement:
                # tight plots retain the proven global-archetype path.
                composed = None
        if composed is not None:
            archetype_key = "hierarchical"
            archetype_fn = lambda _program, _w, _d, _facing: composed
        else:
            archetype_key, archetype_fn, _ = select_archetype(program, spec.layout_style)
    else:
        archetype_key = "vertical_core"
        archetype_fn = lambda _program, _w, _d, _facing: band_plan
    def _place_checked(
        prog: EngineProgram,
        archetype_fn,
    ) -> tuple[list[tuple[RoomNeed, Rect]], BandPlan]:
        """`_place` plus the leaf min-size gate (swap-tolerant).

        The gate raises SubdivisionError, not DoesNotFitError, so it lands
        inside the same retry envelope as a failed partition below. It used to
        run after the try/except and refuse outright: a specialized archetype
        that partitioned successfully but left one room a few centimetres short
        on one side ("Sales Floor would be 9.4x8.3 m, below its minimum
        9.5x3.8 m") was refused without ever trying the general-purpose
        zoned_bands comb, which fits ~4% of those programs on the very same
        plot. The retry re-runs this gate, so nothing under-minimum is ever
        emitted — only the refusal is deferred until zoned_bands has failed too.
        """
        result, used_band_plan = _place(prog, archetype_fn)
        for need, rect in result:
            fits = (rect.w >= need.min_w - EPS and rect.d >= need.min_d - EPS) or (
                rect.w >= need.min_d - EPS and rect.d >= need.min_w - EPS
            )
            if not fits:
                raise SubdivisionError(
                    f"{need.label} would be {rect.w:.1f}x{rect.d:.1f} m, below its "
                    f"minimum {need.min_w:.1f}x{need.min_d:.1f} m"
                )
        return result, used_band_plan

    try:
        placed, used_band_plan = _place_checked(program, archetype_fn)
    except SubdivisionError as exc:
        if archetype_key in {"zoned_bands", "vertical_core"}:
            raise DoesNotFitError(f"{exc} — increase plot size") from exc
        # A more specific archetype (e.g. double_loaded_corridor's two
        # wings) can need more room along one axis than zoned_bands' single
        # progression does for the same program, purely from splitting into
        # more separate bands — found live on the clinic fixture, which
        # double_loaded_corridor's own selection criteria correctly match
        # but couldn't actually fit, while zoned_bands (the general-purpose
        # default every archetype falls back to) fit it fine. Try that
        # proven fallback once before giving up. Deliberately NOT a further
        # fallback to no-corridor placement: that would let generate_plan
        # return a plan with a real through_room_access violation on a
        # tight plot, silently breaking the exact guarantee workflow 4.5
        # exists for — an honest DoesNotFitError is the correct outcome
        # when even the general-purpose archetype can't fit the program
        # AND keep every private room genuinely reachable.
        try:
            placed, used_band_plan = _place_checked(program, zoned_bands)
        except SubdivisionError:
            raise DoesNotFitError(f"{exc} — increase plot size") from exc
        archetype_key = "zoned_bands"

    walls, wall_rooms = _build_walls(
        placed,
        plot_w,
        plot_d,
        floor=floor,
        id_prefix=id_prefix,
    )
    doors = _place_doors(
        placed,
        walls,
        wall_rooms,
        spec,
        facing,
        program.zone_of,
        id_prefix=id_prefix,
    )

    # Round EDGES (not x/w independently) so adjacent rooms share the exact
    # same rounded coordinate — independent rounding lets edges drift apart by
    # >1 mm and register as phantom overlaps (caught by the property gate).
    zone_by_key = (
        {
            need.key: band.zone_id
            for band in used_band_plan.bands
            for need in band.rooms
        }
        if used_band_plan.regions
        else {}
    )
    rooms = [
        PlanRoom(
            id=need.key,
            # `need.type` is already validated by this point — a raw RoomType
            # value from `spec.rooms` (Pydantic-enforced closed enum) or a
            # catalog-checked key from `spec.spaces` (`from_requirements`
            # calls `catalog.get()` eagerly) — no cast needed, and casting
            # via `RoomType(...)` would reject any non-residential type here.
            type=need.type,
            label=need.label,
            x=_round(rect.x), y=_round(rect.y),
            w=round(_round(rect.x2) - _round(rect.x), 3),
            h=round(_round(rect.y2) - _round(rect.y), 3),
            rotation=0,
            floor=floor,
            zone_id=zone_by_key.get(need.key),
        )
        for need, rect in placed
    ]
    plan = LayoutPlan(
        plot=PlanPlot(width_m=plot_w, depth_m=plot_d, facing=facing),
        rooms=rooms,
        walls=walls,
        doors=doors,
        archetype_reasons=(
            [
                ArchetypeReason(
                    zone_id=region.zone_id,
                    archetype=region.archetype,
                    reason=region.reason,
                    room_ids=list(region.room_ids),
                    spans=[
                        PlanZoneSpan(
                            x=span.x,
                            y=span.y,
                            w=span.w,
                            h=span.d,
                        )
                        for span in region.spans
                    ],
                )
                for region in used_band_plan.regions
            ]
            or None
        ),
    )
    # A selected archetype is never allowed to weaken the engine's hard
    # guarantees. Specific styles can produce a geometrically valid partition
    # whose door graph still routes through a private room; retry once with the
    # proven general-purpose comb before refusing. Multi-floor plans are
    # validated after their floor-local pieces are assembled.
    if spec.floors == 1:
        from app.services.quality.hard_constraints import validate

        violations = validate(plan, spec)
        if violations:
            if band_plan is None and archetype_key != "zoned_bands":
                try:
                    safe_bands = zoned_bands(program, plot_w, plot_d, facing)
                except SubdivisionError as exc:
                    raise DoesNotFitError(f"{exc} — increase plot size") from exc
                return plan_from_program(
                    spec,
                    program,
                    plot_w,
                    plot_d,
                    facing,
                    band_plan=safe_bands,
                    floor=floor,
                    id_prefix=id_prefix,
                )
            messages = "; ".join(violation.message for violation in violations)
            raise DoesNotFitError(messages)
    return plan


def _generate_plan_multifloor(spec: RequirementsSpec) -> LayoutPlan:
    if spec.plot.boundary is not None:
        raise DoesNotFitError("multi-floor polygon boundaries are not supported yet")

    plot_w = spec.plot.width_m or DEFAULT_PLOT_WIDTH_M
    plot_d = spec.plot.depth_m or DEFAULT_PLOT_DEPTH_M
    facing = spec.facing or DEFAULT_FACING
    rooms: list[PlanRoom] = []
    walls: list[Wall] = []
    doors: list[Door] = []
    for floor, program in enumerate(_programs_by_floor(spec)):
        try:
            bands = vertical_core_bands(program, plot_w, plot_d, facing)
        except SubdivisionError as exc:
            raise DoesNotFitError(
                f"floor {floor + 1}: {exc} - increase plot size"
            ) from exc
        floor_plan = plan_from_program(
            spec,
            program,
            plot_w,
            plot_d,
            facing,
            band_plan=bands,
            floor=floor,
            id_prefix=f"f{floor}-",
        )
        rooms.extend(floor_plan.rooms)
        walls.extend(floor_plan.walls)
        doors.extend(floor_plan.doors)

    plan = LayoutPlan(
        plot=PlanPlot(width_m=plot_w, depth_m=plot_d, facing=facing),
        rooms=rooms,
        walls=walls,
        doors=doors,
    )
    # `plan_from_program` skips its own hard check for floors > 1 ("validated
    # after their floor-local pieces are assembled") — this is that check.
    # Cross-floor rules (staircase_alignment, and the reachability walk that
    # only bridges levels through an exactly aligned stair/lift) are invisible
    # to a per-floor validation, so without this the engine could return a
    # plan with an entire unreachable storey instead of refusing honestly, the
    # exact guarantee the single-floor path already upholds.
    from app.services.quality.hard_constraints import validate

    violations = validate(plan, spec)
    if violations:
        raise DoesNotFitError("; ".join(v.message for v in violations))
    return plan


def _generate_plan_polygon(spec: RequirementsSpec) -> LayoutPlan:
    """Polygon counterpart of `generate_plan`'s tail — same validation order,
    same error types, no zone/archetype banding (Phase 8 scope: `zoned_bands`
    already collapses to one band for a single zone group, so subdividing the
    whole boundary as one band is the smallest thing that satisfies "rooms
    fill the boundary"; polygon-aware banding is deferred)."""
    facing = spec.facing or DEFAULT_FACING
    plot_polygon = polygon.polygon_from_vertices(spec.plot.boundary)
    if not plot_polygon.is_valid or not plot_polygon.is_simple or plot_polygon.area <= EPS:
        raise DoesNotFitError("plot boundary is not a valid simple polygon")

    program = _build_program(spec)
    needs = program.needs
    if not needs:
        raise DoesNotFitError("no rooms requested")
    if len(needs) > MAX_ROOMS_PER_LAYOUT:
        raise DoesNotFitError(f"more than {MAX_ROOMS_PER_LAYOUT} rooms requested")

    plot_area = plot_polygon.area
    required = sum(n.min_area for n in needs)
    if required * 1.05 > plot_area:
        raise DoesNotFitError(
            f"rooms need at least {required:.0f} m^2 but the plot is {plot_area:.0f} m^2 — increase plot size",
            required_area=required, plot_area=plot_area,
        )

    try:
        placed = subdivide_polygon(needs, plot_polygon, facing)
    except SubdivisionError as exc:
        raise DoesNotFitError(f"{exc} — increase plot size") from exc

    for need, poly in placed:  # leaf min-size gate (swap-tolerant), off the bbox
        minx, miny, maxx, maxy = poly.bounds
        w, d = maxx - minx, maxy - miny
        fits = (w >= need.min_w - EPS and d >= need.min_d - EPS) or (
            w >= need.min_d - EPS and d >= need.min_w - EPS
        )
        if not fits:
            raise DoesNotFitError(
                f"{need.label} would be {w:.1f}x{d:.1f} m, below its minimum "
                f"{need.min_w:.1f}x{need.min_d:.1f} m — increase plot size"
            )

    walls, wall_rooms = _build_walls_polygon(placed, plot_polygon)
    doors = _place_doors(placed, walls, wall_rooms, spec, facing, program.zone_of)

    rooms = []
    for need, poly in placed:
        minx, miny, maxx, maxy = poly.bounds
        x, y = _round(minx), _round(miny)
        w, h = round(_round(maxx) - x, 3), round(_round(maxy) - y, 3)
        vertices = None
        if not polygon.is_axis_aligned_rect(poly):
            ring = list(poly.exterior.coords)[:-1]  # drop the closing duplicate
            vertices = [Vertex(x=_round(px), y=_round(py)) for px, py in ring]
        rooms.append(PlanRoom(
            # `need.type` is already validated (see the rect path's own
            # comment above) — no RoomType(...) cast, same migration.
            id=need.key, type=need.type, label=need.label,
            x=x, y=y, w=w, h=h, rotation=0, vertices=vertices,
        ))

    plot_minx, plot_miny, plot_maxx, plot_maxy = plot_polygon.bounds
    boundary_ring = list(plot_polygon.exterior.coords)[:-1]
    return LayoutPlan(
        plot=PlanPlot(
            width_m=plot_maxx - plot_minx,
            depth_m=plot_maxy - plot_miny,
            facing=facing,
            boundary=[Vertex(x=_round(px), y=_round(py)) for px, py in boundary_ring],
        ),
        rooms=rooms,
        walls=walls,
        doors=doors,
    )


def generate_plan(spec: RequirementsSpec) -> LayoutPlan:
    if spec.floors > 1:
        return _generate_plan_multifloor(spec)
    if spec.plot.boundary is not None:
        return _generate_plan_polygon(spec)

    plot_w = spec.plot.width_m or DEFAULT_PLOT_WIDTH_M
    plot_d = spec.plot.depth_m or DEFAULT_PLOT_DEPTH_M
    facing = spec.facing or DEFAULT_FACING
    program = _build_program(spec)
    return plan_from_program(spec, program, plot_w, plot_d, facing)
