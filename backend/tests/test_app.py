import os
from decimal import Decimal
from uuid import UUID

os.environ.setdefault("DATABASE_SCHEMA", "dev")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-at-least-32-bytes")

import jwt
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.movie_category_preferences import validate_movie_categories
from app.problems import ProblemError
from app.schemas import OnboardingUpdate, RegisterRequest, ReviewCreate


class FakePool:
    async def fetchval(self, query, *args):
        return 1


def test_health(monkeypatch):
    async def fake_pool(): return FakePool()
    monkeypatch.setattr("app.main.get_pool", fake_pool)
    with TestClient(app) as client:
        result = client.get("/health")
    assert result.status_code == 200
    assert result.json() == {"status": "ok", "database": "connected"}


def test_query_validation_uses_problem_json():
    with TestClient(app) as client:
        result = client.post("/auth/login", json={"email": "not-an-email", "password": "short"})
    assert result.status_code == 422
    assert result.headers["content-type"].startswith("application/problem+json")
    assert result.json()["status"] == 422


def test_members_requires_admin_token():
    with TestClient(app) as client:
        result = client.get("/members")
    assert result.status_code == 401
    assert result.headers["content-type"].startswith("application/problem+json")


def test_movie_admin_routes_reject_normal_member_token():
    token = jwt.encode(
        {"sub": "00000000-0000-4000-8000-000000000001", "role": "USER"},
        "test-secret-that-is-at-least-32-bytes",
        algorithm="HS256",
    )
    with TestClient(app) as client:
        result = client.get("/movies", headers={"Authorization": f"Bearer {token}"})
    assert result.status_code == 403


def test_openapi_exposes_all_movie_catalog_and_no_manual_embedding_endpoint():
    schema = app.openapi()
    catalog_operation = schema["paths"]["/catalog/movies"]["get"]

    assert "모든 서비스 영화" in catalog_operation["description"]
    assert "/movies/{movie_id}/embedding" not in schema["paths"]
    assert "/popcorn-movies" not in schema["paths"]


def test_review_rating_requires_half_star_increment():
    review = ReviewCreate(movie_id=1, rating=Decimal("4.5"), content="좋았습니다")
    assert review.rating == Decimal("4.5")
    try:
        ReviewCreate(movie_id=1, rating=Decimal("4.2"), content="좋았습니다")
    except ValueError:
        pass
    else:
        raise AssertionError("ratings outside 0.5-point increments must be rejected")


def test_register_request_requires_and_deduplicates_movie_categories():
    request = RegisterRequest(
        email="member@example.com",
        password="password123",
        nickname="movie fan",
        movie_category_ids=[3, 1, 3],
    )
    assert request.movie_category_ids == [3, 1]

    with pytest.raises(ValueError):
        RegisterRequest(
            email="member@example.com",
            password="password123",
            nickname="movie fan",
            movie_category_ids=[],
        )


def test_onboarding_update_uses_movie_categories_only():
    request = OnboardingUpdate(movie_category_ids=[3, 1, 3])

    assert request.movie_category_ids == [3, 1]
    assert set(OnboardingUpdate.model_fields) == {"movie_category_ids"}


def test_openapi_exposes_public_movie_categories_and_registration_field():
    schema = app.openapi()

    assert "/catalog/movie-categories" in schema["paths"]
    # 화면 문구 조회는 홈 알약용으로 따로 열려 있다. 회원가입 선택지는 위의
    # movie-categories이며, 그 구분은 아래 두 단언이 계속 지킨다.
    assert "/catalog/display-categories" in schema["paths"]
    register_schema = schema["components"]["schemas"]["RegisterRequest"]
    assert "movie_category_ids" in register_schema["required"]
    assert register_schema["properties"]["movie_category_ids"]["minItems"] == 1


def test_public_movie_categories_uses_onboarding_source_table(monkeypatch):
    class Pool:
        async def fetch(self, query):
            assert "FROM movie_categories" in query
            assert "type" in query
            assert "FROM display_categories" not in query
            return [
                {
                    "id": 6,
                    "code": "ADAPTED_ORIGIN",
                    "name": "원작이 있는 영화",
                    "type": "THEME",
                    "description": "소설·웹툰 원작",
                    "sort_order": 6,
                }
            ]

    async def fake_pool():
        return Pool()

    monkeypatch.setattr("app.public_catalog.get_pool", fake_pool)
    with TestClient(app) as client:
        response = client.get("/catalog/movie-categories")

    assert response.status_code == 200
    assert response.json()["items"] == [
        {
            "id": 6,
            "code": "ADAPTED_ORIGIN",
            "name": "원작이 있는 영화",
            "type": "THEME",
            "description": "소설·웹툰 원작",
            "sort_order": 6,
        }
    ]


def test_public_display_categories_returns_pill_rows(monkeypatch):
    """홈 알약 문구를 어드민 테이블 그대로 내려주는지 확인한다.

    어드민 마이그레이션 011에서 display_categories의 code와 category_id가
    사라지고 category_codes(text[])로 바뀌었다. 옛 컬럼을 다시 읽으면
    조회가 통째로 실패하므로 그 회귀를 여기서 막는다.
    """

    class Pool:
        async def fetch(self, query):
            assert "FROM display_categories" in query
            assert "short_label" in query
            assert "category_codes" in query
            assert "is_active" in query
            # 011에서 사라진 컬럼
            assert "category_id" not in query
            return [
                {
                    "id": 25,
                    "name": "퇴근하고 편하게 쉬면서 볼 영화가 필요해요.",
                    "short_label": "퇴근 후 힐링",
                    "category_codes": ["AFTER_WORK"],
                    "description": "하루 끝에 부담 없이 보는 영화",
                    "sort_order": 1,
                    "is_active": True,
                    "created_by": "김운영",
                    "updated_by": "김운영",
                    "created_at": None,
                    "updated_at": None,
                }
            ]

    async def fake_pool():
        return Pool()

    monkeypatch.setattr("app.public_catalog.get_pool", fake_pool)
    with TestClient(app) as client:
        response = client.get("/catalog/display-categories")

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["id"] == 25
    assert item["short_label"] == "퇴근 후 힐링"
    assert item["category_codes"] == ["AFTER_WORK"]
    # 꺼진 문구를 거르는 일은 호출부의 몫이라 is_active를 그대로 실어 보낸다.
    assert item["is_active"] is True


def test_movie_category_validation_rejects_missing_or_inactive_ids():
    class Connection:
        async def fetch(self, query, category_ids):
            assert "is_active = TRUE" in query
            assert "FROM movie_categories" in query
            assert category_ids == [1, 2]
            return [{"id": 1}]

    async def validate():
        with pytest.raises(ProblemError) as error:
            await validate_movie_categories(Connection(), [1, 2])
        assert error.value.status == 422
        assert "invalid_ids=[2]" in error.value.detail

    import asyncio

    asyncio.run(validate())


def test_save_onboarding_updates_users_without_profile_table(monkeypatch):
    from app.profiles import save_onboarding

    class Context:
        def __init__(self, value):
            self.value = value

        async def __aenter__(self):
            return self.value

        async def __aexit__(self, *_):
            return None

    class Connection:
        def transaction(self):
            return Context(self)

        async def fetch(self, query, category_ids):
            assert "FROM movie_categories" in query
            return [{"id": category_id} for category_id in category_ids]

        async def fetchrow(self, query, *args):
            assert "UPDATE users" in query
            assert "onboarding_profiles" not in query
            return {
                "user_id": args[0],
                "onboarding_status": "COMPLETED",
                "onboarding_movie_category_ids": args[1],
                "updated_at": "2026-08-12 12:00:00",
            }

    class Pool:
        def acquire(self):
            return Context(Connection())

    async def fake_pool():
        return Pool()

    monkeypatch.setattr("app.profiles.get_pool", fake_pool)

    async def update():
        return await save_onboarding(
            OnboardingUpdate(movie_category_ids=[3, 1, 3]),
            {"sub": "00000000-0000-4000-8000-000000000010"},
        )

    import asyncio

    result = asyncio.run(update())
    assert result["onboarding_status"] == "COMPLETED"
    assert result["movie_category_ids"] == [3, 1]


def test_register_saves_multiple_movie_categories_and_completes_onboarding(monkeypatch):
    class Context:
        def __init__(self, value):
            self.value = value

        async def __aenter__(self):
            return self.value

        async def __aexit__(self, *_):
            return None

    class Connection:
        insert_args = None

        def transaction(self):
            return Context(self)

        async def fetch(self, _, category_ids):
            return [{"id": category_id} for category_id in category_ids]

        async def fetchrow(self, query, *args):
            assert "onboarding_movie_category_ids" in query
            assert "'COMPLETED'" in query
            self.insert_args = args
            return {
                "id": UUID("00000000-0000-4000-8000-000000000010"),
                "email": args[0],
                "nickname": args[1],
                "role": "USER",
                "status": "ACTIVE",
                "onboarding_status": "COMPLETED",
                "onboarding_movie_category_ids": args[3],
                "joined_at": "2026-08-12 12:00:00",
            }

    class Pool:
        def __init__(self):
            self.connection = Connection()

        def acquire(self):
            return Context(self.connection)

    pool = Pool()

    async def fake_pool():
        return pool

    async def fake_issue(*_args, **_kwargs):
        return "refresh-token"

    monkeypatch.setattr("app.auth.get_pool", fake_pool)
    monkeypatch.setattr("app.auth._issue", fake_issue)
    monkeypatch.setattr("app.auth._access_token", lambda *_: "access-token")
    monkeypatch.setattr("app.auth.bcrypt.gensalt", lambda rounds: b"salt")
    monkeypatch.setattr("app.auth.bcrypt.hashpw", lambda *_: b"password-hash")

    with TestClient(app) as client:
        response = client.post(
            "/auth/register",
            json={
                "email": "MEMBER@example.com",
                "password": "password123",
                "nickname": "movie fan",
                "movie_category_ids": [3, 1, 3],
            },
        )

    assert response.status_code == 201
    assert pool.connection.insert_args[0] == "member@example.com"
    assert pool.connection.insert_args[3] == [3, 1]
    assert response.json()["admin"]["onboarding_status"] == "COMPLETED"
    assert response.json()["admin"]["movie_category_ids"] == [3, 1]
