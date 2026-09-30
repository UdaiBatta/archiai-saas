import secrets
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.design import Design
from app.models.design_version import DesignVersion
from app.models.export_record import ExportRecord
from app.models.project import Project
from app.models.project_share import ProjectShare
from app.services.workspace_service import require_project_edit_access, require_project_read_access
from app.utils.activity import log_activity

EXPORT_TYPES = {"image", "pdf", "dxf", "ifc", "glb", "obj", "svg"}


async def create_export_record(
    db: AsyncSession,
    user_id: str,
    project_id: str,
    export_type: str,
    *,
    file_url: str | None = None,
) -> ExportRecord:
    project = await require_project_read_access(db, project_id, user_id)
    if export_type not in EXPORT_TYPES:
        raise HTTPException(status_code=422, detail="Unsupported export type")

    record = ExportRecord(
        project_id=project.id,
        user_id=user_id,
        export_type=export_type,
        file_url=file_url,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    await log_activity(
        db,
        user_id,
        "project.exported",
        project_id=project.id,
        workspace_id=project.workspace_id,
    )
    return record


async def create_share_link(
    db: AsyncSession,
    user_id: str,
    project_id: str,
) -> ProjectShare:
    project = await require_project_edit_access(db, project_id, user_id)
    share = ProjectShare(
        project_id=project.id,
        token=secrets.token_urlsafe(32),
        created_by=user_id,
        access_type="public",
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)
    await log_activity(
        db,
        user_id,
        "project.shared",
        project_id=project.id,
        workspace_id=project.workspace_id,
    )
    return share


async def revoke_share_link(
    db: AsyncSession,
    user_id: str,
    project_id: str,
    share_id: str,
) -> None:
    project = await require_project_edit_access(db, project_id, user_id)
    result = await db.execute(
        select(ProjectShare).where(
            ProjectShare.id == share_id,
            ProjectShare.project_id == project.id,
        )
    )
    share = result.scalar_one_or_none()
    if share is None:
        raise HTTPException(status_code=404, detail="Share link not found")
    if not share.is_active:
        return

    share.is_active = False
    share.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    await log_activity(
        db,
        user_id,
        "project.share_revoked",
        project_id=project.id,
        workspace_id=project.workspace_id,
    )


async def get_shared_project_by_token(
    db: AsyncSession,
    token: str,
) -> tuple[ProjectShare, Project, Design | None, DesignVersion | None]:
    result = await db.execute(
        select(ProjectShare).where(
            ProjectShare.token == token,
            ProjectShare.is_active.is_(True),
        )
    )
    share = result.scalar_one_or_none()
    if share is None:
        raise HTTPException(status_code=404, detail="Share link not found")

    project = await db.get(Project, share.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Shared project not found")

    design_result = await db.execute(
        select(Design)
        .where(Design.project_id == project.id)
        .order_by(desc(Design.updated_at))
        .limit(1)
    )
    design = design_result.scalar_one_or_none()
    if design is None:
        return share, project, None, None

    version_result = await db.execute(
        select(DesignVersion)
        .where(DesignVersion.design_id == design.id)
        .where(
            or_(
                DesignVersion.version_type.is_(None),
                DesignVersion.version_type != "auto_draft",
            )
        )
        .order_by(desc(DesignVersion.created_at), desc(DesignVersion.version_number))
        .limit(1)
    )
    return share, project, design, version_result.scalar_one_or_none()
