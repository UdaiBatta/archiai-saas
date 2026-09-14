import json
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

# Payload caps (Phase 0 H4) — bound untrusted input so a single request can't
# exhaust memory/DB. A prompt is a short brief; a serialized layout of hundreds
# of rooms is still well under this.
MAX_PROMPT_LENGTH = 2000
MAX_LAYOUT_JSON_BYTES = 2_000_000


def _validate_layout_size(value: dict[str, Any]) -> dict[str, Any]:
    if len(json.dumps(value).encode("utf-8")) > MAX_LAYOUT_JSON_BYTES:
        raise ValueError("Layout payload is too large")
    return value


class DesignParams(BaseModel):
    """
    Explicit parametric overrides for layout generation, alongside the prompt.
    All fields are optional; when omitted the engine falls back to its existing
    prompt-inferred behaviour. plot_width_m, floors, orientation, and vastu all
    affect generated geometry; plot_depth_m scales the plan's depth as one
    affine transform (clamped to sane proportions), so an explicit plot is
    respected without creating gaps or overlaps.
    """

    plot_width_m: float | None = Field(default=None, alias="plotWidthM", gt=0)
    plot_depth_m: float | None = Field(default=None, alias="plotDepthM", gt=0)
    floors: int | None = Field(default=None, ge=1, le=6)
    orientation: str | None = None
    """Road-facing / entry side: one of N, S, E, W. Defaults to S (front wall) when omitted."""
    vastu: bool | None = None

    model_config = {"populate_by_name": True}


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=5, max_length=MAX_PROMPT_LENGTH)
    project_id: str | None = Field(default=None, alias="projectId")
    design_params: DesignParams | None = Field(default=None, alias="designParams")

    model_config = {"populate_by_name": True}


class SaveDesignRequest(BaseModel):
    layout: dict[str, Any]
    version_name: str | None = Field(default=None, alias="versionName")
    change_summary: str | None = Field(default=None, alias="changeSummary")
    thumbnail_url: str | None = Field(default=None, alias="thumbnailUrl")

    model_config = {"populate_by_name": True}

    _check_layout_size = field_validator("layout")(_validate_layout_size)


class DesignDraftSaveRequest(BaseModel):
    layout: dict[str, Any]

    _check_layout_size = field_validator("layout")(_validate_layout_size)


class RefineRequest(BaseModel):
    design_id: str = Field(..., alias="designId")
    prompt: str = Field(..., min_length=3, max_length=MAX_PROMPT_LENGTH)
    current_layout: dict[str, Any] | None = Field(default=None, alias="currentLayout")

    model_config = {"populate_by_name": True}

    @field_validator("current_layout")
    @classmethod
    def check_current_layout(cls, value):
        if value is not None:
            _validate_layout_size(value)
            # Use the same canvas contract as generation/save responses. Do not
            # let malformed client snapshots reach the refinement engine.
            GenerateResponse.model_validate(value)
        return value


class RoomPosition(BaseModel):
    x: float
    y: float
    z: float


class RoomSize(BaseModel):
    w: float
    h: float
    d: float


class RoomRotation(BaseModel):
    x: float
    y: float
    z: float


class RoomResponse(BaseModel):
    id: str
    label: str
    roomType: str | None = None
    objectType: str | None = None
    floorId: str | None = None
    floorLevel: int | None = None
    zone: str | None = None
    # Hosted openings must retain their wall relationship through save/load,
    # version restore, refinement and share responses.
    hostWallId: str | None = None
    position: RoomPosition
    size: RoomSize
    rotation: RoomRotation | None = None
    color: str


class GenerateMetadata(BaseModel):
    pipeline: str | None = None
    prompt: str | None = None
    building_type: str | None = None
    buildingType: str | None = None
    style: str | None = None
    room_count: int | None = None
    totalFloors: int | None = None
    totalRooms: int | None = None
    totalObjects: int | None = None
    totalAreaSqm: float | None = None
    requestedAreaSqm: float | None = None
    patternDataUsed: bool | None = None
    patternDataSource: str | None = None
    zonesDetected: list[str] | None = None
    template: str | None = None
    templateStrategy: str | None = None
    designParams: dict[str, Any] | None = None
    placementEngine: str | None = None
    candidateCount: int | None = None
    graphSatisfaction: dict[str, Any] | None = None
    orientation: dict[str, Any] | None = None
    programConstraints: dict[str, Any] | None = None
    program: dict[str, Any] | None = None
    programValidation: dict[str, Any] | None = None
    mvpRequirements: dict[str, Any] | None = None
    mvpQuality: dict[str, Any] | None = None
    mvpVastuEnabled: bool | None = None


class BuildingResponse(BaseModel):
    floorHeight: float


class FloorFootprint(BaseModel):
    x: float
    z: float
    w: float
    d: float


class FloorResponse(BaseModel):
    id: str
    name: str
    level: int
    elevation: float
    footprint: FloorFootprint | None = None
    rooms: list[RoomResponse]


class GenerationInsights(BaseModel):
    score: int
    reasons: list[str]
    warnings: list[str]
    appliedRules: list[str]


class LayoutOption(BaseModel):
    """A full candidate layout that did not win — surfaced to the user as a
    pickable option in the generate response (Sprint 17 Phase 4 option
    gallery), instead of being discarded as soon as the scorer picks a
    winner."""

    version: str
    metadata: GenerateMetadata
    building: BuildingResponse | None = None
    floors: list[FloorResponse] | None = None
    rooms: list[RoomResponse]
    insights: GenerationInsights | None = None


class GenerateResponse(BaseModel):
    version: str
    designId: str | None = None
    designVersionId: str | None = None
    metadata: GenerateMetadata
    building: BuildingResponse | None = None
    floors: list[FloorResponse] | None = None
    rooms: list[RoomResponse]
    insights: GenerationInsights | None = None
    alternatives: list[LayoutOption] | None = None


class RefinementChange(BaseModel):
    action: Literal["resize", "remove", "add"]
    objectId: str
    roomType: str
    label: str
    floorLevel: int
    description: str


class RefineResponse(GenerateResponse):
    refinementSummary: str
    refinementChanges: list[RefinementChange] = Field(default_factory=list)


class DesignDraftResponse(GenerateResponse):
    id: str
    projectId: str
    versionNumber: int
    versionType: str
    changeSummary: str | None = None
    createdAt: datetime
    metadata: dict[str, Any]
