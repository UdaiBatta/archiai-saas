"""Housing fill endpoint (roadmap P3)."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.api.mvp.router import _current_user_id
from app.schemas.housing import HousingFillRequest, HousingFillResponse
from app.services.housing import HousingDoesNotFit, fill_housing
from app.utils.rate_limit import rate_limit

router = APIRouter(prefix="/api/housing", tags=["housing"])


@router.post(
    "/fill",
    response_model=HousingFillResponse,
    dependencies=[Depends(rate_limit("housing_fill", limit=30, window_seconds=60))],
)
async def fill(
    request: HousingFillRequest,
    _user_id: str = Depends(_current_user_id),
) -> HousingFillResponse:
    try:
        return await run_in_threadpool(fill_housing, request)
    except HousingDoesNotFit as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
