"""Pure helpers and persistence orchestration for the additive MVP pipeline."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.design import Design
from app.models.design_version import DesignVersion
from app.schemas.layout_plan import LayoutPlan
from app.schemas.mvp import (
    HardQualitySnapshot,
    MvpQualitySnapshot,
    MvpVersionResponse,
)
from app.schemas.requirements import RequirementsSpec
from app.services.catalog import resolve_alias
from app.services.design_service import AUTO_DRAFT_VERSION_TYPE
from app.services.layout_adapter import layout_plan_to_canvas
from app.services.layout_engine import rebuild_derived_geometry
from app.services.quality.hard_constraints import validate
from app.services.quality.scorer import score as score_quality
from app.services.workspace_service import (
    require_project_edit_access,
    require_project_read_access,
)


def _number(value: float) -> str:
    return f"{value:g}"


def understood_summary(spec: RequirementsSpec) -> list[str]:
    """Translate validated facts into stable, beginner-readable statements."""

    summary = [
        f"Building: {spec.building_type.value.replace('_', ' ').title()}",
        f"{spec.floors} {'floor' if spec.floors == 1 else 'floors'}",
    ]
    counts: dict[str, int] = {}
    if spec.spaces:
        for space in spec.spaces:
            key = resolve_alias(space.space_type) or space.space_type
            counts[key] = counts.get(key, 0) + space.count
    else:
        for room in spec.rooms:
            counts[room.type.value] = counts.get(room.type.value, 0) + room.count
    for room_type in sorted(counts):
        count = counts[room_type]
        label = room_type.replace("_", " ")
        if count != 1:
            label += "s"
        summary.append(f"{count} {label}")

    if spec.plot.width_m is not None and spec.plot.depth_m is not None:
        summary.append(
            f"Plot: {_number(spec.plot.width_m)} × {_number(spec.plot.depth_m)} m"
        )
    if spec.facing is not None:
        summary.append(f"Entry faces {spec.facing.value}")

    strength_order = {"must": 0, "should": 1}
    for edge in sorted(
        spec.adjacency,
        key=lambda item: (
            strength_order[item.strength],
            item.room_a,
            item.room_b,
        ),
    ):
        relation = "Must connect" if edge.strength == "must" else "Prefer nearby"
        a = edge.room_a.replace("_", " ")
        b = edge.room_b.replace("_", " ")
        summary.append(f"{relation}: {a} ↔ {b}")
    for edge in sorted(spec.avoid_adjacency, key=lambda item: (item.room_a, item.room_b)):
        a = edge.room_a.replace("_", " ")
        b = edge.room_b.replace("_", " ")
        summary.append(f"Keep apart: {a} ↔ {b}")
    return summary


def hard_quality_snapshot(plan: LayoutPlan) -> HardQualitySnapshot:
    violations = validate(plan)
    return HardQualitySnapshot(valid=not violations, hard_violations=violations)


def quality_snapshot(
    plan: LayoutPlan,
    requirements: RequirementsSpec,
    *,
    include_vastu: bool = False,
) -> MvpQualitySnapshot:
    _, quality = quality_snapshot_with_layout(
        plan,
        requirements,
        include_vastu=include_vastu,
    )
    return quality


def quality_snapshot_with_layout(
    plan: LayoutPlan,
    requirements: RequirementsSpec,
    *,
    include_vastu: bool = False,
) -> tuple[LayoutPlan, MvpQualitySnapshot]:
    """Return the exact rebuilt plan used for the accompanying quality report."""

    scored_plan = rebuild_derived_geometry(plan, requirements)
    report = score_quality(scored_plan, requirements, include_vastu=include_vastu)
    quality = MvpQualitySnapshot(
        valid=not report.hard_violations,
        **report.model_dump(mode="python"),
    )
    return scored_plan, quality


async def save_mvp_snapshot(
    db: AsyncSession,
    *,
    user_id: str,
    project_id: str,
    prompt: str | None,
    requirements: RequirementsSpec,
    layout: LayoutPlan,
    quality: MvpQualitySnapshot,
    version_type: str,
) -> tuple[Design, DesignVersion]:
    """Persist canonical artifacts and a legacy editor-compatible snapshot."""

    await require_project_edit_access(db, project_id, user_id)
    legacy_layout = layout_plan_to_canvas(
        layout,
        prompt=prompt,
        building_type=requirements.building_type.value,
        requirements=requirements.model_dump(mode="json"),
        quality=quality.model_dump(mode="json"),
    )
    design = await db.scalar(
        select(Design)
        .where(Design.project_id == project_id)
        .order_by(desc(Design.updated_at))
        .limit(1)
    )
    if design is None:
        design = Design(
            project_id=project_id,
            user_id=user_id,
            layout_json=legacy_layout,
        )
        db.add(design)
        await db.flush()
        next_version = 1
    else:
        design.layout_json = legacy_layout
        design.updated_at = datetime.now(timezone.utc)
        max_version = await db.scalar(
            select(func.max(DesignVersion.version_number))
            .where(DesignVersion.design_id == design.id)
            .where(
                or_(
                    DesignVersion.version_type.is_(None),
                    DesignVersion.version_type != AUTO_DRAFT_VERSION_TYPE,
                )
            )
        )
        next_version = (max_version or 0) + 1

    generated = version_type == "generated"
    version = DesignVersion(
        design_id=design.id,
        project_id=project_id,
        user_id=user_id,
        version_number=next_version,
        version_name=(
            "Generated MVP layout" if generated else f"MVP save v{next_version}"
        ),
        version_type=version_type,
        change_summary=(
            "Initial local-LLM MVP layout"
            if generated and next_version == 1
            else "Saved canonical MVP layout"
        ),
        layout_json=legacy_layout,
        requirements_json=requirements.model_dump(mode="json"),
        canonical_layout_json=layout.model_dump(mode="json"),
        quality_json=quality.model_dump(mode="json"),
        prompt_used=prompt,
    )
    db.add(version)
    await db.commit()
    await db.refresh(design)
    await db.refresh(version)
    return design, version


def version_response(version: DesignVersion) -> MvpVersionResponse:
    if (
        version.requirements_json is None
        or version.canonical_layout_json is None
        or version.quality_json is None
    ):
        raise HTTPException(status_code=404, detail="MVP version artifacts not found")
    raw_quality = version.quality_json
    quality = (
        MvpQualitySnapshot.model_validate(raw_quality)
        if "score" in raw_quality
        else HardQualitySnapshot.model_validate(raw_quality)
    )
    return MvpVersionResponse(
        id=version.id,
        designId=version.design_id,
        projectId=version.project_id,
        versionNumber=version.version_number,
        prompt=version.prompt_used,
        requirements=RequirementsSpec.model_validate(version.requirements_json),
        layout=LayoutPlan.model_validate(version.canonical_layout_json),
        quality=quality,
        createdAt=version.created_at,
    )


async def get_mvp_version(
    db: AsyncSession,
    *,
    user_id: str,
    version_id: str,
) -> MvpVersionResponse:
    version = await db.get(DesignVersion, version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found")
    await require_project_read_access(db, version.project_id, user_id)
    return version_response(version)
