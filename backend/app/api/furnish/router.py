"""Automatic furnishing (roadmap P3: furniture checked against clearances)."""
from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from app.api.mvp.router import _current_user_id
from app.schemas.furnishing import FurnishRequest, FurnishResponse
from app.services.furnishing import furnish
from app.utils.rate_limit import rate_limit

router = APIRouter(prefix="/api", tags=["furnish"])


@router.post(
    "/furnish",
    response_model=FurnishResponse,
    dependencies=[Depends(rate_limit("furnish", limit=30, window_seconds=60))],
)
async def furnish_layout(
    request: FurnishRequest,
    _user_id: str = Depends(_current_user_id),
) -> FurnishResponse:
    items, warnings = await run_in_threadpool(furnish, request.layout)
    return FurnishResponse(items=items, warnings=warnings)
