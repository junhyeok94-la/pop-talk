from uuid import UUID

import jwt
from fastapi import Header

from app.config import get_settings
from app.problems import ProblemError


async def require_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise ProblemError(401, "Authentication Required", "Bearer token is missing.")
    settings = get_settings()
    try:
        return jwt.decode(authorization[7:], settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise ProblemError(401, "Authentication Required", "Access token is invalid or expired.") from exc


async def require_admin(authorization: str | None = Header(default=None)) -> dict:
    claims = await require_user(authorization)
    if claims.get("role") not in {"ADMIN", "SUPER_ADMIN"}:
        raise ProblemError(403, "Admin Permission Required", "This endpoint is restricted to administrators.")
    return claims


def subject_id(claims: dict) -> UUID:
    try:
        return UUID(str(claims["sub"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise ProblemError(401, "Authentication Required", "Access token subject is invalid.") from exc
