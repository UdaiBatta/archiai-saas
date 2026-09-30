"""Automatic furnishing contract (roadmap P3: furniture checked against clearances).

Same frame as ``LayoutPlan``: metres, origin NW, +x east, +y south.
``x``/``y`` is the item's CENTRE; ``w`` is its width and ``d`` its depth in
its own frame (``w`` runs along the wall it backs onto). ``rotation`` turns
the item about the vertical axis the way the 3D editor does: 0 = back to the
north, front facing south; 90 = front facing east; 180 = north; 270 = west.
"""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.layout_plan import LayoutPlan


class FurnitureItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    room_id: str
    kind: str
    x: float
    y: float
    w: float = Field(gt=0)
    d: float = Field(gt=0)
    rotation: Literal[0, 90, 180, 270] = 0
    floor: int = Field(default=0, ge=0)


class FurnishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    layout: LayoutPlan


class FurnishResponse(BaseModel):
    items: list[FurnitureItem]
    warnings: list[str]
