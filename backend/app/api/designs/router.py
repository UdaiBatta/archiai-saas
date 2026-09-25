from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.models.design import Design
from app.models.design_version import DesignVersion
from app.models.project import Project
from app.schemas.design import (
    DesignDraftResponse,
    DesignDraftSaveRequest,
    GenerateResponse,
    SaveDesignRequest,
)
from app.services.auth_service import get_current_user
from app.services.design_service import (
    get_design_draft,
    get_latest_project_design,
    save_design_draft,
    update_design_layout,
)
from app.services.workspace_service import require_project_read_access
from app.utils.activity import log_activity

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
