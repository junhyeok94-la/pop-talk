from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import asyncpg
import bcrypt
import jwt
from fastapi import APIRouter, Cookie, Request, Response

from app.config import get_settings
from app.database import get_pool
from app.movie_category_preferences import validate_movie_categories
from app.problems import ProblemError
from app.schemas import LoginRequest, RegisterRequest

router = APIRouter(prefix="/auth", tags=["auth"])
DUMMY_HASH = bcrypt.hashpw(b"dummy-password-for-timing-safety", bcrypt.gensalt(rounds=10))


def _token_hash(value: str) -> bytes:
    return hashlib.sha256(value.encode()).digest()


def _access_token(user_id: str, role: str | None) -> str:
    settings = get_settings()
    if not settings.jwt_secret:
        raise RuntimeError("JWT_SECRET is required.")
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": user_id, "role": role, "iat": now, "exp": now + timedelta(seconds=settings.access_token_ttl_seconds)}, settings.jwt_secret, algorithm="HS256")


def _result(user, token: str) -> dict:
    account = {
        "id": str(user["id"]),
        "name": user["nickname"],
        "email": user["email"],
        "role": user["role"],
        "status": user["status"],
        "joined_at": user["joined_at"],
    }
    user_keys = user.keys()
    if "onboarding_status" in user_keys:
        account["onboarding_status"] = user["onboarding_status"]
    if "onboarding_movie_category_ids" in user_keys:
        account["movie_category_ids"] = [
            int(category_id)
            for category_id in (user["onboarding_movie_category_ids"] or [])
        ]
    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": get_settings().access_token_ttl_seconds,
        "admin": account,
    }


async def _issue(conn, user_id, request: Request, replaced_id=None) -> str:
    raw = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=get_settings().refresh_token_ttl_days)
    row = await conn.fetchrow("insert into user_refresh_tokens (user_id, token_hash, expires_at, user_agent, ip) values ($1,$2,$3,$4,$5) returning id", user_id, _token_hash(raw), expires, request.headers.get("user-agent"), request.client.host if request.client else None)
    if replaced_id:
        await conn.execute("update user_refresh_tokens set revoked_at=now(), replaced_by=$2 where id=$1", replaced_id, row["id"])
    return raw


def _set_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie("refresh_token", token, max_age=settings.refresh_token_ttl_days * 86400, httponly=True, secure=settings.app_env == "production", samesite="strict", path="/auth")


@router.post("/login", summary="로그인", description="이메일과 비밀번호를 검증해 액세스 토큰을 반환하고 리프레시 토큰 쿠키를 설정합니다.")
async def login(body: LoginRequest, request: Request, response: Response):
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        user = await conn.fetchrow("select id,email,nickname,role,status,onboarding_status,onboarding_movie_category_ids,hashed_password,failed_login_count,locked_until > now() is_locked,to_char(created_at,'YYYY-MM-DD HH24:MI:SS') joined_at from users where email=$1 and deleted_at is null for update", body.email)
        if user and user["is_locked"]:
            raise ProblemError(429, "Too Many Login Attempts", "Try again in 10 minutes.")
        encoded = body.password.encode()
        stored = user["hashed_password"] if user else None
        stored_bytes = stored.encode() if isinstance(stored, str) else stored
        valid = bcrypt.checkpw(encoded, stored_bytes or DUMMY_HASH)
        if not user or not user["hashed_password"] or not valid:
            if user:
                await conn.execute("update users set failed_login_count=failed_login_count+1, locked_until=case when failed_login_count+1 >= 5 then now()+interval '10 minutes' else locked_until end where id=$1", user["id"])
            raise ProblemError(401, "Login Failed", "Check your email or password.", "https://api.poptalk.kr/problems/invalid-credentials")
        if user["status"] != "ACTIVE":
            raise ProblemError(403, "Account Unavailable", f"Account status is {user['status']}.")
        refresh = await _issue(conn, user["id"], request)
        await conn.execute("update users set last_login_at=now(),failed_login_count=0,locked_until=null where id=$1", user["id"])
    _set_cookie(response, refresh)
    return _result(user, _access_token(str(user["id"]), user["role"]))


@router.post("/register", status_code=201, summary="일반 회원가입", description="일반 사용자(USER) 계정을 생성합니다. 관리자 역할은 요청에서 지정할 수 없습니다.")
async def register(body: RegisterRequest, request: Request, response: Response):
    """Create a normal member account; administrative roles are never client supplied."""
    pool = await get_pool()
    password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt(rounds=12)).decode()
    async with pool.acquire() as conn, conn.transaction():
        await validate_movie_categories(conn, body.movie_category_ids)
        try:
            user = await conn.fetchrow(
                """
                INSERT INTO users (
                    email, nickname, role, hashed_password, onboarding_status,
                    onboarding_movie_category_ids
                )
                VALUES ($1, $2, 'USER', $3, 'COMPLETED', $4::bigint[])
                RETURNING id, email, nickname, role, status, onboarding_status,
                          onboarding_movie_category_ids,
                          to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') joined_at
                """,
                str(body.email).lower(), body.nickname.strip(), password_hash,
                body.movie_category_ids,
            )
        except asyncpg.UniqueViolationError as exc:
            raise ProblemError(409, "Email Already Registered", "Use a different email address.") from exc
        refresh = await _issue(conn, user["id"], request)
    _set_cookie(response, refresh)
    return _result(user, _access_token(str(user["id"]), user["role"]))


@router.post("/refresh", summary="액세스 토큰 갱신", description="리프레시 토큰 쿠키를 사용해 새 액세스 토큰과 리프레시 토큰을 발급합니다.")
async def refresh(request: Request, response: Response, refresh_token: str | None = Cookie(default=None)):
    if not refresh_token:
        raise ProblemError(401, "Authentication Required", "Refresh token is missing.")
    pool = await get_pool()
    pending_error = None
    async with pool.acquire() as conn:
        transaction = conn.transaction()
        await transaction.start()
        try:
            token = await conn.fetchrow("select id,user_id,revoked_at,expires_at <= now() is_expired from user_refresh_tokens where token_hash=$1 for update", _token_hash(refresh_token))
            if not token:
                pending_error = ProblemError(401, "Authentication Required", "Sign in again.")
            elif token["revoked_at"]:
                await conn.execute("update user_refresh_tokens set revoked_at=now() where user_id=$1 and revoked_at is null", token["user_id"])
                pending_error = ProblemError(401, "Authentication Required", "All sessions were closed. Sign in again.")
            elif token["is_expired"]:
                pending_error = ProblemError(401, "Authentication Required", "Session expired.")
            else:
                user = await conn.fetchrow("select id,email,nickname,role,status,onboarding_status,onboarding_movie_category_ids,to_char(created_at,'YYYY-MM-DD HH24:MI:SS') joined_at from users where id=$1 and deleted_at is null", token["user_id"])
                if not user or user["status"] != "ACTIVE":
                    await conn.execute("update user_refresh_tokens set revoked_at=now() where user_id=$1 and revoked_at is null", token["user_id"])
                    pending_error = ProblemError(403, "Account Unavailable")
                else:
                    new_refresh = await _issue(conn, user["id"], request, token["id"])
            await transaction.commit()
        except Exception:
            await transaction.rollback()
            raise
    if pending_error:
        raise pending_error
    _set_cookie(response, new_refresh)
    return _result(user, _access_token(str(user["id"]), user["role"]))


@router.post("/logout", status_code=204, summary="로그아웃", description="현재 리프레시 토큰을 폐기하고 브라우저 쿠키를 삭제합니다.")
async def logout(response: Response, refresh_token: str | None = Cookie(default=None)):
    if refresh_token:
        pool = await get_pool()
        await pool.execute("update user_refresh_tokens set revoked_at=now() where token_hash=$1 and revoked_at is null", _token_hash(refresh_token))
    response.delete_cookie("refresh_token", path="/auth")
