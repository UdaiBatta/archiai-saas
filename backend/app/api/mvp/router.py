"""Phase 4 API orchestration for extraction, generation, validation, and save."""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.models.project import Project
from app.schemas.mvp import (
    AssistantRequest,
    AssistantResponse,
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
from app.services.assistant import plan_edits
from app.services.extraction import ExtractionFailed, extract_requirements
from app.services.layout_adapter import layout_plan_to_canvas
from app.services.layout_engine import DoesNotFitError
from app.services.layout_engine.engine import generate_plan
from app.services.layout_engine.search import generate_candidates
from app.services.quality.scorer import score as score_layout
from app.services.llm_client import (
    LLMError,
    LLMInvalidOutput,
    LLMRateLimited,
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


_MAX_ALTERNATIVES = 3


def _geometry_signature(plan) -> tuple:
    """Rounded room rectangles. Two candidates with identical geometry are the
    same layout for the options gallery, however different their room order
    was inside the search."""
    return tuple(
        sorted(
            (room.type, round(room.x, 2), round(room.y, 2), round(room.w, 2), round(room.h, 2))
            for room in plan.rooms
        )
    )


def _generate_with_alternatives(requirements):
    """Best-of-64 winner plus up to three geometrically distinct runners-up,
    each already in the legacy canvas layout shape (+ a `score`) so the
    options gallery can swap them in directly. Polygon-boundary and
    multi-floor programmes have a single-layout search space — no
    alternatives there."""
    if requirements.plot.boundary is not None or requirements.floors > 1:
        return generate_plan(requirements), []
    candidates = generate_candidates(requirements)
    if not candidates:
        raise DoesNotFitError("no candidate could be generated")
    winner = candidates[0].plan
    alternatives: list[dict] = []
    seen = {_geometry_signature(winner)}
    for candidate in candidates[1:]:
        if len(alternatives) >= _MAX_ALTERNATIVES:
            break
        signature = _geometry_signature(candidate.plan)
        if signature in seen:
            continue
        seen.add(signature)
        canvas = layout_plan_to_canvas(candidate.plan)
        canvas["score"] = round(
            score_layout(candidate.plan, requirements, include_vastu=False).score, 1
        )
        alternatives.append(canvas)
    return winner, alternatives


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
    "/assistant/plan-edits",
    response_model=AssistantResponse,
    dependencies=[Depends(rate_limit("assistant", limit=10, window_seconds=60))],
)
async def assistant_plan_edits(
    request: AssistantRequest,
    _user_id: str = Depends(_current_user_id),
) -> AssistantResponse:
    """Propose (never save) an edit from a plain-language instruction."""
    try:
        result = await plan_edits(
            request.instruction,
            request.layout,
            request.requirements,
            request.selected_room_id,
        )
    except LLMRateLimited as exc:
        raise HTTPException(
            status_code=503,
            detail="The assistant is busy right now; try again in a minute.",
        ) from exc
    except LLMTimeout as exc:
        raise HTTPException(
            status_code=504,
            detail="The assistant took too long to respond. Please try again.",
        ) from exc
    except LLMInvalidOutput as exc:
        raise HTTPException(
            status_code=502,
            detail="The assistant returned an unreadable answer. Try rephrasing.",
        ) from exc
    except LLMError as exc:
        raise HTTPException(
            status_code=503,
            detail="The assistant is unavailable right now. Please try again later.",
        ) from exc
    return AssistantResponse(**result)


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
        layout, alternatives = _generate_with_alternatives(requirements)
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
        alternatives=alternatives,
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
