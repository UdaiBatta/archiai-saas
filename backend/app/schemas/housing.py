"""Housing inside a mass (roadmap P3): fill a massing floor plate with units
around a core, to a target unit mix, and report the yield.

Coordinates are plan metres, the same NW-origin convention as LayoutPlan
(x east, y south). The frontend's site/mass points are {x, z}; z maps to y.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.layout_plan import LayoutPlan
from app.schemas.requirements import Facing, Vertex

UnitType = Literal["studio", "1bhk", "2bhk", "3bhk", "4bhk"]


class UnitMixEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    unit_type: UnitType
    # Target share of units (not of area), 0..1; shares are normalised.
    share: float = Field(gt=0, le=1)


class HousingUnit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    floor: int = Field(ge=0, le=60)
    unit_type: UnitType
    # The unit's boundary on its floor plate (a rectangle today, 4 points).
    outline: list[Vertex] = Field(min_length=3)
    area_m2: float = Field(ge=0)
    # Rooms, walls, doors and windows inside the unit, in plate coordinates.
    plan: LayoutPlan
    locked: bool = False


class HousingFillRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The mass footprint (one floor plate), at least 3 points.
    footprint: list[Vertex] = Field(min_length=3, max_length=64)
    floors: int = Field(ge=1, le=40)
    floor_height_m: float = Field(ge=2.4, le=6)
    mix: list[UnitMixEntry] = Field(min_length=1, max_length=5)
    # Street side: the core and entrance face it when there is a choice.
    facing: Facing | None = None
    corridor_width_m: float = Field(default=1.5, ge=1.2, le=3)
    # Units to keep exactly as they are (re-solve honours locks).
    locked_units: list[HousingUnit] = Field(default_factory=list, max_length=2000)

    @model_validator(mode="after")
    def _distinct_mix(self) -> "HousingFillRequest":
        types = [entry.unit_type for entry in self.mix]
        if len(types) != len(set(types)):
            raise ValueError("each unit type may appear once in the mix")
        return self


class HousingYield(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_units: int
    units_by_type: dict[str, int]
    # Achieved share of units per type, 0..1 (compare with the requested mix).
    mix_achieved: dict[str, float]
    gfa_m2: float  # floor plate area x floors
    nsa_m2: float  # sum of unit areas (net saleable)
    efficiency: float  # nsa / gfa, 0..1


class HousingFillResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    units: list[HousingUnit]
    # Stair/lift core and corridor outlines, per floor (same on every floor).
    cores: list[list[Vertex]]
    corridors: list[list[Vertex]]
    yield_: HousingYield = Field(alias="yield")
    warnings: list[str] = Field(default_factory=list)
