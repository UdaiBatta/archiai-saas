from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.design import Design
from app.models.design_version import DesignVersion
from app.models.project import Project
from app.services.workspace_service import require_project_edit_access, require_project_read_access

AUTO_DRAFT_VERSION_TYPE = "auto_draft"


async def get_owned_design(
    db: AsyncSession,
    user_id: str,
    design_id: str,
) -> Design:
    result = await db.execute(select(Design).where(Design.id == design_id))
    design = result.scalar_one_or_none()
    if design is None:
        raise HTTPException(status_code=404, detail="Design not found")
    await require_project_edit_access(db, design.project_id, user_id)
    return design


async def get_latest_project_design(
    db: AsyncSession,
    user_id: str,
    project_id: str,
) -> tuple[Design, DesignVersion | None]:
    await require_project_read_access(db, project_id, user_id)

    design_result = await db.execute(
        select(Design)
        .where(Design.project_id == project_id)
        .order_by(desc(Design.updated_at))
        .limit(1)
    )
    design = design_result.scalar_one_or_none()
    if design is None:
        raise HTTPException(status_code=404, detail="Design not found")

    version_result = await db.execute(
        select(DesignVersion)
        .where(DesignVersion.design_id == design.id)
        .order_by(desc(DesignVersion.version_number))
        .limit(1)
    )
    return design, version_result.scalar_one_or_none()


async def update_design_layout(
    db: AsyncSession,
    user_id: str,
    design_id: str,
    layout_json: dict,
    version_name: str | None = None,
    change_summary: str | None = None,
    thumbnail_url: str | None = None,
) -> tuple[Design, DesignVersion]:
    design = await get_owned_design(db, user_id, design_id)

    max_version_result = await db.execute(
        select(func.max(DesignVersion.version_number))
        .where(DesignVersion.design_id == design.id)
        .where(
            or_(
                DesignVersion.version_type.is_(None),
                DesignVersion.version_type != AUTO_DRAFT_VERSION_TYPE,
            )
        )
    )
    next_version = (max_version_result.scalar_one_or_none() or 0) + 1
    design.layout_json = layout_json
    design.updated_at = datetime.now(timezone.utc)

    project_result = await db.execute(select(Project).where(Project.id == design.project_id))
    project = project_result.scalar_one_or_none()
    if project is not None:
        if thumbnail_url is not None:
            project.thumbnail_url = thumbnail_url
        project.updated_at = datetime.now(timezone.utc)

    version = DesignVersion(
        design_id=design.id,
        project_id=design.project_id,
        user_id=user_id,
        version_number=next_version,
        version_name=version_name or f"Manual save v{next_version}",
        version_type="manual",
        change_summary=change_summary or "Manual layout save",
        layout_json=layout_json,
        prompt_used=layout_json.get("metadata", {}).get("prompt"),
    )
    db.add(version)
    await db.commit()
    await db.refresh(design)
    await db.refresh(version)
    return design, version


async def save_design_draft(
    db: AsyncSession,
    user_id: str,
    design_id: str,
    layout_json: dict,
) -> tuple[Design, DesignVersion]:
    design = await get_owned_design(db, user_id, design_id)

    draft_result = await db.execute(
        select(DesignVersion)
        .where(
            DesignVersion.design_id == design.id,
            DesignVersion.project_id == design.project_id,
            DesignVersion.version_type == AUTO_DRAFT_VERSION_TYPE,
        )
        .order_by(desc(DesignVersion.created_at), desc(DesignVersion.version_number))
        .limit(1)
    )
    draft = draft_result.scalar_one_or_none()

    if draft is None:
        max_named_version = await db.scalar(
            select(func.max(DesignVersion.version_number))
            .where(DesignVersion.design_id == design.id)
            .where(
                or_(
                    DesignVersion.version_type.is_(None),
                    DesignVersion.version_type != AUTO_DRAFT_VERSION_TYPE,
                )
            )
        )
        draft = DesignVersion(
            design_id=design.id,
            project_id=design.project_id,
            user_id=user_id,
            version_number=max_named_version or 1,
            version_name="Auto-saved draft",
            version_type=AUTO_DRAFT_VERSION_TYPE,
            change_summary="Auto-saved draft",
            layout_json=layout_json,
            prompt_used=None,
        )
        db.add(draft)
    else:
        draft.user_id = user_id
        draft.layout_json = layout_json
        draft.version_name = "Auto-saved draft"
        draft.change_summary = "Auto-saved draft"
        draft.prompt_used = None
        draft.created_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(draft)
    return design, draft


async def get_design_draft(
    db: AsyncSession,
    user_id: str,
    design_id: str,
) -> tuple[Design, DesignVersion]:
    result = await db.execute(select(Design).where(Design.id == design_id))
    design = result.scalar_one_or_none()
    if design is None:
        raise HTTPException(status_code=404, detail="Design not found")
    await require_project_read_access(db, design.project_id, user_id)
    draft_result = await db.execute(
        select(DesignVersion)
        .where(
            DesignVersion.design_id == design.id,
            DesignVersion.project_id == design.project_id,
            DesignVersion.version_type == AUTO_DRAFT_VERSION_TYPE,
        )
        .order_by(desc(DesignVersion.created_at), desc(DesignVersion.version_number))
        .limit(1)
    )
    draft = draft_result.scalar_one_or_none()
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return design, draft
