from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: str = Field(min_length=1, max_length=2000)
    parent_id: str | None = None
    room_id: str | None = Field(default=None, max_length=96)
    x: float = Field(default=0.0, ge=-10_000, le=10_000)
    y: float = Field(default=0.0, ge=-10_000, le=10_000)
    z: float = Field(default=0.0, ge=-10_000, le=10_000)

    @field_validator("body")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Comment is empty")
        return value.strip()


class CommentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resolved: bool


class CommentOut(BaseModel):
    id: str
    parent_id: str | None
    body: str
    room_id: str | None
    x: float
    y: float
    z: float
    resolved: bool
    created_at: datetime
    author_id: str
    author_name: str
