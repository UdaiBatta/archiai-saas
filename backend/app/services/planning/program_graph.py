"""ProgramGraph — a building-type-agnostic spatial program representation.

This is the spine the roadmap's later phases (graph-driven placement,
circulation, furniture) build on. It models a building as typed **spaces**
(and circulation / service / object / furniture / structural / opening nodes)
connected by **relationship edges** (adjacency, separation, circulation,
service dependency, …), independent of any residential vocabulary — an office,
clinic, or warehouse program is expressed exactly like a house.

Built from a ``RequirementsSpec`` (:func:`from_requirements`) and lowered
to the engine's ``EngineProgram`` (:func:`to_engine_program`).

No ML anywhere — this is plain typed data + deterministic classification rules.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional

from app.config.mvp_defaults import ROOM_SIZING
from app.schemas.requirements import RequirementsSpec
from app.services import catalog

if TYPE_CHECKING:  # avoid any import cost / cycles at runtime
    from app.services.layout_engine.subdivision import RoomNeed

# ── Vocabularies (building-type-agnostic classification) ─────────────────────

NodeType = str      # space | circulation | service | object | furniture | structural | opening
Zone = str          # public | private | semi_private | service | circulation | outdoor | technical

_CIRCULATION_TYPES = frozenset({
    "hallway", "corridor", "entry", "foyer", "lobby", "staircase", "stairs",
    "lift", "elevator",
    "passage", "passageway", "landing", "atrium",
})
_SERVICE_TYPES = frozenset({
    "bathroom", "ensuite", "toilet", "washroom", "wc", "laundry", "storage",
    "utility", "garage", "parking", "mudroom", "pantry", "mechanical", "plant",
    "shaft", "store_room", "stock_room",
})
_WET_TYPES = frozenset({
    "bathroom", "ensuite", "toilet", "washroom", "wc", "kitchen", "kitchenette",
    "laundry", "utility", "pantry",
})
# Spaces that genuinely want an exterior wall / daylight.
_DAYLIGHT_TYPES = frozenset({
    "bedroom", "master_bedroom", "kids_room", "living_room", "open_plan_living",
    "office", "classroom", "consultation_room", "workspace", "dining_room",
    "dining", "study", "reception", "waiting_room", "meeting_room",
})
_OPEN_PLAN_TYPES = frozenset({
    "living_room", "open_plan_living", "kitchen", "dining_room", "dining_area",
    "dining", "workspace", "retail_display", "sales_floor",
})
_PUBLIC_TYPES = frozenset({
    "living_room", "open_plan_living", "kitchen", "dining_room", "dining_area",
    "dining", "foyer", "reception", "waiting_room", "retail_display", "checkout",
    "bar", "sales_floor", "classroom", "lobby",
})
_PRIVATE_TYPES = frozenset({
    "master_bedroom", "bedroom", "kids_room", "ensuite", "office",
    "consultation_room", "workspace", "meeting_room", "pooja_room",
    "meditation_room", "study",
})
_AVOID_TYPE_FAMILIES: dict[str, frozenset[str]] = {
    "bathroom": frozenset({"bathroom", "ensuite", "toilet", "washroom", "wc"}),
}


def _classify_node_type(space_type: str) -> NodeType:
    if space_type in _CIRCULATION_TYPES:
        return "circulation"
    if space_type in _SERVICE_TYPES:
        return "service"
    return "space"


def _classify_zone(space_type: str) -> Zone:
    if space_type in _CIRCULATION_TYPES:
        return "circulation"
    if space_type in _SERVICE_TYPES:
        return "service"
    if space_type in _PUBLIC_TYPES:
        return "public"
    if space_type in _PRIVATE_TYPES:
        return "private"
    return "semi_private"


# ── Node / Edge / Graph ──────────────────────────────────────────────────────


@dataclass
class Node:
    """A typed element of the building program. All fields default so partial
    construction (e.g. from an incomplete imported program) is always safe."""

    id: str = ""
    type: NodeType = "space"
    space_type: str = "generic"
    label: str = ""
    zone: Zone = "semi_private"
    target_area_sqm: Optional[float] = None
    min_area_sqm: Optional[float] = None
    max_area_sqm: Optional[float] = None
    size_hint: Optional[str] = None  # small | medium | large | xlarge — see to_engine_program
    width: Optional[float] = None
    depth: Optional[float] = None
    height: Optional[float] = None
    min_width_m: Optional[float] = None
    min_depth_m: Optional[float] = None
    preferred_aspect_ratio: Optional[float] = None
    floor_preference: str = "any"  # ground | upper | basement | any
    floor_index: Optional[int] = None  # exact zero-based floor when structurally pinned
    privacy_level: int = 0  # 0 public … 3 most private
    daylight_need: str = "none"  # none | low | medium | high
    acoustic_need: str = "none"
    wet_room: bool = False
    public_access: bool = True
    staff_only: bool = False
    requires_external_wall: bool = False
    can_be_open_plan: bool = False
    furniture_requirements: list[str] = field(default_factory=list)
    accessibility_requirements: list[str] = field(default_factory=list)
    source: str = "prompt"  # prompt | template | user_added | imported_program | inferred_rule


@dataclass
class Edge:
    node_a: str
    node_b: str
    relation_type: str = "adjacent"  # adjacent | near | separated | connected_by_door | ...
    strength: str = "SHOULD"  # MUST | SHOULD | AVOID
    preferred_relative_position: str = "any"
    min_shared_wall_m: float = 0.0
    door_required: bool = False
    access_required: bool = False
    visibility_required: bool = False
    reason: str = ""


@dataclass
class ProgramGraph:
    nodes: list[Node] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)

    def add_node(self, node: Node) -> Node:
        if not node.id:
            node.id = f"node-{len(self.nodes)}"
        self.nodes.append(node)
        return node

    def add_edge(self, edge: Edge) -> Edge:
        self.edges.append(edge)
        return edge

    def get_node(self, node_id: str) -> Optional[Node]:
        return next((n for n in self.nodes if n.id == node_id), None)

    def nodes_of_type(self, node_type: NodeType) -> list[Node]:
        return [n for n in self.nodes if n.type == node_type]

    def first_of_space_type(self, space_type: str) -> Optional[Node]:
        return next((n for n in self.nodes if n.space_type == space_type), None)

    def nodes_of_space_type(self, space_type: str) -> list[Node]:
        return [n for n in self.nodes if n.space_type == space_type]

    def buildable_nodes(self) -> list[Node]:
        """Nodes that occupy real floor area (everything except pure openings /
        structural markers) — the ones the bridge turns back into RoomSpecs."""
        return [n for n in self.nodes if n.type not in ("opening", "structural")]


def _apply_type_semantics(node: Node) -> Node:
    """Fill the derived boolean/daylight fields from the space_type."""
    st = node.space_type
    node.wet_room = st in _WET_TYPES
    node.can_be_open_plan = st in _OPEN_PLAN_TYPES
    if st in _DAYLIGHT_TYPES:
        node.requires_external_wall = True
        node.daylight_need = "high" if st in _PRIVATE_TYPES or st in _PUBLIC_TYPES else "medium"
    if node.zone == "private":
        node.privacy_level = 3
        node.public_access = False
    elif node.zone == "service":
        node.privacy_level = 2
    elif node.zone == "public":
        node.privacy_level = 0
    return node


# ── Adapters ─────────────────────────────────────────────────────────────────


def _numbered_label(base: str, index: int, count: int) -> str:
    return f"{base} {index}" if count > 1 else base


def add_requirements_node(
    graph: ProgramGraph,
    nodes_by_key: dict[str, list[Node]],
    space_type: str,
    *,
    label: str,
    target_area_sqm: Optional[float] = None,
    min_width_m: Optional[float] = None,
    min_depth_m: Optional[float] = None,
    size_hint: Optional[str] = None,
    catalog_semantics: bool = False,
) -> None:
    space = catalog.get(space_type) if catalog_semantics else None
    node = Node(
        type=space.node_type if space is not None else _classify_node_type(space_type),
        space_type=space_type,
        label=label,
        zone=space.zone if space is not None else _classify_zone(space_type),
        target_area_sqm=target_area_sqm,
        min_width_m=min_width_m,
        min_depth_m=min_depth_m,
        size_hint=size_hint,
        source="requirements",
    )
    graph.add_node(_apply_type_semantics(node))
    nodes_by_key.setdefault(space_type, []).append(node)


def from_requirements(spec: RequirementsSpec) -> ProgramGraph:
    """Build a graph from the MVP engine's own contract, ``RequirementsSpec``.

    Uses ``spec.spaces`` (the free-string superset, Phase 1.2) when the
    caller populated it; otherwise builds from ``spec.rooms`` directly —
    every existing caller today only sets ``rooms``, so this is the common
    path, and it deliberately does NOT round-trip through
    ``catalog.spaces_from_rooms`` first: that helper drops the original
    ``RoomType``, but engine byte-identical output (Phase 2.2b) depends on
    two things only the original enum value carries — ``ROOM_SIZING``'s
    area/minima (the catalog's own values disagree with ``ROOM_SIZING`` on
    11 of 12 overlapping types, per the Phase 1 audit) and the legacy
    per-instance label scheme (``RoomType.value``, not the catalog's
    post-alias key — e.g. "Dining", not "Dining Room").

    Constraint endpoints are free catalog-key strings. Nodes built from
    ``spec.rooms`` retain raw legacy enum values; nodes built from
    ``spec.spaces`` use canonical catalog keys. Alias resolution matches either
    representation and remains id-level: every matching node gets an edge.

    Plot size and facing are engine-level facts, not graph nodes, and are
    intentionally left off the graph. Entry injection (the engine's
    ``counts[RoomType.entry] = 1`` auto-add) is deliberately NOT replicated
    here — that is ``program_completion.ensure_entry``'s job.
    """
    graph = ProgramGraph()
    nodes_by_key: dict[str, list[Node]] = {}

    if spec.spaces:
        plot_area = (
            spec.plot.width_m * spec.plot.depth_m
            if spec.plot.width_m is not None and spec.plot.depth_m is not None
            else None
        )
        for request in spec.spaces:
            # Fail fast at the true input boundary, same "reject, never
            # invent" posture as the closed RoomType enum — lets
            # UnknownSpaceType's nearest-match suggestion reach the caller
            # instead of silently falling back to a made-up default size
            # deep inside `to_engine_program`'s `_resolve_sizing` (which
            # stays lenient on purpose for hand-built/user-added graphs,
            # not user-typed requests).
            space_type = catalog.ensure_registered(request, plot_area_m2=plot_area)
            for i in range(1, request.count + 1):
                add_requirements_node(
                    graph, nodes_by_key, space_type,
                    label=_numbered_label(
                        space_type.replace("_", " ").title(), i, request.count
                    ),
                    target_area_sqm=request.area_m2,
                    size_hint=request.size_hint,
                    catalog_semantics=True,
                )
    else:
        # Raw RoomType.value (not the catalog-aliased key) — engine.py's own
        # zoning split does `RoomType(need.type)` against PUBLIC_ROOM_TYPES/
        # PRIVATE_ROOM_TYPES (see engine.py `generate_plan`), which only
        # accepts real enum strings. The classification frozensets above
        # already carry "entry"/"utility" as raw synonyms of "foyer"/
        # "laundry"; "dining"/"parking" were added alongside them for the
        # same reason.
        for room in spec.rooms:
            sizing = ROOM_SIZING[room.type]
            base_label = room.type.value.replace("_", " ").title()
            for i in range(1, room.count + 1):
                add_requirements_node(
                    graph, nodes_by_key, room.type.value,
                    label=_numbered_label(base_label, i, room.count),
                    target_area_sqm=sizing.preferred_area_m2,
                    min_width_m=sizing.min_w,
                    min_depth_m=sizing.min_d,
                )

    def nodes_for(room_type: str) -> list[Node]:
        raw = room_type.strip().lower().replace(" ", "_").replace("-", "_")
        resolved = catalog.resolve_alias(raw)
        direct = nodes_by_key.get(raw) or nodes_by_key.get(resolved or "")
        if direct:
            return direct
        if resolved is None:
            return []
        for key, nodes in nodes_by_key.items():
            if catalog.resolve_alias(key) == resolved:
                return nodes
        return []

    for pref in spec.adjacency:
        strength = pref.strength.upper()
        for a in nodes_for(pref.room_a):
            for b in nodes_for(pref.room_b):
                if a.id == b.id:
                    continue
                graph.add_edge(Edge(
                    node_a=a.id, node_b=b.id,
                    relation_type="adjacent",
                    strength=strength,
                    door_required=strength == "MUST",
                    reason=f"requirements adjacency {pref.room_a}~{pref.room_b}",
                ))

    for pair in spec.avoid_adjacency:
        for a in nodes_for(pair.room_a):
            for b in nodes_for(pair.room_b):
                if a.id == b.id:
                    continue
                graph.add_edge(Edge(
                    node_a=a.id, node_b=b.id,
                    relation_type="adjacent",
                    strength="AVOID",
                    reason=f"requirements avoid {pair.room_a}~{pair.room_b}",
                ))

    return graph


# ── Bridge to EngineProgram (Phase 2.1 — additive; engine.py does not consume
# this yet, that is Phase 2.2) ────────────────────────────────────────────────

_SIZE_HINT_MULTIPLIERS = {"small": 0.7, "medium": 1.0, "large": 1.35, "xlarge": 1.75}
_ADJACENCY_RELATIONS = frozenset({"adjacent", "connected_by_door", "near"})
_ENTRY_TYPES = ("entry", "foyer", "lobby", "reception")
_FLOOR_BY_PREFERENCE = {"basement": -1, "ground": 0, "upper": 1, "any": 0}


@dataclass(frozen=True)
class EngineProgram:
    """Everything generation needs, derived from the graph. Pure data.

    This is what a future engine (Phase 2.2) consumes instead of a flat
    ``RequirementsSpec`` — building it here changes no generated layout.
    """

    needs: list[RoomNeed]
    zone_of: dict[str, str]
    must_adjacent: list[tuple[str, str]]
    should_adjacent: list[tuple[str, str]]
    avoid: list[tuple[str, str]]
    circulation_nodes: list[str]
    floor_of: dict[str, int]
    entry_node: Optional[str]


def _resolve_sizing(node: Node) -> tuple[float, float, float]:
    """(preferred_area, min_w, min_d) for one node.

    Precedence for the target/preferred area: explicit node area > size_hint
    x catalog multiplier > catalog default > derived from width/depth. Hard
    minima (min_w/min_d) never scale with size_hint — only explicit node
    minima override the catalog's.
    """
    try:
        space = catalog.get(node.space_type)
    except catalog.UnknownSpaceType:
        space = None

    if node.target_area_sqm is not None:
        area = node.target_area_sqm
    elif node.size_hint and space is not None:
        area = space.preferred_area_m2 * _SIZE_HINT_MULTIPLIERS[node.size_hint]
    elif space is not None:
        area = space.preferred_area_m2
    else:
        area = (node.width or 3.0) * (node.depth or 3.0)

    min_w = node.min_width_m if node.min_width_m is not None else (space.min_w if space else 1.2)
    min_d = node.min_depth_m if node.min_depth_m is not None else (space.min_d if space else 1.2)
    return round(area, 2), min_w, min_d


def _entry_node(nodes: list[Node]) -> Optional[str]:
    for candidate_type in _ENTRY_TYPES:
        for node in nodes:
            if node.space_type == candidate_type:
                return node.id
    return None


def _edge_buckets(
    edges: list[Edge],
) -> tuple[list[tuple[str, str]], list[tuple[str, str]], list[tuple[str, str]]]:
    must: list[tuple[str, str]] = []
    should: list[tuple[str, str]] = []
    avoid: list[tuple[str, str]] = []
    for edge in edges:
        pair = (edge.node_a, edge.node_b)
        if edge.relation_type == "separated" or edge.strength == "AVOID":
            avoid.append(pair)
        elif edge.strength == "MUST" and edge.relation_type in _ADJACENCY_RELATIONS:
            must.append(pair)
        elif edge.strength == "SHOULD" and edge.relation_type in _ADJACENCY_RELATIONS:
            should.append(pair)
    return must, should, avoid


def to_engine_program(graph: ProgramGraph) -> EngineProgram:
    """Derive an :class:`EngineProgram` from a graph — id-level adjacency
    (not type-level), so e.g. two bedroom nodes each keep their own
    must/avoid pairs instead of collapsing onto "bedroom" as a type."""
    # Local import: engine.py (inside layout_engine) now imports this module
    # to build EngineProgram, and layout_engine/__init__.py eagerly imports
    # engine.py — a module-level import here would be a circular import at
    # package-init time. Deferring to call time breaks the cycle since by
    # then both packages have finished loading.
    from app.services.layout_engine.subdivision import RoomNeed

    buildable = graph.buildable_nodes()
    needs: list[RoomNeed] = []
    zone_of: dict[str, str] = {}
    floor_of: dict[str, int] = {}
    for node in buildable:
        area, min_w, min_d = _resolve_sizing(node)
        needs.append(RoomNeed(
            key=node.id,
            type=node.space_type,
            label=node.label or node.space_type.replace("_", " ").title(),
            preferred_area=area,
            min_w=min_w,
            min_d=min_d,
        ))
        zone_of[node.id] = node.zone
        floor_of[node.id] = (
            node.floor_index
            if node.floor_index is not None
            else _FLOOR_BY_PREFERENCE.get(node.floor_preference, 0)
        )

    must_adjacent, should_adjacent, avoid = _edge_buckets(graph.edges)
    circulation_nodes = [n.id for n in buildable if n.type == "circulation"]

    return EngineProgram(
        needs=needs,
        zone_of=zone_of,
        must_adjacent=must_adjacent,
        should_adjacent=should_adjacent,
        avoid=avoid,
        circulation_nodes=circulation_nodes,
        floor_of=floor_of,
        entry_node=_entry_node(buildable),
    )
