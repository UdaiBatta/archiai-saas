import hashlib
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    RefreshResponse,
    RegisterRequest,
    UserOut,
)
from app.utils.hashing import hash_password, verify_password
from app.utils.jwt import (
    TOKEN_TYPE_REFRESH,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_token,
)


def _hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def _issue_refresh_token(db: AsyncSession, user_id: str) -> str:
    """Mint a refresh token and persist only its hash (revocable grant)."""
    token, expires_at = create_refresh_token(user_id)
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=_hash_refresh_token(token),
            expires_at=expires_at,
        )
    )
    await db.commit()
    return token


async def register_user(db: AsyncSession, data: RegisterRequest) -> AuthResponse:
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        name=data.name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id)
    refresh = await _issue_refresh_token(db, user.id)
    return AuthResponse(
        access_token=token,
        refresh_token=refresh,
        user=UserOut.model_validate(user),
    )


async def login_user(db: AsyncSession, data: LoginRequest) -> AuthResponse:
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user.id)
    refresh = await _issue_refresh_token(db, user.id)
    return AuthResponse(
        access_token=token,
        refresh_token=refresh,
        user=UserOut.model_validate(user),
    )


async def _get_active_refresh_token(db: AsyncSession, token: str) -> RefreshToken:
    """Decode + look up a refresh token, rejecting invalid/expired/revoked ones."""
    try:
        decode_token(token, expected_type=TOKEN_TYPE_REFRESH)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == _hash_refresh_token(token))
    )
    record = result.scalar_one_or_none()
    if record is None or record.revoked_at is not None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    # SQLite (tests) round-trips DateTime as tz-naive; treat naive as UTC so the
    # comparison works on both SQLite and Postgres.
    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    return record


async def refresh_access_token(db: AsyncSession, token: str) -> RefreshResponse:
    """Rotate a refresh token: revoke the presented one, issue a fresh pair."""
    record = await _get_active_refresh_token(db, token)
    record.revoked_at = datetime.now(timezone.utc)
    await db.flush()

    access = create_access_token(record.user_id)
    new_refresh = await _issue_refresh_token(db, record.user_id)
    return RefreshResponse(access_token=access, refresh_token=new_refresh)


async def revoke_refresh_token(db: AsyncSession, token: str | None) -> None:
    """Best-effort revoke on logout. A missing/already-invalid token is a no-op
    so logout is always safe to call."""
    if not token:
        return
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == _hash_refresh_token(token))
    )
    record = result.scalar_one_or_none()
    if record is not None and record.revoked_at is None:
        record.revoked_at = datetime.now(timezone.utc)
        await db.commit()


async def get_current_user(db: AsyncSession, token: str) -> UserOut:
    try:
        user_id = decode_access_token(token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return UserOut.model_validate(user)
