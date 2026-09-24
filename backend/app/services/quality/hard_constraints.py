"""Hard geometric validator (workflow Step 1.3).

Pure function over a LayoutPlan; no I/O, no engine imports beyond schemas and
Rect math. Used three ways: engine self-check (Phase 1 tests), the
/api/validate editor-sync endpoint (Phases 4/7 — called on every drop, so it
must stay fast), and the reject tier of the scorer (Phase 6).

Violation codes (stable API): overlap, out_of_bounds, below_min_size,
unreachable, missing_requested_room, through_room_access, unmet_must_connection,
staircase_alignment.

Reachability walks the access graph derived from doors: each door's midpoint
connects every room whose boundary touches that point (interior doors connect
two rooms; the front door touches one and adds no edge). The walk starts from
the entry room, or the first room if no entry exists (hand-built plans).
Aligned stair/lift instances connect consecutive floors; geometry on different
floors otherwise remains independent.

``through_room_access`` (workflow Phase 4.5, the privacy-chain check): a
private room or sanitary room must not be reachable only by walking through a
private room. The validator re-walks the door graph with private blockers
removed. A MUST-adjacency partner remains exempt, so an explicitly attached
ensuite through its own bedroom is intentional. Only reachable targets are
checked, so a disconnected room is reported once as ``unreachable``.

``requirements`` is optional (Packet 7.1 — prompt-to-program truth gate): the
fast per-drop editor endpoint has no RequirementsSpec to compare against and
must keep validating geometry only, so passing it stays opt-in and
backward-compatible. When supplied (the scorer always has one), a requested
room type/count entirely missing from the plan is a hard violation, not a
soft-scored warning — the engine already guarantees exact requested counts,
so a shortfall here means the source requirements or a later edit dropped a
requested room, and quality must not call that layout satisfactory.
"""
from app.schemas.layout_plan import Door, LayoutPlan, PlanRoom, Wall
from app.schemas.quality_report import Violation
from app.schemas.requirements import RequirementsSpec, RoomType
from app.services.catalog import resolve_alias
from app.services import catalog
from app.services.layout_engine import polygon
from app.services.layout_engine.geometry import EPS, Rect

_TOUCH_EPS = 0.05  # door-midpoint to room-boundary tolerance (5 cm)


def _rect(room: PlanRoom) -> Rect:
    return Rect(room.x, room.y, room.w, room.h)


def _door_point(door: Door, wall: Wall) -> tuple[float, float]:
    """Midpoint of the door leaf along its host wall."""
    dx = wall.x2 - wall.x1
    dy = wall.y2 - wall.y1
    length = (dx * dx + dy * dy) ** 0.5
    if length <= EPS:
        return wall.x1, wall.y1
    at = min(door.offset + door.width / 2, length)
    return wall.x1 + dx * at / length, wall.y1 + dy * at / length


def _touches(room: PlanRoom, x: float, y: float) -> bool:
    if room.vertices is not None:
        from shapely.geometry import Point

        return polygon.room_to_polygon(room).boundary.distance(Point(x, y)) <= _TOUCH_EPS
    r = _rect(room)
    on_vertical = (abs(x - r.x) <= _TOUCH_EPS or abs(x - r.x2) <= _TOUCH_EPS) and (
        r.y - _TOUCH_EPS <= y <= r.y2 + _TOUCH_EPS
    )
    on_horizontal = (abs(y - r.y) <= _TOUCH_EPS or abs(y - r.y2) <= _TOUCH_EPS) and (
        r.x - _TOUCH_EPS <= x <= r.x2 + _TOUCH_EPS
    )
    return on_vertical or on_horizontal


def _rooms_overlap(a: PlanRoom, b: PlanRoom) -> bool:
    if a.vertices is None and b.vertices is None:
        return _rect(a).overlaps(_rect(b))
    return polygon.room_to_polygon(a).intersection(
        polygon.room_to_polygon(b)
    ).area > EPS * EPS


def _inside_plot(room: PlanRoom, plan: LayoutPlan) -> bool:
    if room.vertices is None and plan.plot.boundary is None:
        return Rect(0.0, 0.0, plan.plot.width_m, plan.plot.depth_m).contains(
            _rect(room)
        )
    outside = polygon.room_to_polygon(room).difference(
        polygon.plot_to_polygon(plan.plot)
    )
    return outside.area <= EPS * EPS


def _door_adjacency(plan: LayoutPlan) -> dict[str, set[str]]:
    """room id -> set of room ids it directly shares a door or open edge with."""
    walls_by_id = {w.id: w for w in plan.walls}
    adjacency: dict[str, set[str]] = {room.id: set() for room in plan.rooms}
    passages = [
        (_door_point(door, wall), door.floor)
        for door in plan.doors
        if (wall := walls_by_id.get(door.wall_ref)) is not None and wall.floor == door.floor
    ] + [
        (((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2), w.floor)
        for w in plan.walls if w.kind == "open"
    ]
    for (x, y), floor in passages:
        touching = [
            room.id for room in plan.rooms
            if room.floor == floor and _touches(room, x, y)
        ]
        for a in touching:
            for b in touching:
                if a != b:
                    adjacency[a].add(b)
    vertical_types = {"staircase", "stairs", "lift", "elevator"}
    vertical_rooms = [room for room in plan.rooms if room.type in vertical_types]
    for room in vertical_rooms:
        for other in vertical_rooms:
            aligned = (
                room.type == other.type
                and other.floor == room.floor + 1
                and abs(room.x - other.x) <= EPS
                and abs(room.y - other.y) <= EPS
                and abs(room.w - other.w) <= EPS
                and abs(room.h - other.h) <= EPS
            )
            if aligned:
                adjacency[room.id].add(other.id)
                adjacency[other.id].add(room.id)
    return adjacency


def _walk(start: str, adjacency: dict[str, set[str]], blocked: frozenset[str] = frozenset()) -> set[str]:
    seen = {start}
    stack = [start]
    while stack:
        for neighbour in adjacency.get(stack.pop(), ()):
            if neighbour in blocked or neighbour in seen:
                continue
            seen.add(neighbour)
            stack.append(neighbour)
    return seen


_PRIVACY_THRESHOLD = 2
_SANITARY_TYPES = frozenset({"bathroom", "ensuite", "toilet", "washroom", "wc"})


def _must_exempt_pairs(rooms: list[PlanRoom], requirements: RequirementsSpec | None) -> set[frozenset]:
    """Room-id pairs allowed to route through each other despite both being
    privacy_level>=2 — e.g. an ensuite through its own MUST-attached
    bedroom. Empty (no exemptions) when there's no requirements to compare
    against, same opt-in posture as `_missing_requested_rooms`."""
    if requirements is None:
        return set()
    # Canonical on both sides: constraint endpoints are catalog keys, plan
    # room types may be raw RoomType values ("entry" vs "foyer") — matching
    # them literally would silently drop the ensuite exemption.
    types_by_id = {r.id: (resolve_alias(r.type) or r.type) for r in rooms}
    exempt: set[frozenset] = set()
    for pref in requirements.adjacency:
        if pref.strength != "must":
            continue
        pref_a = resolve_alias(pref.room_a) or pref.room_a
        pref_b = resolve_alias(pref.room_b) or pref.room_b
        a_ids = [rid for rid, t in types_by_id.items() if t == pref_a]
        b_ids = [rid for rid, t in types_by_id.items() if t == pref_b]
        for a in a_ids:
            for b in b_ids:
                if a != b:
                    exempt.add(frozenset((a, b)))
    return exempt


def _through_room_access_violations(
    plan: LayoutPlan,
    adjacency: dict[str, set[str]],
    start: str,
    reachable: set[str],
    requirements: RequirementsSpec | None,
) -> list[Violation]:
    rooms = plan.rooms
    privacy = {r.id: catalog.privacy_level_for(r.type) for r in rooms}
    private_ids = {rid for rid, lvl in privacy.items() if lvl >= _PRIVACY_THRESHOLD}
    sanitary_ids = {
        room.id
        for room in rooms
        if (resolve_alias(room.type) or room.type) in _SANITARY_TYPES
    }
    target_ids = private_ids | sanitary_ids
    if not private_ids:
        return []  # no private room can act as a through-route blocker

    exempt_pairs = _must_exempt_pairs(rooms, requirements)
    labels = {r.id: r.label for r in rooms}
    via_public = _walk(start, adjacency, frozenset(private_ids))
    shared_bathroom_reachable = bool(sanitary_ids & via_public)
    violations: list[Violation] = []
    for pid in sorted(target_ids):
        if pid == start or pid not in reachable:
            continue  # a disconnected room is already reported as `unreachable`
        # An en-suite: a bathroom may be reached through the one private room
        # it opens straight into — as long as the home also has a bathroom
        # nobody has to cross a bedroom to reach. A home whose ONLY bathroom
        # sits behind a bedroom still fails.
        own_bedroom = (
            adjacency.get(pid, set())
            if pid in sanitary_ids and shared_bathroom_reachable
            else set()
        )
        blocked = frozenset(
            other for other in private_ids
            if other != pid
            and frozenset((pid, other)) not in exempt_pairs
            and other not in own_bedroom
        )
        if pid not in _walk(start, adjacency, blocked):
            violations.append(Violation(
                code="through_room_access",
                room_ids=[pid],
                message=f"{labels[pid]} is only reachable by walking through a private room",
            ))
    return violations


def _missing_requested_rooms(
    rooms: list[PlanRoom], requirements: RequirementsSpec
) -> list[Violation]:
    generated_counts: dict[str, int] = {}
    for room in rooms:
        key = resolve_alias(room.type) or room.type
        generated_counts[key] = generated_counts.get(key, 0) + 1

    requested_counts: dict[str, int] = {}
    if requirements.spaces:
        for requested in requirements.spaces:
            key = resolve_alias(requested.space_type) or requested.space_type
            requested_counts[key] = (
                requested_counts.get(key, 0) + requested.count
            )
    else:
        for requested in requirements.rooms:
            key = resolve_alias(requested.type.value) or requested.type.value
            requested_counts[key] = (
                requested_counts.get(key, 0) + requested.count
            )

    violations: list[Violation] = []
    for room_type in sorted(requested_counts):
        shortfall = requested_counts[room_type] - generated_counts.get(room_type, 0)
        if shortfall > 0:
            label = room_type.replace("_", " ")
            violations.append(Violation(
                code="missing_requested_room",
                room_ids=[],
                message=(
                    f"Requested {requested_counts[room_type]} {label}(s) but the "
                    f"layout only has {generated_counts.get(room_type, 0)}"
                ),
            ))
    return violations


def _staircase_alignment_violations(
    rooms: list[PlanRoom], expected_floors: int | None = None
) -> list[Violation]:
    floor_count = max(
        expected_floors or 0,
        max((room.floor for room in rooms), default=-1) + 1,
    )
    floors = list(range(floor_count))
    if len(floors) <= 1:
        return []
    stairs = {
        floor: sorted(
            (
                room for room in rooms
                if room.floor == floor and room.type in {"staircase", "stairs"}
            ),
            key=lambda room: room.id,
        )
        for floor in floors
    }
    if any(not floor_stairs for floor_stairs in stairs.values()):
        return [Violation(
            code="staircase_alignment",
            room_ids=[room.id for floor_stairs in stairs.values() for room in floor_stairs],
            message="Every floor must have an aligned staircase",
        )]

    reference = stairs[floors[0]][0]
    misaligned = [
        floor_stairs[0]
        for floor, floor_stairs in stairs.items()
        if floor != floors[0]
        and (
            abs(floor_stairs[0].x - reference.x) > EPS
            or abs(floor_stairs[0].y - reference.y) > EPS
            or abs(floor_stairs[0].w - reference.w) > EPS
            or abs(floor_stairs[0].h - reference.h) > EPS
        )
    ]
    if not misaligned:
        return []
    return [Violation(
        code="staircase_alignment",
        room_ids=[reference.id, *(room.id for room in misaligned)],
        message="Staircases must occupy the same footprint on every floor",
    )]


def validate(
    plan: LayoutPlan, requirements: RequirementsSpec | None = None
) -> list[Violation]:
    violations: list[Violation] = []
    rooms = plan.rooms
    if requirements is not None:
        violations.extend(_missing_requested_rooms(rooms, requirements))
    if not rooms:
        return violations
    violations.extend(_staircase_alignment_violations(
        rooms,
        requirements.floors if requirements is not None else None,
    ))

    # (a) pairwise overlap, epsilon-aware
    for i, a in enumerate(rooms):
        for b in rooms[i + 1:]:
            if a.floor == b.floor and _rooms_overlap(a, b):
                violations.append(Violation(
                    code="overlap",
                    room_ids=[a.id, b.id],
                    message=f"{a.label} overlaps {b.label}",
                ))

    # (b) inside the plot
    for room in rooms:
        if not _inside_plot(room, plan):
            violations.append(Violation(
                code="out_of_bounds",
                room_ids=[room.id],
                message=f"{room.label} extends outside the plot",
            ))

    # (c) minimum sizes from the sizing table (orientation-tolerant). Lenient
    # catalog lookup — never raises — so a non-residential room type still
    # gets a real minimum instead of a KeyError; see min_dimensions' own
    # docstring for why this stays permissive here.
    for room in rooms:
        min_w, min_d = catalog.min_dimensions(room.type)
        fits = (room.w >= min_w - EPS and room.h >= min_d - EPS) or (
            room.w >= min_d - EPS and room.h >= min_w - EPS
        )
        if not fits:
            violations.append(Violation(
                code="below_min_size",
                room_ids=[room.id],
                message=(
                    f"{room.label} is {room.w:.1f}x{room.h:.1f} m, below its minimum "
                    f"{min_w:.1f}x{min_d:.1f} m"
                ),
            ))

    # (d) every room reachable through doors
    adjacency = _door_adjacency(plan)
    start = next((r.id for r in rooms if r.type == RoomType.entry), rooms[0].id)
    seen = _walk(start, adjacency)
    for room in rooms:
        if room.id not in seen:
            violations.append(Violation(
                code="unreachable",
                room_ids=[room.id],
                message=f"{room.label} cannot be reached through any door",
            ))

    # (e) privacy-chain check (workflow Phase 4.5) — see module docstring.
    violations.extend(_through_room_access_violations(plan, adjacency, start, seen, requirements))

    # (f) every "must connect" pair in the brief actually connects.
    if requirements is not None:
        violations.extend(_unmet_must_connections(rooms, adjacency, requirements))

    return violations


def _unmet_must_connections(
    rooms: list[PlanRoom], adjacency: dict[str, set[str]], requirements: RequirementsSpec
) -> list[Violation]:
    """A brief's "must connect A and B" is met when some A and some B are
    joined by a door or an open edge. A type missing from the plan is left to
    ``missing_requested_room``."""
    by_type: dict[str, list[PlanRoom]] = {}
    for room in rooms:
        by_type.setdefault(resolve_alias(room.type) or room.type, []).append(room)
    violations: list[Violation] = []
    seen: set[frozenset] = set()
    for pref in requirements.adjacency:
        if pref.strength != "must":
            continue
        a = resolve_alias(pref.room_a) or pref.room_a
        b = resolve_alias(pref.room_b) or pref.room_b
        if frozenset((a, b)) in seen or a not in by_type or b not in by_type:
            continue
        seen.add(frozenset((a, b)))
        met = any(
            rb.id in adjacency.get(ra.id, ())
            for ra in by_type[a] for rb in by_type[b] if ra.id != rb.id
        )
        if not met:
            label_a, label_b = by_type[a][0].label, by_type[b][0].label
            violations.append(Violation(
                code="unmet_must_connection",
                room_ids=[by_type[a][0].id, by_type[b][0].id],
                message=f"The brief asks for {label_a} to connect to {label_b}, but they don't.",
            ))
    return violations
