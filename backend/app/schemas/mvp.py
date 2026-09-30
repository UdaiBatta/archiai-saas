"""API contracts for the additive local-LLM MVP pipeline (Phase 4)."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.design import MAX_PROMPT_LENGTH
from app.schemas.layout_plan import LayoutPlan
from app.schemas.quality_report import QualityReport, Violation
from app.schemas.requirements import RequirementsSpec


class ExtractRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_LENGTH)


class ExtractResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requirements: RequirementsSpec
    route: Literal["vague", "generate", "conflict"]
    questions: list[str] = Field(default_factory=list)
    optional_missing: list[str] = Field(default_factory=list)
    understood_summary: list[str] = Field(default_factory=list)


class HardQualitySnapshot(BaseModel):
    """Phase 4's reject-tier result; Phase 6 adds score and soft warnings."""

    model_config = ConfigDict(extra="forbid")

    valid: bool
    hard_violations: list[Violation] = Field(default_factory=list)


class MvpQualitySnapshot(QualityReport):
    """Full Phase 6 report plus the Phase 4 ``valid`` compatibility flag."""

    valid: bool


class MvpValidationSyncResponse(BaseModel):
    """Full quality plus server-rebuilt derived geometry for live editors."""

    model_config = ConfigDict(extra="forbid")

    layout: LayoutPlan
    quality: MvpQualitySnapshot


class GenerateMvpRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    requirements: RequirementsSpec
    use_defaults: bool = Field(default=False, alias="useDefaults")
    project_id: str | None = Field(default=None, alias="projectId")
    prompt: str | None = Field(default=None, max_length=MAX_PROMPT_LENGTH)


class OptionsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requirements: RequirementsSpec
    count: int = Field(default=3, ge=1, le=5)


class LayoutOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    layout: LayoutPlan
    score: int
    highlights: list[str]


class OptionsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    options: list[LayoutOption]
    warnings: list[str] = Field(default_factory=list)


class GenerateMvpResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    requirements: RequirementsSpec
    layout: LayoutPlan
    quality: MvpQualitySnapshot
    defaults_applied: list[str] = Field(default_factory=list)
    design_id: str | None = Field(default=None, alias="designId")
    design_version_id: str | None = Field(default=None, alias="designVersionId")
    # Geometrically distinct runners-up from the best-of-64 candidate search,
    # each already converted to the legacy canvas layout JSON (plus a `score`
    # field) so the options gallery can load them directly. Empty for
    # polygon-boundary and multi-floor programmes — those have a
    # single-layout search space, and the UI says so honestly.
    alternatives: list[dict[str, Any]] = Field(default_factory=list)


class ValidateMvpRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    layout: LayoutPlan
    requirements: RequirementsSpec | None = None


class MvpVersionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str | None = Field(default=None, max_length=MAX_PROMPT_LENGTH)
    requirements: RequirementsSpec
    layout: LayoutPlan
    # Accepted for wire compatibility, but the backend always recomputes it.
    quality: MvpQualitySnapshot | HardQualitySnapshot | None = None


class MvpVersionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str
    design_id: str = Field(alias="designId")
    project_id: str = Field(alias="projectId")
    version_number: int = Field(alias="versionNumber")
    prompt: str | None = None
    requirements: RequirementsSpec
    layout: LayoutPlan
    quality: MvpQualitySnapshot | HardQualitySnapshot
    created_at: datetime = Field(alias="createdAt")
