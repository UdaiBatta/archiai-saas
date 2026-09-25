"""LayoutPlan — the locked geometric contract of the MVP pipeline.

COORDINATE CONVENTION (stated here once; never restate it differently anywhere):
    Units are METERS, floats. Origin is the plot's NORTH-WEST corner.
    +x runs EAST, +y runs SOUTH. Plans are north-up.

Rooms are axis-aligned rectangles (x, y = their NW corner). ``rotation`` is
constrained to {0, 90, 180, 270}: the whole geometry stack (overlap tests,
subdivision, IFC/DXF export) is axis-aligned, and a 90° rotation is a w/h swap —
free angles are explicitly out of MVP scope (workflow Step 7.2).

Walls are deduplicated segments (one wall per shared edge, never two overlapping
ones). Doors reference their host wall by id — a door cannot float.

Rooms, walls, and doors carry a zero-based ``floor`` (default 0 for backward
compatibility). Coordinates are local to that floor; derived geometry never
connects objects merely because their 2D coordinates overlap on other levels.

Relationship to the legacy canvas JSON (archiai-saas in-place rework): this is
the new canonical contract for the MVP pipeline; converters map LayoutPlan.rooms
to the existing canvas objects (center-based x/z) so the current 3D editor keeps
working. Walls/doors are DERIVED artifacts — regenerated deterministically from
rooms after every edit, never hand-maintained state.

Rooms are rectangles UNLESS ``vertices`` is set (workflow Phase 8, polygon
boundary engine), in which case ``x/y/w/h`` is the bounding box only and
``vertices`` is the actual straight-edge outline. Likewise ``PlanPlot.boundary``
is None for a plain rectangular plot; when set, ``width_m``/``depth_m`` are the
boundary's bounding box. Curves are out of scope — a vertex list cannot encode
one, so there is nothing further to validate for that constraint.

``PlanRoom.type`` (engine generalization workflow, migration-order item 4):
a free string, not the closed ``RoomType`` enum — same bound as
``requirements.SpaceRequest.space_type`` (min/max length only), validated
against ``services.catalog.SpaceCatalog`` at the service boundary rather than
here, matching that field's own established precedent. The wire format is
unaffected for every existing residential value: Pydantic normalizes a
``RoomType`` member passed in (e.g. ``RoomType.bedroom``) to its plain string
(``"bedroom"``) either way, so this is additive, not a breaking rename — the
field name stays ``type``, not ``space_type``, so persisted layouts and the
frontend contract keep reading the same key.
"""
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    field_validator,
    model_serializer,
    model_validator,
)

from app.schemas.requirements import Facing, Vertex, _reject_string_number

Meters = Annotated[float, Field(gt=0, lt=200)]
Coord = Annotated[float, Field(ge=-200, le=200)]


class PlanPlot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width_m: Meters
    depth_m: Meters
    facing: Facing = Facing.east
    boundary: list[Vertex] | None = None


class PlanZoneSpan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: Coord
    y: Coord
    w: Meters
    h: Meters


class ArchetypeReason(BaseModel):
    model_config = ConfigDict(extra="forbid")

    zone_id: str = Field(min_length=1, max_length=96)
    archetype: str = Field(min_length=1, max_length=64)
    reason: str = Field(min_length=1, max_length=500)
    room_ids: list[str] = Field(min_length=1)
    spans: list[PlanZoneSpan] = Field(min_length=1)


class PlanRoom(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    type: str = Field(min_length=1, max_length=64)
    label: str
    x: Coord
    y: Coord
    w: Meters
    h: Meters
    rotation: Literal[0, 90, 180, 270] = 0
    vertices: list[Vertex] | None = None
    floor: StrictInt = Field(default=0, ge=0, le=20)
    zone_id: str | None = Field(default=None, min_length=1, max_length=96)

    @field_validator("x", "y", "w", "h", mode="before")
    @classmethod
    def _no_string_dims(cls, value: object) -> object:
        return _reject_string_number(value)

    @model_validator(mode="after")
    def _no_rotation_with_vertices(self) -> "PlanRoom":
        if self.vertices is not None and self.rotation != 0:
            raise ValueError("rotation must be 0 for a polygon room (vertices set)")
        return self

    @model_serializer(mode="wrap")
    def _omit_legacy_zone_id(self, handler):
        payload = handler(self)
        if self.zone_id is None:
            payload.pop("zone_id", None)
        return payload


class Wall(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    x1: Coord
    y1: Coord
    x2: Coord
    y2: Coord
    thickness: float = Field(default=0.115, gt=0, lt=1)
    floor: StrictInt = Field(default=0, ge=0, le=20)
    # "open" = the two rooms share this edge with no wall and no door (open
    # plan). Kept in the list so the editor can toggle it and the validator
    # can treat it as a connection; renderers must skip it.
    kind: Literal["wall", "open"] = "wall"
    # The two room ids an interior wall separates; None on the boundary.
    rooms: list[str] | None = Field(default=None, min_length=2, max_length=2)

    @model_serializer(mode="wrap")
    def _omit_boundary_rooms(self, handler):
        payload = handler(self)
        if self.rooms is None:
            payload.pop("rooms", None)
        return payload


class Door(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    wall_ref: str  # Wall.id hosting this door — doors never float
    offset: float = Field(ge=0)  # meters from the wall's (x1, y1) end
    width: float = Field(default=0.9, gt=0, lt=3)
    floor: StrictInt = Field(default=0, ge=0, le=20)


class Connection(BaseModel):
    """A user's choice for how two adjacent rooms meet, overriding the
    engine's default when walls/doors are re-derived: a solid wall, a wall
    with a door (``at`` = door centre as a 0..1 fraction along the shared
    edge, None = centred), or fully open."""

    model_config = ConfigDict(extra="forbid")

    room_a: str = Field(min_length=1, max_length=96)
    room_b: str = Field(min_length=1, max_length=96)
    kind: Literal["wall", "door", "open"]
    at: float | None = Field(default=None, ge=0, le=1)

    @model_validator(mode="after")
    def _distinct_rooms(self) -> "Connection":
        if self.room_a == self.room_b:
            raise ValueError("a connection needs two different rooms")
        return self


class LayoutPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plot: PlanPlot
    # Bounded because `quality.hard_constraints.validate` is O(n^2) in the room
    # count (pairwise overlap) and emits one Violation per overlapping pair — an
    # unbounded list let a single /api/validate request burn ~48 s of CPU on the
    # event loop and build millions of violation objects. 200 is ~14x the largest
    # real fixture (4bhk: 14 rooms), so it bounds the validator without
    # constraining any layout the engine can actually produce.
    rooms: list[PlanRoom] = Field(default_factory=list, max_length=200)
    walls: list[Wall] = Field(default_factory=list, max_length=2000)
    doors: list[Door] = Field(default_factory=list, max_length=2000)
    archetype_reasons: list[ArchetypeReason] | None = None
    connections: list[Connection] = Field(default_factory=list, max_length=2000)
    # The building's outline on the plot (the rest is yard). None = the
    # building fills the plot, as hand-built and polygon plans do.
    footprint: PlanZoneSpan | None = None

    @model_serializer(mode="wrap")
    def _omit_optional_fields(self, handler):
        payload = handler(self)
        if self.footprint is None:
            payload.pop("footprint", None)
        if self.archetype_reasons is None:
            payload.pop("archetype_reasons", None)
        if not self.connections:
            payload.pop("connections", None)
        return payload
