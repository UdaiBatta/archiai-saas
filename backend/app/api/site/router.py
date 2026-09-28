"""Site import endpoints (roadmap P2)."""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.api.mvp.router import _current_user_id
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
