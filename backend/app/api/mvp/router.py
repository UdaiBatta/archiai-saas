"""Phase 4 API orchestration for extraction, generation, validation, and save."""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.models.project import Project
from app.schemas.mvp import (
    ExtractRequest,
    ExtractResponse,
    GenerateMvpRequest,
    GenerateMvpResponse,
    HardQualitySnapshot,
    MvpQualitySnapshot,
    MvpValidationSyncResponse,
    MvpVersionCreateRequest,
    MvpVersionResponse,
    ValidateMvpRequest,
)
from app.services.auth_service import get_current_user
from app.services.clarification import apply_defaults_with_report, assess
from app.services.entitlement_service import (
    METRIC_GENERATIONS,
    enforce_and_increment_usage,
)
from app.services.extraction import ExtractionFailed, extract_requirements
from app.services.layout_engine import DoesNotFitError
from app.services.layout_engine.search import best_candidate
from app.services.llm_client import (
    LLMError,
    LLMInvalidOutput,
    LLMTimeout,
    LLMUnavailable,
)
from app.services.mvp_pipeline_service import (
    get_mvp_version,
    hard_quality_snapshot,
    quality_snapshot,
    quality_snapshot_with_layout,
    save_mvp_snapshot,
    understood_summary,
    version_response,
)
from app.services.workspace_service import require_project_edit_access
from app.services.parser.vastu import is_vastu_requested
from app.utils.activity import log_activity
from app.utils.rate_limit import rate_limit

router = APIRouter(prefix="/api", tags=["mvp-pipeline"])
_bearer = HTTPBearer(auto_error=False)


async def _current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> str:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await get_current_user(db, credentials.credentials)
    return str(user.id)


async def _workspace_id(db: AsyncSession, project_id: str | None) -> str | None:
    if project_id is None:
        return None
    project = await db.get(Project, project_id)
    return project.workspace_id if project is not None else None


def _clarification_error(result) -> HTTPException:
    return HTTPException(status_code=422, detail=result.model_dump(mode="json"))


@router.post(
    "/extract",
    response_model=ExtractResponse,
    dependencies=[Depends(rate_limit("mvp_extract", limit=10, window_seconds=60))],
)
async def extract_brief(
    request: ExtractRequest,
    _user_id: str = Depends(_current_user_id),
) -> ExtractResponse:
    try:
        requirements = await extract_requirements(request.prompt)
    except LLMTimeout as exc:
        raise HTTPException(
            status_code=504,
            detail="The AI provider took too long to respond. Please try again.",
        ) from exc
    except LLMInvalidOutput as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "The AI provider returned an invalid structured response. Try "
                "again or simplify the brief."
            ),
        ) from exc
    except LLMUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "The AI provider is unavailable. Check the LLM provider "
                "configuration (LLM_BASE_URL / LLM_API_KEY) and try again."
            ),
        ) from exc
    except LLMError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "The AI provider failed unexpectedly. Check the LLM provider "
                "configuration and try again."
            ),
        ) from exc
    except ExtractionFailed as exc:
        raise HTTPException(
            status_code=422,
            detail="The design brief could not be validated. Please rephrase it.",
        ) from exc

    decision = assess(requirements)
    return ExtractResponse(
        requirements=requirements,
        route=decision.route,
        questions=decision.questions,
        optional_missing=decision.optional_missing,
        understood_summary=understood_summary(requirements),
    )


@router.post(
    "/generate",
    response_model=GenerateMvpResponse,
    dependencies=[Depends(rate_limit("mvp_generate", limit=20, window_seconds=60))],
)
async def generate_mvp_layout(
    request: GenerateMvpRequest,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> GenerateMvpResponse:
    decision = assess(request.requirements)
    if decision.route != "generate":
        raise _clarification_error(decision)

    requirements = request.requirements
    defaults_applied: list[str] = []
    if request.use_defaults:
        defaulted = apply_defaults_with_report(requirements)
        requirements = defaulted.requirements
        defaults_applied = defaulted.defaults_applied

    # Fail authorization before charging quota or doing layout work. The save
    # service checks again at its own trust boundary.
    if request.project_id is not None:
        await require_project_edit_access(db, request.project_id, user_id)

    await enforce_and_increment_usage(
        db,
        user_id,
        METRIC_GENERATIONS,
        "max_generations_per_period",
    )
    try:
        layout = best_candidate(requirements)
    except DoesNotFitError as exc:
        raise _clarification_error(assess(requirements, fit_error=exc)) from exc

    quality = quality_snapshot(
        layout,
        requirements,
        include_vastu=is_vastu_requested(request.prompt or ""),
    )
    design_id = None
    version_id = None
    if request.project_id is not None:
        design, version = await save_mvp_snapshot(
            db,
            user_id=user_id,
            project_id=request.project_id,
            prompt=request.prompt,
            requirements=requirements,
            layout=layout,
            quality=quality,
            version_type="generated",
        )
        design_id = design.id
        version_id = version.id

    await log_activity(
        db,
        user_id,
        "design.generated",
        project_id=request.project_id,
        workspace_id=await _workspace_id(db, request.project_id),
    )
    return GenerateMvpResponse(
        requirements=requirements,
        layout=layout,
        quality=quality,
        defaults_applied=defaults_applied,
        designId=design_id,
        designVersionId=version_id,
    )


@router.post(
    "/validate",
    response_model=(
        MvpValidationSyncResponse | MvpQualitySnapshot | HardQualitySnapshot
    ),
    # The editor calls this on a 300 ms debounce while dragging, so the ceiling
    # is deliberately high — it exists to stop an abusive caller looping the
    # (CPU-bound, event-loop-blocking) validator, not to throttle real editing.
    dependencies=[Depends(rate_limit("mvp_validate", limit=120, window_seconds=60))],
)
async def validate_mvp_layout(
    request: ValidateMvpRequest,
    full: bool = False,
    vastu: bool = False,
    include_layout: bool = Query(default=False, alias="includeLayout"),
    _user_id: str = Depends(_current_user_id),
) -> MvpValidationSyncResponse | MvpQualitySnapshot | HardQualitySnapshot:
    if include_layout and not full:
        raise HTTPException(
            status_code=422,
            detail="includeLayout requires full quality scoring",
        )
    if full:
        if request.requirements is None:
            raise HTTPException(
                status_code=422,
                detail="Requirements are required for full quality scoring",
            )
        layout, quality = quality_snapshot_with_layout(
            request.layout,
            request.requirements,
            include_vastu=vastu,
        )
        if include_layout:
            return MvpValidationSyncResponse(layout=layout, quality=quality)
        return quality
    return hard_quality_snapshot(request.layout)


@router.post(
    "/projects/{project_id}/versions",
    response_model=MvpVersionResponse,
    status_code=201,
)
async def save_mvp_version(
    project_id: str,
    request: MvpVersionCreateRequest,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> MvpVersionResponse:
    layout, quality = quality_snapshot_with_layout(
        request.layout,
        request.requirements,
        include_vastu=is_vastu_requested(request.prompt or ""),
    )
    _, version = await save_mvp_snapshot(
        db,
        user_id=user_id,
        project_id=project_id,
        prompt=request.prompt,
        requirements=request.requirements,
        layout=layout,
        quality=quality,
        version_type="manual",
    )
    await log_activity(
        db,
        user_id,
        "layout.saved",
        project_id=project_id,
        workspace_id=await _workspace_id(db, project_id),
    )
    return version_response(version)


@router.get("/versions/{version_id}", response_model=MvpVersionResponse)
async def fetch_mvp_version(
    version_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> MvpVersionResponse:
    return await get_mvp_version(db, user_id=user_id, version_id=version_id)
