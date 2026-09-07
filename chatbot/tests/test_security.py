from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
import pytest
from fastapi import HTTPException

from app.config import Settings
from app.security import optional_user_id


def test_anonymous_request_has_no_user_id() -> None:
    assert optional_user_id(None) is None


def test_valid_was_access_token_returns_subject_uuid(monkeypatch) -> None:
    user_id = uuid4()
    secret = "shared-test-secret-with-at-least-32-bytes"
    token = jwt.encode(
        {
            "sub": str(user_id),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        secret,
        algorithm="HS256",
    )
    monkeypatch.setattr("app.security.get_settings", lambda: Settings(jwt_secret=secret))

    assert optional_user_id(f"Bearer {token}") == user_id


def test_invalid_access_token_is_rejected(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.security.get_settings",
        lambda: Settings(jwt_secret="shared-test-secret-with-at-least-32-bytes"),
    )

    with pytest.raises(HTTPException) as exc_info:
        optional_user_id("Bearer invalid")

    assert exc_info.value.status_code == 401
