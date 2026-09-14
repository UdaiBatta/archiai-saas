from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.models.design import Design
from app.models.design_version import DesignVersion
from app.models.project import Project
from app.schemas.design import (
    DesignDraftResponse,
    DesignDraftSaveRequest,
    GenerateRequest,
    GenerateResponse,
    RefineRequest,
    RefineResponse,
    SaveDesignRequest,
)
from app.services.auth_service import get_current_user
from app.services.entitlement_service import METRIC_GENERATIONS, enforce_and_increment_usage
from app.services.design_service import (
    get_design_draft,
    get_owned_design,
    get_latest_project_design,
    save_generated_design,
    save_design_draft,
    update_design_layout,
)
from app.services.layout_service import generate_layout
from app.services.layout_pattern_service import get_layout_pattern_rules
from app.services.planning import (
    build_program_metadata,
    from_parser_output,
    score_graph_satisfaction,
    validate_program,
)
from app.services.prompt_service import extract_total_area_sqm, parse_prompt, parsed_to_room_specs
from app.services.refinement_service import apply_refinement_with_changes, parse_refinement
from app.services.workspace_service import require_project_read_access
from app.utils.activity import log_activity
from app.utils.rate_limit import rate_limit

router = APIRouter(prefix="/api/design", tags=["design"])
_bearer = HTTPBearer(auto_error=False)


async def _project_workspace_id(db: AsyncSession, project_id: str | None) -> str | None:
    if project_id is None:
        return None
    project = await db.get(Project, project_id)
    return project.workspace_id if project is not None else None


async def _current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> str:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await get_current_user(db, credentials.credentials)
    return str(user.id)


@router.post(
    "/generate",
    response_model=GenerateResponse,
    dependencies=[Depends(rate_limit("design_generate", limit=20, window_seconds=60))],
)
async def generate(
    request: GenerateRequest,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> GenerateResponse:
    parsed = parse_prompt(request.prompt)
    room_specs = parsed_to_room_specs(parsed)
    if not room_specs:
        raise HTTPException(
            status_code=422,
            detail="No rooms detected. Try: '2 bedroom apartment with kitchen'",
        )
    # Meter generations against the plan quota (402 when exhausted). Charged only
    # for a valid prompt, before the expensive layout work runs.
    await enforce_and_increment_usage(
        db, user_id, METRIC_GENERATIONS, "max_generations_per_period"
    )
    total_area_sqm = extract_total_area_sqm(request.prompt)
    pattern_rules = await get_layout_pattern_rules(
        db,
        parsed.building_type,
        {room.room_type for room in room_specs},
    )
    design_params = request.design_params
    # Explicit DesignParams always win; otherwise site facts extracted from
    # the prompt itself ("east-facing ... on a 14 m x 18 m plot") apply.
    plot_width = (design_params.plot_width_m if design_params else None) or parsed.plot_width_m
    plot_depth = (design_params.plot_depth_m if design_params else None) or parsed.plot_depth_m
    orientation = (design_params.orientation if design_params else None) or parsed.facing_direction
    layout, candidates = generate_layout(
        room_specs,
        prompt=request.prompt,
        building_type=parsed.building_type,
        total_floors=(design_params.floors if design_params and design_params.floors else parsed.total_floors),
        pattern_rules=pattern_rules,
        total_area_sqm=total_area_sqm,
        adjacency_constraints=parsed.adjacency_constraints,
        zone_assignments=parsed.zone_assignments,
        vastu_requested=bool(design_params and design_params.vastu) or parsed.vastu_requested,
        plot_width_m=plot_width,
        orientation=orientation,
        return_all_candidates=True,
        plot_depth_m=plot_depth,
        road_side=parsed.road_side,
        entry_side=parsed.entry_side,
        daylight_rooms=parsed.daylight_rooms,
        separation_constraints=parsed.separation_constraints,
    )
    # Score how well the winning layout honours the parsed adjacency graph
    # (Sprint 18 Phase 4). Additive, explainable, deterministic — recorded in
    # metadata so it is persisted with the design and shown to the user.
    graph = from_parser_output(parsed, room_specs)
    program = build_program_metadata(parsed, graph)
    for candidate in candidates:
        satisfaction = score_graph_satisfaction(graph, candidate)
        metadata = candidate.setdefault("metadata", {})
        metadata["graphSatisfaction"] = satisfaction.as_dict()
        metadata["program"] = program
        metadata["programValidation"] = validate_program(
            parsed,
            graph,
            candidate,
            program=program,
            graph_satisfaction=satisfaction,
        )

    if request.project_id:
        design, version = await save_generated_design(
            db,
            user_id=user_id,
            project_id=request.project_id,
            layout_json=layout,
            prompt=request.prompt,
        )
        layout["designId"] = design.id
        layout["designVersionId"] = version.id

    # Surface the candidates that didn't win as pickable alternatives (the
    # option gallery) — added only to the response, never persisted, since
    # only the winning layout becomes the Design/DesignVersion above.
    layout["alternatives"] = [candidate for candidate in candidates if candidate is not layout]

    await log_activity(
        db,
        user_id,
        "design.generated",
        project_id=request.project_id,
        workspace_id=await _project_workspace_id(db, request.project_id),
    )
    return GenerateResponse(**layout)


@router.get("/project/{project_id}/latest", response_model=GenerateResponse)
async def latest_for_project(
    project_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> GenerateResponse:
    design, version = await get_latest_project_design(db, user_id, project_id)
    layout = {
        **design.layout_json,
        "designId": design.id,
        "designVersionId": version.id if version else None,
    }
    return GenerateResponse(**layout)


@router.put("/{design_id}", response_model=GenerateResponse)
async def save_design(
    design_id: str,
    request: SaveDesignRequest,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> GenerateResponse:
    design, version = await update_design_layout(
        db,
        user_id,
        design_id,
        request.layout,
        version_name=request.version_name,
        change_summary=request.change_summary,
        thumbnail_url=request.thumbnail_url,
    )
    await log_activity(
        db,
        user_id,
        "layout.saved",
        project_id=design.project_id,
        workspace_id=await _project_workspace_id(db, design.project_id),
    )
    layout = {
        **design.layout_json,
        "designId": design.id,
        "designVersionId": version.id,
    }
    return GenerateResponse(**layout)


def _draft_response(design: Design, version: DesignVersion) -> DesignDraftResponse:
    layout = {
        key: value
        for key, value in version.layout_json.items()
        if key not in ("designId", "designVersionId")
    }
    return DesignDraftResponse(
        **layout,
        id=version.id,
        designId=design.id,
        designVersionId=version.id,
        projectId=design.project_id,
        versionNumber=version.version_number,
        versionType=version.version_type or "auto_draft",
        changeSummary=version.change_summary,
        createdAt=version.created_at,
    )


@router.put("/{design_id}/draft", response_model=DesignDraftResponse)
async def save_draft(
    design_id: str,
    request: DesignDraftSaveRequest,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> DesignDraftResponse:
    design, draft = await save_design_draft(db, user_id, design_id, request.layout)
    await log_activity(
        db,
        user_id,
        "design.draft_saved",
        project_id=design.project_id,
        workspace_id=await _project_workspace_id(db, design.project_id),
    )
    return _draft_response(design, draft)


@router.get("/{design_id}/draft", response_model=DesignDraftResponse)
async def fetch_draft(
    design_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> DesignDraftResponse:
    design, draft = await get_design_draft(db, user_id, design_id)
    return _draft_response(design, draft)


@router.post("/refine", response_model=RefineResponse)
async def refine(
    request: RefineRequest,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> RefineResponse:
    design = await get_owned_design(db, user_id, request.design_id)

    ops = parse_refinement(request.prompt)
    if not ops:
        raise HTTPException(
            status_code=422,
            detail=(
                "Couldn't understand the refinement. "
                "Try: 'add a bedroom', 'remove the office', 'make the kitchen bigger'."
            ),
        )

    source_layout = request.current_layout if request.current_layout is not None else design.layout_json
    source_layout = {k: v for k, v in source_layout.items() if k not in ("designId", "designVersionId")}
    new_layout, summary, changes = apply_refinement_with_changes(source_layout, ops)
    if not summary:
        raise HTTPException(
            status_code=422, detail="No matching rooms found for that change."
        )

    design.layout_json = new_layout
    design.updated_at = datetime.now(timezone.utc)

    max_version = await db.scalar(
        select(func.max(DesignVersion.version_number))
        .where(DesignVersion.design_id == design.id)
        .where(
            or_(
                DesignVersion.version_type.is_(None),
                DesignVersion.version_type != "auto_draft",
            )
        )
    )
    next_version = (max_version or 0) + 1

    version = DesignVersion(
        design_id=design.id,
        project_id=design.project_id,
        user_id=user_id,
        version_number=next_version,
        version_name=f"Refinement v{next_version}",
        version_type="refined",
        change_summary=summary,
        layout_json=new_layout,
        prompt_used=request.prompt,
    )
    db.add(version)
    await db.commit()
    await db.refresh(design)
    await db.refresh(version)

    await log_activity(
        db,
        user_id,
        "design.refined",
        project_id=design.project_id,
        workspace_id=await _project_workspace_id(db, design.project_id),
    )

    return RefineResponse(
        **new_layout,
        designId=design.id,
        designVersionId=version.id,
        refinementSummary=summary,
        refinementChanges=changes,
    )


@router.get("/version/{version_id}", response_model=GenerateResponse)
async def fetch_version(
    version_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> GenerateResponse:
    version = await db.get(DesignVersion, version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found")

    design = await db.get(Design, version.design_id)
    if design is None:
        raise HTTPException(status_code=403, detail="Access forbidden")
    await require_project_read_access(db, design.project_id, user_id)

    layout = {
        k: v
        for k, v in version.layout_json.items()
        if k not in ("designId", "designVersionId")
    }
    return GenerateResponse(
        **layout,
        designId=design.id,
        designVersionId=version.id,
    )
