"""Seed an empty, explicitly named Workflow demo project without an LLM.

Development only. Uses real generation, authorization, quota and persistence code.
Usage: python -m scripts.seed_workflow_demo PROJECT_ID
"""
import asyncio
import sys

from sqlalchemy import select

from app.api.mvp.router import generate_mvp_layout
from app.config.settings import settings
from app.database.connection import SessionLocal
from app.models.design import Design
from app.models.project import Project
from app.schemas.mvp import GenerateMvpRequest


async def main(project_id: str) -> None:
    if settings.ENV.strip().lower() == "production":
        raise RuntimeError("Demo seeding is development-only")
    async with SessionLocal() as db:
        project = await db.get(Project, project_id)
        if project is None or not project.title.startswith("Workflow demo"):
            raise RuntimeError("Target must be an existing Workflow demo project")
        existing = await db.scalar(select(Design.id).where(Design.project_id == project_id))
        if existing:
            raise RuntimeError("This demo already has a design; nothing was changed")
        result = await generate_mvp_layout(
            GenerateMvpRequest.model_validate({
                "projectId": project_id,
                "prompt": "Local workflow demo: 12 by 15 metre east-facing house, 2 bedrooms, 2 bathrooms, kitchen and living room. Seeded from explicit requirements; no AI extraction.",
                "requirements": {
                    "building_type": "house", "floors": 1,
                    "rooms": [{"type": kind, "count": count} for kind, count in [("bedroom", 2), ("bathroom", 2), ("kitchen", 1), ("living_room", 1)]],
                    "plot": {"width_m": 12, "depth_m": 15}, "facing": "east",
                    "adjacency": [], "avoid_adjacency": [], "missing_info": [],
                },
            }),
            user_id=project.user_id, db=db,
        )
        print(f"Demo ready: {project_id}; {len(result.layout.rooms)} spaces; quality {result.quality.score}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Pass the ID of an empty Workflow demo project")
    asyncio.run(main(sys.argv[1]))
