from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.connection import get_db
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RefreshResponse,
    RegisterRequest,
    UpdateProfileRequest,
    UserOut,
)
from app.services.auth_service import (
    change_password,
    get_current_user,
    login_user,
    refresh_access_token,
    register_user,
    revoke_refresh_token,
    update_profile,
)
from app.utils.rate_limit import rate_limit

router = APIRouter(prefix="/api/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=201,
    dependencies=[Depends(rate_limit("auth_register", limit=5, window_seconds=60, by_ip=True))],
)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    return await register_user(db, data)


@router.post(
    "/login",
    response_model=AuthResponse,
    dependencies=[Depends(rate_limit("auth_login", limit=10, window_seconds=60, by_ip=True))],
)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await login_user(db, data)


@router.post(
    "/refresh",
    response_model=RefreshResponse,
    dependencies=[Depends(rate_limit("auth_refresh", limit=30, window_seconds=60))],
)
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    return await refresh_access_token(db, data.refresh_token)


@router.post("/logout")
async def logout(
    data: LogoutRequest | None = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    await revoke_refresh_token(db, data.refresh_token if data else None)
    return {"message": "Logged out"}


@router.get("/me", response_model=UserOut)
async def me(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return await get_current_user(db, credentials.credentials)


def _token(credentials: Optional[HTTPAuthorizationCredentials]) -> str:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return credentials.credentials


@router.patch("/me", response_model=UserOut)
async def update_me(
    data: UpdateProfileRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    return await update_profile(db, _token(credentials), data)


@router.post(
    "/password",
    status_code=204,
    dependencies=[Depends(rate_limit("auth_password", limit=5, window_seconds=60, by_ip=True))],
)
async def update_password(
    data: ChangePasswordRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    await change_password(db, _token(credentials), data)
