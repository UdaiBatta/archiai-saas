"""Site import endpoints (roadmap P2)."""
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.api.mvp.router import _current_user_id
from app.services.site_context import ContextUnavailable, fetch_context
from app.services.site_import import NoBoundaryFound, boundary_from_dxf
from app.utils.rate_limit import rate_limit

router = APIRouter(prefix="/api/site", tags=["site"])

# The app-wide body cap is 3 MB; a site survey DXF is far smaller.
MAX_DXF_BYTES = 2 * 1024 * 1024


@router.post(
    "/import-dxf",
    dependencies=[Depends(rate_limit("site_import_dxf", limit=20, window_seconds=60))],
)
async def import_dxf(
    file: UploadFile = File(...),
    _user_id: str = Depends(_current_user_id),
) -> dict:
    data = await file.read(MAX_DXF_BYTES + 1)
    if len(data) > MAX_DXF_BYTES:
        raise HTTPException(status_code=413, detail="DXF file is larger than 2 MB")
    try:
        boundary = boundary_from_dxf(data)
    except NoBoundaryFound as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"boundary": boundary}


@router.get(
    "/context",
    dependencies=[Depends(rate_limit("site_context", limit=10, window_seconds=60))],
)
async def site_context(
    lat: float = Query(ge=-85, le=85),
    lon: float = Query(ge=-180, le=180),
    radius: int = Query(default=250, ge=50, le=500),
    _user_id: str = Depends(_current_user_id),
) -> dict:
    """Surrounding buildings from OpenStreetMap, in metres around (lat, lon)."""
    try:
        buildings = await fetch_context(lat, lon, radius)
    except ContextUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"buildings": buildings, "radius_m": radius, "source": "OpenStreetMap", "attribution": "© OpenStreetMap contributors"}
