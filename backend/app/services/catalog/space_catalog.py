"""Phase 1 — SpaceCatalog: one free-string-keyed registry replacing the
12-value residential `RoomType` enum as the engine's vocabulary ground truth.

Merges the three sizing/vocab sources the audit (`scripts/audit_catalog.py`)
found disagreeing: `mvp_defaults.ROOM_SIZING` (12 residential types, has real
min_w/min_d but a narrow, conflicting area table), `parser/data/size_rules
.BASE_SIZES` (37 free-string types incl. non-residential, area only), and the
zone/wet/daylight classification frozensets already living in
`planning/program_graph.py` / `planning/program_validation.py`.

Resolution rule (stated once, applied uniformly — see the audit script for
the full conflict table): BASE_SIZES is authoritative for
`preferred_area_m2` (broader vocabulary, actively maintained by the
pattern-data pipeline); ROOM_SIZING is authoritative for `min_w`/`min_d`
where a residential type has both. A BASE_SIZES-only type with no ROOM_SIZING
minimum gets one derived from its area (assuming a near-square minimum at
60% of preferred area, floored at 1.2 m) rather than left undefined.

This module owns classification going forward; `program_graph.py`'s
`_classify_*` helpers keep their own copies for now (Phase 1.2 wires the
delegation) so this slice stays purely additive — nothing existing changes.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, replace
from difflib import get_close_matches

from app.config.mvp_defaults import ROOM_SIZING
from app.schemas.requirements import RoomRequest, SpaceRequest
from app.services.parser.data.room_vocabulary import ROOM_TERMS
from app.services.parser.data.size_rules import BASE_SIZES
from app.services.parser.data.synonyms import SYNONYMS

# RoomType enum key -> the free-string catalog key it's an alias of, only
# where the names differ (most match exactly: bedroom, bathroom, kitchen...).
_ENUM_ALIAS_OF = {
    "dining": "dining_room",
    "entry": "foyer",
    "utility": "laundry",
    "parking": "garage",
}

_CIRCULATION_TYPES = frozenset({
    "hallway", "corridor", "entry", "foyer", "lobby", "staircase", "stairs",
    "lift", "elevator",
    "passage", "passageway", "landing", "atrium",
})
_SERVICE_TYPES = frozenset({
    "bathroom", "ensuite", "toilet", "washroom", "wc", "laundry", "storage",
    "utility", "garage", "mudroom", "pantry", "mechanical", "plant", "shaft",
    "store_room", "stock_room",
})
# Rooms nobody should have to walk THROUGH to get somewhere else: you reach
# them, you don't pass through them. (Bathrooms and bedrooms are covered by
# the privacy rule; a mudroom is a passage by design, so it isn't listed.)
NO_THROUGH_TYPES = frozenset({
    "kitchen", "kitchenette", "laundry", "utility", "pantry", "garage",
    "storage", "store_room", "stock_room", "mechanical", "plant",
})
_WET_TYPES = frozenset({
    "bathroom", "ensuite", "toilet", "washroom", "wc", "kitchen", "kitchenette",
    "laundry", "utility", "pantry",
})
_DAYLIGHT_TYPES = frozenset({
    "bedroom", "master_bedroom", "kids_room", "living_room", "open_plan_living",
    "office", "classroom", "consultation_room", "workspace", "dining_room",
    "study", "reception", "waiting_room", "meeting_room",
})
_PUBLIC_TYPES = frozenset({
    "living_room", "open_plan_living", "kitchen", "dining_room", "dining_area",
    "foyer", "reception", "waiting_room", "retail_display", "checkout", "bar",
    "sales_floor", "classroom", "lobby",
})
_PRIVATE_TYPES = frozenset({
    "master_bedroom", "bedroom", "kids_room", "ensuite", "office",
    "consultation_room", "workspace", "meeting_room", "pooja_room",
    "meditation_room", "study",
})
_OUTDOOR_TYPES = frozenset({"garden", "courtyard", "yard"})
_SEMI_OUTDOOR_TYPES = frozenset({"balcony", "terrace", "porch", "veranda"})

_MIN_DIMENSION_FLOOR_M = 1.2
_MIN_AREA_FRACTION_OF_PREFERRED = 0.6
_DEFAULT_MAX_ASPECT = 2.5

# Workflow Phase 4.2 — corridor min width by context. Only "residential" is
# actually consumed yet (by `_build_catalog` below, for the default
# CATALOG["corridor"]/["hallway"] entries): nothing upstream (RequirementsSpec,
# EngineProgram) carries a commercial/accessibility context flag through to
# `program_completion.ensure_corridor` yet, so those two remain named,
# documented constants ready for that wiring rather than dead numbers, not a
# claim that building-type-aware width selection is live end-to-end.
CIRCULATION_WIDTHS: dict[str, float] = {
    "residential": 1.0,
    "commercial": 1.5,
    "accessible": 1.8,
}
_CIRCULATION_MIN_LENGTH_M = 1.5  # a floor, not the target — real length comes
# from preferred_area_m2 / carving (workflow 4.3), same as every other room.


@dataclass(frozen=True)
class SpaceType:
    key: str
    label: str
    node_type: str
    zone: str
    min_w: float
    min_d: float
    preferred_area_m2: float
    max_aspect: float = _DEFAULT_MAX_ASPECT
    wet_room: bool = False
    needs_exterior: bool = False
    privacy_level: int = 0
    circulation_weight: float = 1.0


class UnknownSpaceType(KeyError):
    """Raised by get() for a key not in the catalog and not a known alias.

    Carries a nearest-match suggestion so callers/clarification flows can
    offer it back to the user instead of a bare KeyError.
    """

    def __init__(self, key: str, suggestion: str | None):
        self.key = key
        self.suggestion = suggestion
        message = f"Unknown space type: {key!r}"
        if suggestion:
            message += f" (did you mean {suggestion!r}?)"
        super().__init__(message)


def _zone_for(key: str) -> str:
    if key in _OUTDOOR_TYPES:
        return "outdoor"
    if key in _SEMI_OUTDOOR_TYPES:
        return "outdoor"
    if key in _CIRCULATION_TYPES:
        return "circulation"
    if key in _SERVICE_TYPES:
        return "service"
    if key in _PUBLIC_TYPES:
        return "public"
    if key in _PRIVATE_TYPES:
        return "private"
    return "public"


def _node_type_for(key: str) -> str:
    if key in _CIRCULATION_TYPES:
        return "circulation"
    if key in _SERVICE_TYPES:
        return "service"
    return "space"


def _privacy_level_for(key: str) -> int:
    if key in _PUBLIC_TYPES or key in _CIRCULATION_TYPES:
        return 0
    if key in _SERVICE_TYPES:
        return 1
    if key in _PRIVATE_TYPES:
        return 2
    return 0


def _circulation_weight_for(key: str) -> float:
    return 2.0 if key in _CIRCULATION_TYPES else 1.0


def _derive_min_dimensions(preferred_area_m2: float, max_aspect: float) -> tuple[float, float]:
    """A near-square minimum at a fraction of preferred area — used only when
    no ROOM_SIZING minimum exists for this type. Not a claim of correctness
    for every space type, just a bounded, documented default."""
    min_area = preferred_area_m2 * _MIN_AREA_FRACTION_OF_PREFERRED
    side = math.sqrt(min_area / max_aspect) if max_aspect > 0 else math.sqrt(min_area)
    long_side = min_area / side if side > 0 else _MIN_DIMENSION_FLOOR_M
    min_d = max(_MIN_DIMENSION_FLOOR_M, round(side, 2))
    min_w = max(_MIN_DIMENSION_FLOOR_M, round(long_side, 2))
    return min_w, min_d


def _build_catalog() -> dict[str, SpaceType]:
    room_sizing_by_free_key: dict[str, tuple[float, float]] = {}
    for room_type, sizing in ROOM_SIZING.items():
        free_key = _ENUM_ALIAS_OF.get(room_type.value, room_type.value)
        room_sizing_by_free_key[free_key] = (sizing.min_w, sizing.min_d)
    # Circulation spine types get a real narrow-and-long minimum instead of
    # `_derive_min_dimensions`'s generic near-square formula (which would
    # give a corridor a ~3m-square minimum — architecturally wrong for
    # something meant to be a thin strip).
    for spine_key in ("corridor", "hallway"):
        room_sizing_by_free_key[spine_key] = (CIRCULATION_WIDTHS["residential"], _CIRCULATION_MIN_LENGTH_M)
    room_sizing_by_free_key["staircase"] = (2.4, 1.2)
    room_sizing_by_free_key["lift"] = (1.8, 1.8)

    catalog: dict[str, SpaceType] = {}
    for key, area in BASE_SIZES.items():
        minimum = room_sizing_by_free_key.get(key)
        min_w, min_d = minimum if minimum else _derive_min_dimensions(area, _DEFAULT_MAX_ASPECT)
        catalog[key] = SpaceType(
            key=key,
            label=key.replace("_", " ").title(),
            node_type=_node_type_for(key),
            zone=_zone_for(key),
            min_w=min_w,
            min_d=min_d,
            preferred_area_m2=area,
            wet_room=key in _WET_TYPES,
            needs_exterior=key in _DAYLIGHT_TYPES,
            privacy_level=_privacy_level_for(key),
            circulation_weight=_circulation_weight_for(key),
        )
    return catalog


CATALOG: dict[str, SpaceType] = _build_catalog()

# Enum-name aliases ("dining" -> "dining_room") resolve through the same
# lookup as any other alias text.
_ALIAS_TO_CANONICAL: dict[str, str] = dict(_ENUM_ALIAS_OF)
_ALIAS_TO_CANONICAL.update({"stairs": "staircase", "elevator": "lift"})
for alias, target in SYNONYMS.items():
    normalized_target = target.strip().lower().replace(" ", "_").replace("-", "_")
    if normalized_target in CATALOG:
        _ALIAS_TO_CANONICAL[alias.strip().lower().replace(" ", "_").replace("-", "_")] = normalized_target
for canonical, terms in ROOM_TERMS.items():
    if canonical in CATALOG:
        for term in terms:
            _ALIAS_TO_CANONICAL[term.strip().lower().replace(" ", "_").replace("-", "_")] = canonical

INFERRED_CONFIDENCE_FLOOR = 0.75
_INFERRED_AREA_MIN_M2 = 2.0
_INFERRED_AREA_MAX_M2 = 200.0


def resolve_alias(text: str) -> str | None:
    """Best-effort resolution of free text to a canonical catalog key.

    Tries an exact canonical-key match first, then the enum-name alias map.
    Does not guess — returns None rather than a low-confidence match, per
    the repo's existing "reject, never invent" principle.
    """
    normalized = text.strip().lower().replace(" ", "_").replace("-", "_")
    if normalized in CATALOG:
        return normalized
    return _ALIAS_TO_CANONICAL.get(normalized)


def get(key: str) -> SpaceType:
    normalized = key.strip().lower().replace(" ", "_").replace("-", "_")
    if normalized in CATALOG:
        return CATALOG[normalized]
    resolved = resolve_alias(normalized)
    if resolved and resolved in CATALOG:
        return CATALOG[resolved]
    suggestions = get_close_matches(normalized, CATALOG.keys(), n=1)
    raise UnknownSpaceType(key, suggestions[0] if suggestions else None)


def register(space: SpaceType) -> None:
    """Runtime extension for a space type nobody templated yet. Callers are
    responsible for supplying sane values (this module does not clamp or
    validate them) — the clarification-flow-vs-guess decision belongs to the
    caller (e.g. extraction service), not this registry."""
    CATALOG[space.key] = space


def ensure_registered(
    request: SpaceRequest,
    *,
    plot_area_m2: float | None = None,
) -> str:
    """Return a canonical key, registering a self-describing unknown one.

    Unknown requests without a confident zone and size remain hard failures;
    callers can route that failure to clarification. Area guesses are bounded
    to 40% of a known plot so one inferred space cannot consume the envelope.
    """
    resolved = resolve_alias(request.space_type)
    if resolved is not None:
        return resolved
    if (
        request.zone_guess is None
        or request.size_guess_m2 is None
        or request.confidence is None
        or request.confidence < INFERRED_CONFIDENCE_FLOOR
    ):
        suggestions = get_close_matches(
            request.space_type.strip().lower().replace(" ", "_").replace("-", "_"),
            CATALOG.keys(),
            n=1,
        )
        raise UnknownSpaceType(request.space_type, suggestions[0] if suggestions else None)

    key = request.space_type.strip().lower().replace(" ", "_").replace("-", "_")
    area_cap = _INFERRED_AREA_MAX_M2
    if plot_area_m2 is not None:
        area_cap = max(_INFERRED_AREA_MIN_M2, min(area_cap, plot_area_m2 * 0.4))
    area = round(max(_INFERRED_AREA_MIN_M2, min(request.size_guess_m2, area_cap)), 2)
    min_w, min_d = _derive_min_dimensions(area, _DEFAULT_MAX_ASPECT)
    zone = request.zone_guess
    node_type = "circulation" if zone == "circulation" else (
        "service" if zone in {"service", "technical"} else "space"
    )
    privacy_level = 2 if zone == "private" else (
        1 if zone in {"semi_private", "service", "technical"} else 0
    )
    register(SpaceType(
        key=key,
        label=key.replace("_", " ").title(),
        node_type=node_type,
        zone=zone,
        min_w=min_w,
        min_d=min_d,
        preferred_area_m2=area,
        privacy_level=privacy_level,
        circulation_weight=2.0 if zone == "circulation" else 1.0,
    ))
    return key


def min_dimensions(key: str, default: tuple[float, float] = (1.2, 1.2)) -> tuple[float, float]:
    """(min_w, min_d) for a lenient, best-effort lookup — never raises.

    For editor-sync / validation paths (``rebuild_derived_geometry``,
    ``hard_constraints.validate``) that must keep working even for a room
    type nobody templated, matching ``EngineProgram._resolve_sizing``'s own
    established leniency for hand-built/user-added graphs. A caller that
    needs to REJECT an unknown type outright (the actual generation-request
    boundary) should call :func:`get` directly instead — see
    ``program_graph.from_requirements``.
    """
    try:
        space = get(key)
    except UnknownSpaceType:
        return default
    return space.min_w, space.min_d


def zone_for(key: str, default: str = "semi_private") -> str:
    """Lenient, never-raises zone lookup — same rationale/fallback pattern as
    :func:`min_dimensions`, used by ``engine.rebuild_derived_geometry`` so an
    edited/unknown room type still gets a reasonable door-placement zone
    instead of crashing."""
    try:
        return get(key).zone
    except UnknownSpaceType:
        return default


def privacy_level_for(key: str, default: int = 0) -> int:
    """Lenient, never-raises privacy-level lookup — same pattern as
    :func:`zone_for`/:func:`min_dimensions`. Used by
    ``hard_constraints``'s ``through_room_access`` check (workflow Phase
    4.5), which must keep validating an edited/unknown room type rather
    than crashing on it."""
    try:
        return get(key).privacy_level
    except UnknownSpaceType:
        return default


def with_overrides(key: str, **overrides: object) -> SpaceType:
    """Convenience for a caller that wants a variant of a known type (e.g. an
    explicit area override) without mutating the shared catalog entry."""
    return replace(get(key), **overrides)


def spaces_from_rooms(rooms: list[RoomRequest]) -> list[SpaceRequest]:
    """Phase 1.2 migration order item 1: lossless `RoomRequest` -> `SpaceRequest`
    mapping. All 12 `RoomType` enum values are catalog keys (via `get()`'s
    alias resolution), so this never drops or invents a room — a mismatch
    here is a bug in the catalog seed, not something to silently swallow."""
    return [
        SpaceRequest(space_type=get(room.type.value).key, count=room.count)
        for room in rooms
    ]
