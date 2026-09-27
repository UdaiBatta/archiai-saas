import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.models.project import Project
from app.schemas.layout_plan import LayoutPlan
from app.schemas.project import (
    ActivityLogOut,
    ExportRecordOut,
    ProjectCreate,
    ProjectOut,
    ProjectShareOut,
    ProjectUpdate,
    ProjectVersionOut,
)
from app.services.auth_service import get_current_user
from app.services.entitlement_service import require_within_project_limit
from app.services.export import EXPORTERS
from app.services.export_share_service import create_export_record, create_share_link, revoke_share_link
from app.utils.rate_limit import rate_limit
from app.services.project_service import (
    create_project,
    delete_project,
    duplicate_project,
    get_project,
    list_project_activity,
    list_project_versions,
    list_projects,
    update_project,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])
bearer = HTTPBearer(auto_error=False)


async def _current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> str:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await get_current_user(db, credentials.credentials)
    return user.id


@router.post("", response_model=ProjectOut, status_code=201)
async def create(
    data: ProjectCreate,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await require_within_project_limit(db, user_id)
    return await create_project(db, user_id, data)


@router.get("", response_model=list[ProjectOut])
async def list_all(
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    return await list_projects(db, user_id)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_one(
    project_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    return await get_project(db, user_id, project_id)


@router.get("/{project_id}/versions", response_model=list[ProjectVersionOut])
async def versions(
    project_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    return await list_project_versions(db, user_id, project_id)


@router.post("/{project_id}/duplicate", response_model=ProjectOut, status_code=201)
async def duplicate(
    project_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    # Duplicating creates a project like `create` does, so it has to clear the
    # same plan gate — otherwise the free-tier cap is bypassed by duplicating.
    await require_within_project_limit(db, user_id)
    return await duplicate_project(db, user_id, project_id)


@router.post("/{project_id}/export/image", response_model=ExportRecordOut, status_code=201)
async def export_image(
    project_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    return await create_export_record(db, user_id, project_id, "image")


@router.post("/{project_id}/export/pdf", response_model=ExportRecordOut, status_code=201)
async def export_pdf(
    project_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    return await create_export_record(db, user_id, project_id, "pdf")


class ExportFileRequest(BaseModel):
    layout: LayoutPlan


@router.post(
    "/{project_id}/export/{fmt}",
    dependencies=[Depends(rate_limit("export_file", limit=20, window_seconds=60))],
)
async def export_file(
    project_id: str,
    fmt: Literal["dxf", "ifc", "glb", "obj", "svg"],
    request: ExportFileRequest,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """The editor's current plan as a file for another tool (see
    services/export). Declared after /export/image and /export/pdf, which
    keep their own routes."""
    await create_export_record(db, user_id, project_id, fmt)  # access check + activity
    project = await db.get(Project, project_id)
    title = project.title if project else None
    writer, extension, media_type = EXPORTERS[fmt]
    data = await run_in_threadpool(writer, request.layout, title)
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", title or "archiai-plan").strip("-") or "archiai-plan"
    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{name}.{extension}"'},
    )


@router.post("/{project_id}/share", response_model=ProjectShareOut, status_code=201)
async def share(
    project_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    share_link = await create_share_link(db, user_id, project_id)
    return ProjectShareOut(
        id=share_link.id,
        project_id=share_link.project_id,
        token=share_link.token,
        share_url=f"/share/{share_link.token}",
        access_type=share_link.access_type,
        is_active=share_link.is_active,
        created_at=share_link.created_at,
        revoked_at=share_link.revoked_at,
    )


@router.delete("/{project_id}/share/{share_id}", status_code=204)
async def revoke_share(
    project_id: str,
    share_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await revoke_share_link(db, user_id, project_id, share_id)


@router.put("/{project_id}", response_model=ProjectOut)
async def update(
    project_id: str,
    data: ProjectUpdate,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    return await update_project(db, user_id, project_id, data)


@router.delete("/{project_id}", status_code=204)
async def delete(
    project_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await delete_project(db, user_id, project_id)


@router.get("/{project_id}/activity", response_model=list[ActivityLogOut])
async def activity(
    project_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    return await list_project_activity(db, user_id, project_id)
