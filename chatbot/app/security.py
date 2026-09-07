from __future__ import annotations

from uuid import UUID

import jwt
from fastapi import Header, HTTPException

from app.config import get_settings


def optional_user_id(authorization: str | None = Header(default=None)) -> UUID | None:
    """Authenticate an optional WAS access token without trusting a body user_id."""
    if authorization is None:
        return None
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token is required.")
    secret = get_settings().jwt_secret
    if not secret:
        raise HTTPException(status_code=503, detail="JWT authentication is not configured.")
    try:
        claims = jwt.decode(authorization[7:], secret, algorithms=["HS256"])
        return UUID(str(claims["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired access token.") from exc
