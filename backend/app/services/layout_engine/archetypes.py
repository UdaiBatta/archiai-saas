"""Layout archetypes (workflow Phase 3.1a) — pure functions from an
``EngineProgram`` to a :class:`BandPlan` (which band holds which rooms).

``zoned_bands`` generalizes ``engine.py``'s old binary public/private split
(``_bands`` + ``_order_group`` + the residential-only ``PUBLIC_ROOM_TYPES``/
``PRIVATE_ROOM_TYPES`` frozensets) into the doc's "ordered zone progression
public -> semi_private -> private" — driven by the graph/catalog's own
``zone_of`` classification instead of the closed residential ``RoomType``
enum, so any building-type program the graph can represent bands correctly,
not just houses.

``zone_of`` itself is finer-grained than 3 tiers (``public|circulation|
semi_private|service|private|technical|outdoor``, see program_graph.py). An
earlier version of this module gave each of those its own top-level band —
tried against the real fixtures, it starved rooms on ordinary plot sizes: a
"public" band containing only kitchen+living (with entry/balcony/bathrooms
peeled into their own separate bands) came out narrower than kitchen's own
minimum width, even though the *aggregate* of every band's floor comfortably
fit the plot. Splitting a facing-side "circulation" band for something as
small as a foyer, or a same-size "service" band for two bathrooms, isn't how
real plans read anyway. So the 7-value ``zone_of`` is folded into the 3
*macro* bands the doc names (``MACRO_ZONE``) before banding — circulation
joins public, service/technical/outdoor join private (unless a must-adjacency
redistribution moves a service node to its partner's band first).

Subdivision itself (``subdivision.subdivide``) is unchanged and shared by
every archetype; an archetype only decides band *structure* — the rectangles
and which rooms go in each.

``double_loaded_corridor``/``hub_and_spoke``/``open_core`` (workflow 3.1.b-d)
add three more band-structure functions plus the graph-shape selector
(3.2). None of them carve a literal circulation void: Phase 4 is what
actually injects a `corridor` program node and carves `corridor_rects` as
real rects (the field has existed on `BandPlan` since 3.1a and stays empty
here, same as before) — inventing an empty, room-less strip of floor area
before that exists would either leave a real gap in the tiled plot (breaking
the zero-gap guarantee every fixture/property test relies on) or require
fabricating a room nobody asked for. So here "corridor"/"hub"/"core" are
purely *band-grouping* ideas — which rooms cluster together and in what
shape — not carved voids; that's the honest, smaller thing that still makes
each archetype meaningfully different in code and in the resulting room
layout, without overclaiming Phase 4 geometry:

- ``double_loaded_corridor``: the public/circulation group anchors the
  facing edge (like ``zoned_bands``), but everything else is split into TWO
  parallel wings side by side (the perpendicular axis) instead of one deep
  band — alternating repeat units (bedrooms, classrooms, consultation
  rooms, ...) between them.
- ``hub_and_spoke``: the single highest-``circulation_weight`` public node
  becomes its own facing-anchored band (an "oversized center", sized the
  same floor-then-slack way every band is), must-adjacent spokes ordered
  first in the remaining band.
- ``open_core``: the single largest-area node (of any zone) anchors the
  facing edge; everyone else is one band behind it.

A literal ring/O-shaped hub-with-spokes-on-all-sides, or a true carved
corridor strip, both need real polygon/void support this engine's guillotine
subdivider does not have (and are exactly the kind of thing Phase 4's
`circulation.py` and Phase 10.2's polygon geometry exist for) — not
attempted here.
"""
from dataclasses import dataclass, field, replace
from typing import Callable, Literal

from app.schemas.requirements import Facing
from app.services import catalog
from app.services.layout_engine.geometry import EPS, Rect
from app.services.layout_engine.subdivision import RoomNeed, SubdivisionError
from app.services.planning import EngineProgram

# zone_of value -> macro band, in facing-to-back order. Mirrors the old
# "entry leads the public band, service rooms sit with private" intent.
MACRO_ZONE = {
    "circulation": "public",
    "public": "public",
    "semi_private": "semi_private",
    "service": "private",
    "private": "private",
    "technical": "private",
    "outdoor": "private",
}
_MACRO_ORDER = ("public", "semi_private", "private")
_MIN_BAND_SPAN = 1.5  # meters — same floor the old _bands() used

# A spine-shaped circulation node — NOT the full program_graph.py
# `_CIRCULATION_TYPES` set (which also includes entry/foyer/lobby/staircase;
# see `select_archetype`'s own comment on why "any circulation node" is a
# false-positive trap). Used both by `zoned_bands` (workflow 4.3: carve the
# corridor as its own real band instead of folding it into "public" like
# every other circulation type) and by `select_archetype`.
_CORRIDOR_SPINE_TYPES = frozenset({"hallway", "corridor", "passage", "passageway"})

# Matches quality.hard_constraints' own through_room_access threshold and
# engine.py's door-policy alignment (workflow 4.4/4.5) — one canonical
# "genuinely private" definition shared by placement, doors, and the check.
_THROUGH_ROOM_PRIVACY_THRESHOLD = 2
_SANITARY_TYPES = frozenset({"bathroom", "ensuite", "toilet", "washroom", "wc"})


def _corridor_served_groups(
    rooms: list[RoomNeed], must_adjacent: list[tuple[str, str]],
) -> tuple[list[list[RoomNeed]], list[RoomNeed]]:
    """Split ``rooms`` into (comb clusters that need guaranteed corridor
    access, everything else). Genuinely private rooms and sanitary rooms need
    the guarantee. A MUST-attached service partner travels with its private
    anchor as one comb cluster; unattached sanitary rooms are distributed over
    those clusters. Utility, parking, and other service/outdoor rooms remain
    flexible so circulation does not consume unnecessary frontage."""
    by_key = {n.key: n for n in rooms}
    keys = set(by_key)
    private_keys = {
        k for k, n in by_key.items()
        if catalog.privacy_level_for(n.type) >= _THROUGH_ROOM_PRIVACY_THRESHOLD
    }
    # At most ONE partner instance per TYPE per anchor: a type-level MUST
    # preference ("master_bedroom MUST bathroom") expands to an id-level
    # edge against EVERY bathroom instance, not just one — real, found live
    # on 4bhk, where all 3 bathrooms got pulled into master_bedroom's
    # cluster instead of just its actual ensuite, ballooning that one slot
    # to 4 rooms. Mirrors `_place_doors`'s own established single-match
    # precedent for the same underlying multi-instance MUST-edge shape.
    partners: dict[str, list[str]] = {}
    attached_types: dict[str, set[str]] = {}
    for a, b in must_adjacent:
        if a in private_keys and b in keys and b not in private_keys:
            anchor, partner = a, b
        elif b in private_keys and a in keys and a not in private_keys:
            anchor, partner = b, a
        else:
            continue
        partner_type = by_key[partner].type
        if partner_type in attached_types.setdefault(anchor, set()):
            continue
        attached_types[anchor].add(partner_type)
        partners.setdefault(anchor, []).append(partner)

    claimed: set[str] = set()
    clusters: list[list[RoomNeed]] = []
    for n in rooms:
        if n.key not in private_keys or n.key in claimed:
            continue
        group = [n] + [by_key[p] for p in partners.get(n.key, []) if p not in claimed]
        claimed.update(m.key for m in group)
        clusters.append(group)
    # An unattached bathroom is also access-sensitive: if it sits behind a
    # bedroom, the layout is reachable on paper but requires walking through
    # that bedroom. Distribute sanitary rooms across the smallest private
    # clusters; the cluster is split ALONG the corridor later, so every member
    # still touches it directly without consuming a separate full comb slot.
    sanitary = [
        n for n in rooms
        if n.key not in claimed
        and (catalog.resolve_alias(n.type) or n.type) in _SANITARY_TYPES
    ]
    for n in sanitary:
        if clusters:
            index = min(
                range(len(clusters)),
                key=lambda i: (
                    len(clusters[i]),
                    sum(item.preferred_area for item in clusters[i]),
                    i,
                ),
            )
            if index == len(clusters) - 1:
                clusters[index].insert(0, n)
            else:
                clusters[index].append(n)
        else:
            clusters.append([n])
        claimed.add(n.key)

    flex = [n for n in rooms if n.key not in claimed]
    return clusters, flex


def _stack_wet_rooms(
    clusters: list[list[RoomNeed]], must_adjacent: list[tuple[str, str]],
) -> tuple[list[list[RoomNeed]], frozenset[int]]:
    """Pair each attached bathroom with a common one in a single comb slot,
    one behind the other: the common bathroom at the corridor, the attached
    one behind it opening into its bedroom (which is right next to the slot).
    Two bathrooms each taking a full-depth slot of their own come out as
    1.6 m-wide strips; stacked, each is close to square. Returns the new
    clusters and the indices of the stacked (wet) ones."""
    must = {frozenset(pair) for pair in must_adjacent}

    def sanitary(need: RoomNeed) -> bool:
        return (catalog.resolve_alias(need.type) or need.type) in _SANITARY_TYPES

    clusters = [list(c) for c in clusters]
    attached = [
        (ci, need) for ci, c in enumerate(clusters) for need in c[1:]
        if sanitary(need) and frozenset((c[0].key, need.key)) in must
    ]
    common = [
        (ci, need) for ci, c in enumerate(clusters) for need in c
        if sanitary(need) and not (need is not c[0] and frozenset((c[0].key, need.key)) in must)
    ]
    pairs = list(zip(attached, common))
    if not pairs:
        return clusters, frozenset()
    for (ci, ensuite), (cj, shared) in pairs:
        clusters[ci].remove(ensuite)
        clusters[cj].remove(shared)
    result: list[list[RoomNeed]] = []
    wet: set[int] = set()
    stacks = {ci: [shared, ensuite] for (ci, ensuite), (_, shared) in pairs}
    for ci, cluster in enumerate(clusters):
        if cluster:
            result.append(cluster)
        if ci in stacks:
            wet.add(len(result))
            result.append(stacks[ci])
    return result, frozenset(wet)


def _balance_two_ways(groups: list[list[RoomNeed]]) -> tuple[list[list[RoomNeed]], list[list[RoomNeed]]]:
    """Split ``groups`` (e.g. corridor-served clusters) into two lists
    balanced by required corridor frontage. Preferred area breaks ties; it
    cannot replace the linear minimum that determines whether a comb fits."""
    def span(group: list[RoomNeed]) -> float:
        return sum(min(need.min_w, need.min_d) for need in group)

    def area(group: list[RoomNeed]) -> float:
        return sum(need.preferred_area for need in group)

    ordered = sorted(groups, key=lambda group: (-span(group), -area(group)))
    wing_a: list[list[RoomNeed]] = []
    wing_b: list[list[RoomNeed]] = []
    span_a = span_b = 0.0
    area_a = area_b = 0.0
    for g in ordered:
        g_span = span(g)
        g_area = area(g)
        if (span_a, area_a) <= (span_b, area_b):
            wing_a.append(g)
            span_a += g_span
            area_a += g_area
        else:
            wing_b.append(g)
            span_b += g_span
            area_b += g_area
    return wing_a, wing_b


def _flatten_cluster_band(
    rect: Rect,
    cluster: list[RoomNeed],
    *,
    axis: str | None = None,
) -> list[tuple[Rect, list[RoomNeed]]]:
    """A comb-arranged cluster's rect (from ``_split_rect``'s floor+slack
    allocation, sized for the cluster's aggregate area) doesn't always have
    a workable aspect ratio for the general recursive ``subdivide()`` —
    found live: a master_bedroom+bathroom cluster got a 4.2x4.1m rect with
    plenty of AREA for both (11 + 3.15 m² needed), but no valid guillotine
    cut of that specific shape satisfied both rooms' own minimum SIDES.
    Split multi-room clusters here too, with the same reliable
    floor-guaranteeing tool used everywhere else in this module, instead of
    handing them to a different algorithm with different guarantees. A
    single-room cluster is returned unchanged."""
    if len(cluster) <= 1:
        return [(rect, cluster)]
    split_axis = axis or ("w" if rect.w >= rect.d else "d")
    rects = _split_rect(rect, split_axis, [[n] for n in cluster])
    return list(zip(rects, [[n] for n in cluster]))


@dataclass(frozen=True)
class BandEntry:
    """One placement band plus its hierarchical-zone ownership.

    Iteration intentionally exposes only ``(rect, rooms)`` so every Phase
    3–9 consumer keeps its established two-value unpacking. ``zone_id`` is
    additive metadata for Phase 10 composition, not another geometry axis.
    """

    rect: Rect
    rooms: list[RoomNeed]
    zone_id: str = "global"

    def __iter__(self):
        return iter((self.rect, self.rooms))

    def __getitem__(self, index: int):
        return (self.rect, self.rooms)[index]


@dataclass(frozen=True)
class ArchetypeRegion:
    zone_id: str
    archetype: str
    reason: str
    room_ids: tuple[str, ...]
    spans: tuple[Rect, ...]


@dataclass(frozen=True)
class BandPlan:
    bands: list[BandEntry | tuple[Rect, list[RoomNeed]]]
    corridor_rects: list[tuple[str, Rect]] = field(default_factory=list)
    regions: list[ArchetypeRegion] = field(default_factory=list)

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "bands",
            [
                band if isinstance(band, BandEntry) else BandEntry(*band)
                for band in self.bands
            ],
        )


def macro_zone(zone: str) -> str:
    return MACRO_ZONE.get(zone, "private")


# Zones whose rooms belong wherever their MUST partner is: an attached
# bathroom sits in its bedroom's band, a balcony off the living room in the
# public band. Left alone, outdoor rooms fold into "private" and end up as a
# thin strip along the back of the plot, nowhere near the room they serve.
_FOLLOWER_ZONES = frozenset({"service", "outdoor"})


def _redistribute_service(program: EngineProgram) -> dict[str, str]:
    """``zone_of``, with each follower-zoned node (service, outdoor)
    reassigned to its must-adjacent partner's zone when one exists —
    otherwise it keeps its own zone and forms its own band."""
    zone_of = dict(program.zone_of)
    reassign: dict[str, str] = {}
    for a, b in program.must_adjacent:
        za, zb = zone_of.get(a), zone_of.get(b)
        if za in _FOLLOWER_ZONES and zb and zb not in _FOLLOWER_ZONES:
            reassign[a] = zb
        if zb in _FOLLOWER_ZONES and za and za not in _FOLLOWER_ZONES:
            reassign[b] = za
    # An outdoor room with no MUST partner still belongs to a room: its
    # SHOULD partner if it has one, else the public rooms (a balcony off the
    # living area) — never a strip of its own along the back of the plot.
    has_public = any(zone == "public" for zone in zone_of.values())
    for key, zone in program.zone_of.items():
        if zone != "outdoor" or key in reassign:
            continue
        partner_zone = next(
            (
                zone_of[other]
                for a, b in program.should_adjacent
                for other in ((b,) if a == key else (a,) if b == key else ())
                if zone_of.get(other) not in (None, *_FOLLOWER_ZONES)
            ),
            None,
        )
        if partner_zone or has_public:
            reassign[key] = partner_zone or "public"
    zone_of.update(reassign)
    return zone_of


def _pull_must_adjacent(rooms: list[RoomNeed], must_adjacent: list[tuple[str, str]]) -> list[RoomNeed]:
    """Reorder so each must-adjacent partner sits right after its anchor,
    within this one band's list — id-level (each room instance is handled on
    its own, not collapsed by type), the same soft-preference mechanism
    ``subdivision.subdivide`` already relies on list order for."""
    ordered = list(rooms)
    keys = {n.key for n in ordered}
    by_key = {n.key: n for n in ordered}
    for a, b in must_adjacent:
        if a not in keys or b not in keys:
            continue
        anchor, partner = by_key[a], by_key[b]
        if anchor is partner:
            continue
        ordered.remove(partner)
        ordered.insert(ordered.index(anchor) + 1, partner)
    return ordered


def _zone_rect(plot_w: float, plot_d: float, facing: Facing, offset: float, length: float) -> Rect:
    """The rect for a band starting ``offset`` meters from the facing edge
    and spanning ``length`` meters toward the back of the plot."""
    if facing == Facing.east:
        return Rect(plot_w - offset - length, 0.0, length, plot_d)
    if facing == Facing.west:
        return Rect(offset, 0.0, length, plot_d)
    if facing == Facing.south:
        return Rect(0.0, plot_d - offset - length, plot_w, length)
    return Rect(0.0, offset, plot_w, length)  # north


def _band_floor(rooms: list[RoomNeed], other: float) -> float:
    """Minimum band width along the facing (span) axis: the same
    area-derived floor ``engine._bands`` used, PLUS the shortest legal side
    of whichever room in this band needs the most room — without that second
    term a band can pass the aggregate-area check while still being too
    narrow for its single widest room (the same class of bug the Phase 4
    live-gate note above documents for cut clamping generally); mirrors
    ``subdivision.clamped_cut``'s own ``min_span_a``/``min_span_b`` guard.

    A single-room group skips the ``_MIN_BAND_SPAN`` floor and uses just
    that room's own real minimum instead (workflow 4.5's comb-arranged
    rooms, one per "band"): ``_MIN_BAND_SPAN`` exists to protect a band that
    might hold SEVERAL rooms from being squeezed thinner than sensible even
    when the aggregate-area check alone would allow it — a single
    already-fully-specified room doesn't need it inflated further. Found
    live: forcing every comb slot to at least 1.5m regardless of a smaller
    room's actual minimum (a 1.2m-wide balcony, say) compounds badly across
    N rooms in one row and made several real fixtures stop fitting their
    existing plot sizes for no geometric reason."""
    if not rooms:
        return _MIN_BAND_SPAN
    if len(rooms) == 1:
        need = rooms[0]
        min_span = min(need.min_w, need.min_d)
        area_floor = need.min_area * 1.02 / other
        return max(min_span, area_floor)
    min_span = max(min(n.min_w, n.min_d) for n in rooms)
    area_floor = sum(n.min_area for n in rooms) * 1.02 / other
    return max(_MIN_BAND_SPAN, min_span, area_floor)


def _facing_progression_bands(
    plot_w: float,
    plot_d: float,
    facing: Facing,
    ordered_groups: list[list[RoomNeed]],
    *,
    minimum_spans: list[float] | None = None,
) -> list[tuple[Rect, list[RoomNeed]]]:
    """Distribute ``ordered_groups`` (facing-edge group first) as consecutive
    bands along the facing progression axis. Every band first gets its own
    minimum floor (:func:`_band_floor`); whatever span is left over is then
    distributed across bands proportional to preferred-area share — see
    :func:`zoned_bands`'s original docstring for why "floor first, then
    slack by share" beats a naive greedy peel. Shared by every archetype
    that anchors an ordered group at the facing edge (``zoned_bands``'s zone
    progression, ``open_core``'s dominant/rest split, ``hub_and_spoke``'s
    hub/spokes split). Raises ``SubdivisionError`` when bands can't fit."""
    if len(ordered_groups) == 1:
        return [(Rect(0.0, 0.0, plot_w, plot_d), ordered_groups[0])]

    span, other = (plot_w, plot_d) if facing in (Facing.east, Facing.west) else (plot_d, plot_w)
    floors = [_band_floor(g, other) for g in ordered_groups]
    if minimum_spans is not None:
        floors = [max(floor, minimum) for floor, minimum in zip(floors, minimum_spans)]
    total_floor = sum(floors)
    if total_floor > span + EPS:
        raise SubdivisionError(
            f"zones need at least {total_floor:.1f}m along the facing axis but the plot only has {span:.1f}m"
        )
    slack = span - total_floor
    areas = [sum(n.preferred_area for n in g) for g in ordered_groups]
    total_area = sum(areas) or 1.0
    lengths = [f + slack * a / total_area for f, a in zip(floors, areas)]

    bands: list[tuple[Rect, list[RoomNeed]]] = []
    offset = 0.0
    for group, length in zip(ordered_groups, lengths):
        bands.append((_zone_rect(plot_w, plot_d, facing, offset, length), group))
        offset += length
    return bands


def _split_rect(
    rect: Rect,
    axis: str,
    groups: list[list[RoomNeed]],
    *,
    flatten_groups: bool = False,
    minimum_spans: list[float] | None = None,
    stacked: frozenset[int] = frozenset(),
) -> list[Rect]:
    """Split ``rect`` into one sub-rect per group along ``axis`` ("w" or
    "d"), same floor-then-slack allocation as :func:`_facing_progression_bands`
    — used for the axis PERPENDICULAR to the facing progression
    (``double_loaded_corridor``'s two wings), where there is no facing-edge
    side to anchor against, just a left-to-right/top-to-bottom order."""
    span = rect.w if axis == "w" else rect.d
    other = rect.d if axis == "w" else rect.w
    # A flattened group lays its rooms side by side along this axis, so its
    # floor is the sum of theirs; a ``stacked`` group puts them one behind
    # the other across it, so it only needs the widest one's floor.
    floors = [
        sum(_band_floor([need], other) for need in group)
        if flatten_groups and len(group) > 1 and index not in stacked
        else _band_floor(group, other)
        for index, group in enumerate(groups)
    ]
    if minimum_spans is not None:
        floors = [max(floor, minimum) for floor, minimum in zip(floors, minimum_spans)]
    total_floor = sum(floors)
    if total_floor > span + EPS:
        raise SubdivisionError(
            f"wings need at least {total_floor:.1f}m across but the available span is only {span:.1f}m"
        )
    slack = span - total_floor
    areas = [sum(n.preferred_area for n in g) for g in groups]
    total_area = sum(areas) or 1.0
    lengths = [f + slack * a / total_area for f, a in zip(floors, areas)]

    rects: list[Rect] = []
    offset = 0.0
    for length in lengths:
        if axis == "w":
            rects.append(Rect(rect.x + offset, rect.y, length, rect.d))
        else:
            rects.append(Rect(rect.x, rect.y + offset, rect.w, length))
        offset += length
    return rects


def _circulation_weight(space_type: str) -> float:
    try:
        return catalog.get(space_type).circulation_weight
    except catalog.UnknownSpaceType:
        return 1.0


def zoned_bands(program: EngineProgram, plot_w: float, plot_d: float, facing: Facing) -> BandPlan:
    """Ordered zone progression, facing-anchored — public/circulation
    leads, then semi_private, then private/service (see ``MACRO_ZONE``).
    Raises ``SubdivisionError`` (same type ``subdivide`` raises, so
    ``engine.py``'s existing handler converts it) when bands can't fit.

    Workflow 4.3 (carving): a corridor-spine node (``program_completion.
    ensure_corridor`` injects one when warranted) is pulled OUT of the
    "public" macro-band it would otherwise fold into and given its own real
    band instead — right after "public", at the public/private seam, same
    intent as the doc's "strip along the band seam". This makes the
    corridor an actual ``PlanRoom`` with real geometry (recorded in
    ``corridor_rects`` too), not just another room-need competing for space
    in the general pool.

    Workflow 4.5 (privacy-chain guarantee): when a corridor exists, the
    semi_private+private rooms it serves are NOT left as one combined band
    for the general recursive guillotine tree to subdivide however it
    likes — a 2-level-deep tree can nest a room so its only neighbours are
    OTHER private rooms (a real Hypothesis counterexample: 3 bedrooms in
    one band, the middle one flanked only by the other two). Instead they
    are comb-arranged: one flat, single-level row along the corridor's
    edge, so EVERY served room shares a real wall with the corridor
    directly, by construction — not "probably, depending on how the cuts
    happened to fall". A program with no corridor node behaves exactly as
    before — this whole block is a no-op when ``corridor`` is ``None``."""
    if not program.needs:
        return BandPlan(bands=[])

    zone_of = _redistribute_service(program)
    corridor = next((n for n in program.needs if n.type in _CORRIDOR_SPINE_TYPES), None)
    groups: dict[str, list[RoomNeed]] = {}
    for need in program.needs:
        if corridor is not None and need.key == corridor.key:
            continue  # carved as its own band below, not grouped with public
        macro = macro_zone(zone_of.get(need.key, "semi_private"))
        groups.setdefault(macro, []).append(need)
    for zone, rooms in groups.items():
        groups[zone] = _pull_must_adjacent(rooms, program.must_adjacent)

    ordered_zones = [z for z in _MACRO_ORDER if z in groups]
    ordered_groups = [groups[z] for z in ordered_zones]

    if corridor is None:
        return BandPlan(bands=_facing_progression_bands(plot_w, plot_d, facing, ordered_groups))

    served_zones = [z for z in ("semi_private", "private") if z in groups]
    served_group = [n for z in served_zones for n in groups[z]]
    lead_zones = [z for z in ordered_zones if z not in served_zones]
    lead_groups = [groups[z] for z in lead_zones]
    insert_at = 1 if lead_zones[:1] == ["public"] else 0

    # Only genuinely private rooms (+ their MUST-attached service partners)
    # need the comb guarantee; everything else (an unattached bathroom,
    # utility, parking, ...) is "flex" — no privacy-chain requirement, so it
    # gets its own ordinary band (appended after the comb) instead of
    # wasting comb length on rooms that never needed it.
    clusters, flex = _corridor_served_groups(served_group, program.must_adjacent)
    clusters, wet = _stack_wet_rooms(clusters, program.must_adjacent)

    if not clusters:
        # No genuinely private room at all — nothing needs the guarantee;
        # ensure_corridor's own trigger still injected a corridor (it counts
        # semi_private too), so give it a plain band like any other zone.
        all_groups = lead_groups[:insert_at] + [[corridor]] + lead_groups[insert_at:]
        if flex:
            all_groups = all_groups + [flex]
        bands = _facing_progression_bands(plot_w, plot_d, facing, all_groups)
        return BandPlan(bands=bands, corridor_rects=[(corridor.key, bands[insert_at][0])])

    served_footprint = [n for cluster in clusters for n in cluster]
    tail_groups = lead_groups[insert_at:] + ([flex] if flex else [])
    skeleton = lead_groups[:insert_at] + [[corridor], served_footprint] + tail_groups
    bands = _facing_progression_bands(plot_w, plot_d, facing, skeleton)
    corridor_rect = bands[insert_at][0]
    served_rect = bands[insert_at + 1][0]

    perp_axis = "d" if facing in (Facing.east, Facing.west) else "w"
    cluster_rects = _split_rect(
        served_rect,
        perp_axis,
        clusters,
        flatten_groups=True,
        stacked=wet,
    )
    depth_axis = "w" if perp_axis == "d" else "d"
    corridor_first = (
        corridor_rect.x < served_rect.x if depth_axis == "w" else corridor_rect.y < served_rect.y
    )
    comb_bands = []
    for index, (rect, cluster) in enumerate(zip(cluster_rects, clusters)):
        if index in wet:
            # Corridor-side room first along the depth axis.
            order = cluster if corridor_first else cluster[::-1]
            parts = _split_rect(rect, depth_axis, [[n] for n in order])
            comb_bands.extend(zip(parts, [[n] for n in order]))
        else:
            comb_bands.extend(_flatten_cluster_band(rect, cluster, axis=perp_axis))

    final_bands = bands[:insert_at] + [bands[insert_at]] + comb_bands + bands[insert_at + 2:]
    return BandPlan(bands=final_bands, corridor_rects=[(corridor.key, corridor_rect)])


def double_loaded_corridor(program: EngineProgram, plot_w: float, plot_d: float, facing: Facing) -> BandPlan:
    """Public/circulation group at the facing edge; everyone else split into
    two parallel wings (the perpendicular axis) instead of one deep private
    band. Degrades to a single facing-anchored band (same shape
    ``zoned_bands`` uses for one zone) when there's no public anchor or
    fewer than two rooms to split into wings.

    Workflow 4.5: when a corridor-spine node exists (this archetype's own
    ``select_archetype`` trigger requires one), it is pulled out of the
    "public" group it would otherwise fold into and carved as the literal
    spine BETWEEN the two wings — a real double-loaded-corridor floor plan,
    not just a name. Each wing's rooms are then comb-arranged along that
    spine's length (single-level split, same tool and same privacy-chain
    rationale as ``zoned_bands``'s own comb — a plain recursive subdivision
    of a multi-room wing can land one room with no neighbour but another
    room in the same wing), so every served room shares a real wall with
    the corridor directly. A program with no corridor node takes the exact
    pre-4.5 code path, unchanged."""
    if not program.needs:
        return BandPlan(bands=[])
    if len(program.needs) == 1:
        return BandPlan(bands=[(Rect(0.0, 0.0, plot_w, plot_d), list(program.needs))])

    zone_of = _redistribute_service(program)
    corridor = next((n for n in program.needs if n.type in _CORRIDOR_SPINE_TYPES), None)
    corridor_key = corridor.key if corridor is not None else None
    public = _pull_must_adjacent(
        [
            n for n in program.needs
            if n.key != corridor_key and macro_zone(zone_of.get(n.key, "semi_private")) == "public"
        ],
        program.must_adjacent,
    )
    public_keys = {n.key for n in public}
    repeat = _pull_must_adjacent(
        [n for n in program.needs if n.key not in public_keys and n.key != corridor_key],
        program.must_adjacent,
    )

    if not public or len(repeat) < 2:
        groups = [g for g in (public, repeat, [corridor] if corridor is not None else []) if g]
        return BandPlan(bands=_facing_progression_bands(plot_w, plot_d, facing, groups))

    perp_axis = "d" if facing in (Facing.east, Facing.west) else "w"

    if corridor is None:
        public_band, (wings_rect, _) = _facing_progression_bands(plot_w, plot_d, facing, [public, repeat])
        wing_a, wing_b = repeat[0::2], repeat[1::2]
        wing_groups = [g for g in (wing_a, wing_b) if g]
        if len(wing_groups) < 2:
            return BandPlan(bands=[public_band, (wings_rect, repeat)])
        wing_rects = _split_rect(wings_rect, perp_axis, wing_groups)
        return BandPlan(bands=[public_band] + list(zip(wing_rects, wing_groups)))

    # A corridor exists: only genuinely private clusters (a private room +
    # its MUST-attached service partners, workflow 4.5) need the guaranteed
    # spine touch — an unattached bathroom/utility/parking is "flex" and
    # gets an ordinary trailing band instead of wasting wing length on rooms
    # that never needed the guarantee (found live: combing every non-public
    # room made several real fixtures stop fitting their existing plots).
    clusters, flex = _corridor_served_groups(repeat, program.must_adjacent)
    if len(clusters) < 2:
        # Not enough clusters to form two wings around a spine — no literal
        # spine to carve either; one combined band, corridor included.
        groups = [public, repeat, [corridor]]
        return BandPlan(bands=_facing_progression_bands(plot_w, plot_d, facing, groups))

    # flex has no positional requirement of its own (workflow 4.5) — fold it
    # into the public group's area rather than giving it a separate trailing
    # band, so it doesn't pay a second band's own floor overhead on top of
    # the wings' (found live: a separate flex band left too little depth for
    # the wings to comb-arrange their clusters in on several real fixtures).
    # Stack attached + common bathrooms (see _stack_wet_rooms). A wet stack
    # must stay beside the bedroom its en-suite serves, so the pair is
    # balanced across the wings as one unit and split apart again after.
    clusters, wet_index = _stack_wet_rooms(clusters, program.must_adjacent)
    wet_ids = {id(clusters[i]) for i in wet_index}
    units: list[list[list[RoomNeed]]] = []
    for cluster in clusters:
        if id(cluster) in wet_ids and units:
            units[-1].append(cluster)
        else:
            units.append([cluster])
    fused = [[n for c in unit for n in c] for unit in units]
    unit_of = {id(f): unit for f, unit in zip(fused, units)}
    wing_a_fused, wing_b_fused = _balance_two_ways(fused)
    wing_a = [c for f in wing_a_fused for c in unit_of[id(f)]]
    wing_b = [c for f in wing_b_fused for c in unit_of[id(f)]]
    clusters_footprint = [n for cluster in clusters for n in cluster]
    public_and_flex = public + flex
    skeleton = [public_and_flex, clusters_footprint]

    def cluster_span(cluster: list[RoomNeed]) -> float:
        spans = [min(n.min_w, n.min_d) for n in cluster]
        return max(spans) if id(cluster) in wet_ids else sum(spans)

    wing_span = max(
        sum(cluster_span(cluster) for cluster in wing)
        for wing in (wing_a, wing_b)
    )
    progression_bands = _facing_progression_bands(
        plot_w,
        plot_d,
        facing,
        skeleton,
        minimum_spans=[0.0, wing_span],
    )
    public_rect, _ = progression_bands[0]
    public_band = (public_rect, public_and_flex)
    wings_rect = progression_bands[1][0]
    trailing_bands: list[tuple[Rect, list[RoomNeed]]] = []

    if not wing_b:
        # Degenerate: every cluster landed in one wing, nothing to spine
        # against on the other side.
        return BandPlan(bands=[public_band, (wings_rect, clusters_footprint)] + trailing_bands)

    # wing_a/wing_b are lists of CLUSTERS (each cluster itself a list of
    # rooms) — the outer wing-vs-corridor-vs-wing split needs each wing's
    # flat room footprint for sizing; the inner per-wing comb split (below)
    # needs the cluster structure itself.
    wing_a_footprint = [n for cluster in wing_a for n in cluster]
    wing_b_footprint = [n for cluster in wing_b for n in cluster]
    wing_a_rect, corridor_rect, wing_b_rect = _split_rect(
        wings_rect, perp_axis, [wing_a_footprint, [corridor], wing_b_footprint]
    )
    along_axis = "w" if perp_axis == "d" else "d"

    def comb(wing_rect: Rect, wing: list[list[RoomNeed]], corridor_high: bool):
        stacked = frozenset(i for i, c in enumerate(wing) if id(c) in wet_ids)
        rects = _split_rect(wing_rect, along_axis, wing, flatten_groups=True, stacked=stacked)
        out: list[tuple[Rect, list[RoomNeed]]] = []
        for i, (rect, cluster) in enumerate(zip(rects, wing)):
            if i in stacked:
                # cluster = [common, ensuite]; the common one on the corridor.
                order = cluster[::-1] if corridor_high else cluster
                parts = _split_rect(rect, perp_axis, [[n] for n in order])
                out.extend(zip(parts, [[n] for n in order]))
            else:
                out.extend(_flatten_cluster_band(rect, cluster, axis=along_axis))
        return out

    comb_a = comb(wing_a_rect, wing_a, corridor_high=True)
    comb_b = comb(wing_b_rect, wing_b, corridor_high=False)

    bands = [public_band] + comb_a + [(corridor_rect, [corridor])] + comb_b + trailing_bands
    return BandPlan(bands=bands, corridor_rects=[(corridor.key, corridor_rect)])


def hub_and_spoke(program: EngineProgram, plot_w: float, plot_d: float, facing: Facing) -> BandPlan:
    """The highest-``circulation_weight`` public node (waiting room,
    reception, lobby — falls back to any node if there's no public one)
    becomes its own facing-anchored band; must-adjacent spokes are ordered
    first in the remaining band."""
    if not program.needs:
        return BandPlan(bands=[])
    if len(program.needs) == 1:
        return BandPlan(bands=[(Rect(0.0, 0.0, plot_w, plot_d), list(program.needs))])

    candidates = [
        n for n in program.needs if macro_zone(program.zone_of.get(n.key, "semi_private")) == "public"
    ] or list(program.needs)
    hub = max(candidates, key=lambda n: (_circulation_weight(n.type), n.preferred_area))

    # `_pull_must_adjacent` reorders relative to an anchor INSIDE the same
    # list — the hub isn't part of `others`, so a plain call can't move a
    # hub-spoke pair. Sort hub-must-partners first instead (stable sort
    # keeps everything else in its original order), then still run
    # `_pull_must_adjacent` so must-adjacency BETWEEN spokes is honoured too.
    others = [n for n in program.needs if n.key != hub.key]
    hub_partners = {b if a == hub.key else a for a, b in program.must_adjacent if hub.key in (a, b)}
    others.sort(key=lambda n: n.key not in hub_partners)
    spokes = _pull_must_adjacent(others, program.must_adjacent)
    return BandPlan(bands=_facing_progression_bands(plot_w, plot_d, facing, [[hub], spokes]))


def open_core(program: EngineProgram, plot_w: float, plot_d: float, facing: Facing) -> BandPlan:
    """The single largest-area node (any zone — an open workspace, retail
    floor, warehouse volume) anchors the facing edge; everyone else forms
    one service-cluster band behind it."""
    if not program.needs:
        return BandPlan(bands=[])
    if len(program.needs) == 1:
        return BandPlan(bands=[(Rect(0.0, 0.0, plot_w, plot_d), list(program.needs))])

    dominant = max(program.needs, key=lambda n: n.preferred_area)
    rest = _pull_must_adjacent(
        [n for n in program.needs if n.key != dominant.key],
        program.must_adjacent,
    )
    return BandPlan(bands=_facing_progression_bands(plot_w, plot_d, facing, [[dominant], rest]))


def _must_components(
    needs: list[RoomNeed],
    pairs: list[tuple[str, str]],
) -> list[list[RoomNeed]]:
    by_key = {need.key: need for need in needs}
    parent = {key: key for key in by_key}

    def find(key: str) -> str:
        while parent[key] != key:
            parent[key] = parent[parent[key]]
            key = parent[key]
        return key

    for a, b in pairs:
        if a not in parent or b not in parent:
            continue
        root_a, root_b = find(a), find(b)
        if root_a != root_b:
            parent[max(root_a, root_b)] = min(root_a, root_b)

    grouped: dict[str, list[RoomNeed]] = {}
    for need in needs:
        grouped.setdefault(find(need.key), []).append(need)
    return list(grouped.values())


def vertical_core_bands(
    program: EngineProgram,
    plot_w: float,
    plot_d: float,
    facing: Facing,
) -> BandPlan:
    """Pre-carve an aligned stair/lift core and tile the remaining wing.

    The core is a full-depth strip: stair (and optional lift) at the front,
    landing/corridor behind. Private MUST-components each receive their own
    band along that strip, so access never depends on crossing another
    private component. Non-private rooms share one flex band.
    """
    stair = next(
        (need for need in program.needs if need.type in ("staircase", "stairs")),
        None,
    )
    corridor = next(
        (need for need in program.needs if need.type in _CORRIDOR_SPINE_TYPES),
        None,
    )
    lift = next(
        (need for need in program.needs if need.type in ("lift", "elevator")),
        None,
    )
    if stair is None or corridor is None:
        raise SubdivisionError("multi-floor generation needs a stair and landing on every floor")

    stair_length = max(2.4, stair.min_w, stair.min_d)
    stair_width = min(stair.min_w, stair.min_d)
    core_width = max(stair_width, min(lift.min_w, lift.min_d) if lift else 0.0)
    lift_length = max(lift.min_w, lift.min_d) if lift else 0.0
    core_used = stair_length + lift_length
    if core_used + corridor.min_d > plot_d + EPS:
        raise SubdivisionError(
            f"vertical core needs at least {core_used + corridor.min_d:.1f}m depth "
            f"but the plot only has {plot_d:.1f}m"
        )
    if core_width >= plot_w - EPS:
        raise SubdivisionError(
            f"vertical core is {core_width:.1f}m wide but the plot is only {plot_w:.1f}m"
        )

    core_bands: list[tuple[Rect, list[RoomNeed]]] = [
        (Rect(0.0, 0.0, core_width, stair_length), [stair]),
    ]
    offset = stair_length
    if lift is not None:
        core_bands.append((Rect(0.0, offset, core_width, lift_length), [lift]))
        offset += lift_length
    corridor_rect = Rect(0.0, offset, core_width, plot_d - offset)
    core_bands.append((corridor_rect, [corridor]))

    core_keys = {stair.key, corridor.key}
    if lift is not None:
        core_keys.add(lift.key)
    remaining = [need for need in program.needs if need.key not in core_keys]
    if not remaining:
        raise SubdivisionError("multi-floor generation needs at least one non-core room per floor")

    components = _must_components(remaining, program.must_adjacent)
    served = [
        group for group in components
        if any(
            catalog.privacy_level_for(need.type) >= _THROUGH_ROOM_PRIVACY_THRESHOLD
            for need in group
        )
    ]
    served_keys = {need.key for group in served for need in group}
    flex = [need for need in remaining if need.key not in served_keys]
    groups = served + ([flex] if flex else [])

    wing = Rect(core_width, 0.0, plot_w - core_width, plot_d)
    group_rects = _split_rect(wing, "d", groups)
    wing_bands = [
        flat
        for rect, group in zip(group_rects, groups)
        for flat in (
            _flatten_cluster_band(rect, group)
            if group in served
            else [(rect, group)]
        )
    ]
    return BandPlan(
        bands=core_bands + wing_bands,
        corridor_rects=[(corridor.key, corridor_rect)],
    )


ArchetypeFn = Callable[[EngineProgram, float, float, Facing], BandPlan]
ARCHETYPES: dict[str, ArchetypeFn] = {
    "zoned_bands": zoned_bands,
    "double_loaded_corridor": double_loaded_corridor,
    "hub_and_spoke": hub_and_spoke,
    "open_core": open_core,
}
LayoutStyle = Literal["zoned_bands", "double_loaded_corridor", "hub_and_spoke", "open_core"]

_MIN_REPEAT_UNITS = 3  # "≥3 same-type private/semi nodes" (workflow 3.1.b)
_MIN_HUB_SPOKES = 3    # "a single dominant public node with ≥3 MUST spokes" (3.1.c)
_MIN_DOMINANT_SHARE = 0.5  # "one node ≥50% of area" (3.1.d)

# A spine-shaped circulation node — NOT the full program_graph.py
# `_CIRCULATION_TYPES` set. That set also includes "entry"/"foyer"/"lobby"/
# "staircase", which `program_completion.ensure_entry` injects into
# virtually every program, residential ones included; gating on "any
# circulation node" made every 3+-bedroom house silently select
# double_loaded_corridor the moment this file was written (caught by
# actually running the 5 requirement fixtures through this selector before
# committing, not assumed safe — 4bhk has 3 bedrooms + an auto-injected
# entry, and would otherwise have flipped). A double-loaded corridor is
# specifically a hallway/corridor SPINE with rooms on both sides, so it
# should require one of those, not just "the program has an entry."
# (`_CORRIDOR_SPINE_TYPES` itself now lives near the top of the module,
# workflow 4.3 — `zoned_bands` needs it too.)


def select_archetype(
    program: EngineProgram, layout_style: LayoutStyle | None = None,
) -> tuple[str, ArchetypeFn, str]:
    """(archetype_key, fn, reason) — the doc's explainability rule (Phase
    3.2). An explicit ``layout_style`` always wins; otherwise selection reads
    graph SHAPE, not ``building_type`` vocabulary, so an untemplated program
    still lands on a sane archetype. Rules, in order (first match wins):

    1. ≥3 same-type repeat units in the semi_private/private zones, plus a
       hallway/corridor spine node in the program → ``double_loaded_corridor``.
    2. A public node with ≥3 MUST-adjacent spokes → ``hub_and_spoke``.
    3. A single node holding ≥50% of the program's total area → ``open_core``.
    4. Otherwise → ``zoned_bands`` (the general-purpose default).
    """
    if layout_style is not None:
        return layout_style, ARCHETYPES[layout_style], f"explicit layout_style={layout_style!r}"

    if not program.needs:
        return "zoned_bands", zoned_bands, "empty program — default archetype"

    repeat_counts: dict[str, int] = {}
    for need in program.needs:
        if macro_zone(program.zone_of.get(need.key, "semi_private")) in ("semi_private", "private"):
            repeat_counts[need.type] = repeat_counts.get(need.type, 0) + 1
    repeated_type = next((t for t, count in repeat_counts.items() if count >= _MIN_REPEAT_UNITS), None)
    has_corridor_spine = any(n.type in _CORRIDOR_SPINE_TYPES for n in program.needs)
    if repeated_type is not None and has_corridor_spine:
        return (
            "double_loaded_corridor", double_loaded_corridor,
            f"{repeat_counts[repeated_type]} {repeated_type!r} units plus a hallway/corridor spine in the program",
        )

    public_needs = [
        n for n in program.needs if macro_zone(program.zone_of.get(n.key, "semi_private")) == "public"
    ]
    if public_needs:
        hub = max(public_needs, key=lambda n: (_circulation_weight(n.type), n.preferred_area))
        spoke_count = sum(1 for a, b in program.must_adjacent if hub.key in (a, b))
        if spoke_count >= _MIN_HUB_SPOKES:
            return (
                "hub_and_spoke", hub_and_spoke,
                f"{hub.label!r} is a public hub with {spoke_count} MUST-adjacent spokes",
            )

    total_area = sum(n.preferred_area for n in program.needs) or 1.0
    dominant = max(program.needs, key=lambda n: n.preferred_area)
    dominant_share = dominant.preferred_area / total_area
    if dominant_share >= _MIN_DOMINANT_SHARE:
        return (
            "open_core", open_core,
            f"{dominant.label!r} is {dominant_share:.0%} of the program's total area",
        )

    return "zoned_bands", zoned_bands, "no archetype-specific graph shape matched"


# ── hierarchical composition (workflow Phase 10.1) ─────────────────────────


@dataclass(frozen=True)
class _MacroZone:
    zone_id: str
    rooms: list[RoomNeed]
    forced_archetype: str | None = None
    forced_reason: str | None = None


def _subset_program(program: EngineProgram, rooms: list[RoomNeed]) -> EngineProgram:
    keys = {room.key for room in rooms}

    def pairs(values: list[tuple[str, str]]) -> list[tuple[str, str]]:
        return [(a, b) for a, b in values if a in keys and b in keys]

    return replace(
        program,
        needs=rooms,
        zone_of={key: zone for key, zone in program.zone_of.items() if key in keys},
        must_adjacent=pairs(program.must_adjacent),
        should_adjacent=pairs(program.should_adjacent),
        avoid=pairs(program.avoid),
        circulation_nodes=[key for key in program.circulation_nodes if key in keys],
        floor_of={key: floor for key, floor in program.floor_of.items() if key in keys},
        entry_node=program.entry_node if program.entry_node in keys else None,
    )


def _service_partners(
    program: EngineProgram,
    anchors: set[str],
    available: set[str],
) -> set[str]:
    partners: set[str] = set()
    for a, b in program.must_adjacent:
        if a in anchors and b in available:
            candidate = b
        elif b in anchors and a in available:
            candidate = a
        else:
            continue
        if program.zone_of.get(candidate) in {"service", "technical"}:
            partners.add(candidate)
    return partners


def _macro_zones(program: EngineProgram, corridor: RoomNeed) -> list[_MacroZone]:
    """Type-agnostic macro-zones from repeat units plus service dependencies.

    The conservative activation is intentional: only non-private repeated
    units (classrooms, studio units, similar catalog programs) trigger this
    first hierarchical packet. Repeated bedrooms remain on the byte-stable
    residential path. MUST-attached service rooms follow their anchor zone;
    a dominant remaining room plus its own service dependency becomes an
    open-core candidate; everything else forms the shared support/front zone.
    """
    candidates = [room for room in program.needs if room.key != corridor.key]
    by_type: dict[str, list[RoomNeed]] = {}
    for room in candidates:
        if (
            program.zone_of.get(room.key) not in {"circulation", "service", "technical"}
            and catalog.privacy_level_for(room.type) < _THROUGH_ROOM_PRIVACY_THRESHOLD
        ):
            by_type.setdefault(room.type, []).append(room)

    repeated = [
        (space_type, rooms)
        for space_type, rooms in sorted(by_type.items())
        if len(rooms) >= _MIN_REPEAT_UNITS
        and space_type not in _CORRIDOR_SPINE_TYPES
    ]
    if not repeated:
        return []

    by_key = {room.key: room for room in candidates}
    unassigned = set(by_key)
    zones: list[_MacroZone] = []
    for space_type, rooms in repeated:
        room_keys = {room.key for room in rooms} & unassigned
        if len(room_keys) < _MIN_REPEAT_UNITS:
            continue
        attached = _service_partners(program, room_keys, unassigned - room_keys)
        keys = room_keys | attached
        ordered = [room for room in candidates if room.key in keys]
        unassigned -= keys
        zones.append(_MacroZone(
            zone_id=f"zone-repeat-{space_type}",
            rooms=ordered,
            forced_archetype="double_loaded_corridor",
            forced_reason=(
                f"{len(room_keys)} {space_type!r} repeat units share the building circulation spine"
            ),
        ))

    remaining = [room for room in candidates if room.key in unassigned]
    if not zones or len(remaining) < 2:
        return []

    # A dominant room with a real service dependency names the remaining
    # front/support program as one open-core macro-zone. Keeping its support
    # rooms in that zone lets the existing selector see the real area share
    # while preserving the dominant-to-service MUST edge inside one wing.
    dominant = max(remaining, key=lambda room: (room.preferred_area, room.key))
    remaining_area = sum(room.preferred_area for room in remaining) or 1.0
    attached = _service_partners(
        program,
        {dominant.key},
        {room.key for room in remaining if room.key != dominant.key},
    )
    if (
        dominant.preferred_area / remaining_area >= _MIN_DOMINANT_SHARE
        and attached
    ):
        zones.append(_MacroZone(
            zone_id=f"zone-core-{dominant.type}",
            rooms=remaining,
        ))
    else:
        zones.append(_MacroZone(zone_id="zone-support", rooms=remaining))
    return zones


def _zone_sides(
    zone: _MacroZone,
    archetype: str,
    program: EngineProgram,
) -> tuple[list[RoomNeed], list[RoomNeed]]:
    """Return ``(back, facing)`` room groups for one shared-spine zone."""
    rooms = list(zone.rooms)
    entry = next((room for room in rooms if room.key == program.entry_node), None)

    if archetype == "double_loaded_corridor":
        back, facing = rooms[0::2], rooms[1::2]
    elif archetype == "open_core":
        dominant = max(rooms, key=lambda room: (room.preferred_area, room.key))
        partner_keys = {
            b if a == dominant.key else a
            for a, b in program.must_adjacent
            if dominant.key in (a, b)
        }
        facing = [dominant] + [
            room for room in rooms
            if room.key in partner_keys and room.key != dominant.key
        ]
        if entry is not None and entry.key not in {room.key for room in facing}:
            facing.append(entry)
        facing_keys = {room.key for room in facing}
        back = [room for room in rooms if room.key not in facing_keys]
    elif archetype == "hub_and_spoke":
        public = [
            room for room in rooms
            if macro_zone(program.zone_of.get(room.key, "semi_private")) == "public"
        ] or rooms
        hub = max(public, key=lambda room: (_circulation_weight(room.type), room.preferred_area))
        facing = [hub]
        if entry is not None and entry.key != hub.key:
            facing.append(entry)
        facing_keys = {room.key for room in facing}
        back = [room for room in rooms if room.key not in facing_keys]
    else:
        facing = [
            room for room in rooms
            if macro_zone(program.zone_of.get(room.key, "semi_private")) == "public"
            or room.key == program.entry_node
        ]
        facing_keys = {room.key for room in facing}
        back = [room for room in rooms if room.key not in facing_keys]

    if not back or not facing:
        ordered = sorted(rooms, key=lambda room: (-room.preferred_area, room.key))
        back, facing = [], []
        area_back = area_facing = 0.0
        for room in ordered:
            if area_back <= area_facing:
                back.append(room)
                area_back += room.preferred_area
            else:
                facing.append(room)
                area_facing += room.preferred_area
        if entry is not None and entry in back:
            swap = next((room for room in facing if room.key != entry.key), None)
            back.remove(entry)
            facing.append(entry)
            if swap is not None:
                facing.remove(swap)
                back.append(swap)
    return back, facing


def _shared_spine_wings(
    plot_w: float,
    plot_d: float,
    facing: Facing,
    corridor_width: float,
) -> tuple[Rect, Rect, Rect, str]:
    if facing in (Facing.east, Facing.west):
        wing_width = (plot_w - corridor_width) / 2
        west = Rect(0.0, 0.0, wing_width, plot_d)
        corridor = Rect(wing_width, 0.0, corridor_width, plot_d)
        east = Rect(wing_width + corridor_width, 0.0, wing_width, plot_d)
        return (west, east, corridor, "d") if facing == Facing.east else (east, west, corridor, "d")

    wing_depth = (plot_d - corridor_width) / 2
    north = Rect(0.0, 0.0, plot_w, wing_depth)
    corridor = Rect(0.0, wing_depth, plot_w, corridor_width)
    south = Rect(0.0, wing_depth + corridor_width, plot_w, wing_depth)
    return (north, south, corridor, "w") if facing == Facing.south else (south, north, corridor, "w")


def hierarchical_bands(
    program: EngineProgram,
    plot_w: float,
    plot_d: float,
    facing: Facing,
) -> BandPlan | None:
    """Compose independently selected macro-zones around one shared spine.

    Returns ``None`` for ordinary/small programs so all Phase 3–9 geometry is
    untouched. A composed plan uses one full-length corridor and a pair of
    room combs per macro-zone. Every room therefore has literal corridor
    frontage, while each zone's side split expresses its selected archetype:
    repeats alternate across the spine, hubs/dominant cores occupy the facing
    wing, and support rooms follow public-to-facing zoning.
    """
    corridor = next((room for room in program.needs if room.type in _CORRIDOR_SPINE_TYPES), None)
    if corridor is None:
        return None
    zones = _macro_zones(program, corridor)
    if len(zones) < 2:
        return None

    corridor_width = max(
        min(corridor.min_w, corridor.min_d),
        catalog.CIRCULATION_WIDTHS["residential"],
    )
    progression_span = plot_w if facing in (Facing.east, Facing.west) else plot_d
    if corridor_width >= progression_span - EPS:
        raise SubdivisionError("shared circulation spine leaves no room for macro-zones")
    back_wing, facing_wing, corridor_rect, cross_axis = _shared_spine_wings(
        plot_w, plot_d, facing, corridor_width,
    )

    decisions: list[tuple[_MacroZone, str, str, list[RoomNeed], list[RoomNeed]]] = []
    for zone in zones:
        if zone.forced_archetype is not None:
            archetype = zone.forced_archetype
            reason = zone.forced_reason or "hierarchical repeat-unit zone"
        else:
            archetype, _, reason = select_archetype(_subset_program(program, zone.rooms))
        back_rooms, facing_rooms = _zone_sides(zone, archetype, program)
        if not back_rooms or not facing_rooms:
            return None
        decisions.append((zone, archetype, reason, back_rooms, facing_rooms))

    zone_groups = [zone.rooms for zone, _, _, _, _ in decisions]
    side_width = back_wing.w if cross_axis == "d" else back_wing.d
    minimum_spans = [
        max(
            sum(_band_floor([room], side_width) for room in back_rooms),
            sum(_band_floor([room], side_width) for room in facing_rooms),
        )
        for _, _, _, back_rooms, facing_rooms in decisions
    ]
    back_rects = _split_rect(
        back_wing, cross_axis, zone_groups, minimum_spans=minimum_spans,
    )
    facing_rects = _split_rect(
        facing_wing, cross_axis, zone_groups, minimum_spans=minimum_spans,
    )

    bands: list[BandEntry] = [BandEntry(corridor_rect, [corridor], "shared-circulation")]
    regions: list[ArchetypeRegion] = []
    for decision, back_rect, facing_rect in zip(decisions, back_rects, facing_rects):
        zone, archetype, reason, back_rooms, facing_rooms = decision
        back_slots = _split_rect(back_rect, cross_axis, [[room] for room in back_rooms])
        facing_slots = _split_rect(facing_rect, cross_axis, [[room] for room in facing_rooms])
        bands.extend(
            BandEntry(rect, [room], zone.zone_id)
            for rect, room in zip(back_slots, back_rooms)
        )
        bands.extend(
            BandEntry(rect, [room], zone.zone_id)
            for rect, room in zip(facing_slots, facing_rooms)
        )
        regions.append(ArchetypeRegion(
            zone_id=zone.zone_id,
            archetype=archetype,
            reason=reason,
            room_ids=tuple(room.key for room in zone.rooms),
            spans=(back_rect, facing_rect),
        ))

    return BandPlan(
        bands=bands,
        corridor_rects=[(corridor.key, corridor_rect)],
        regions=regions,
    )
