from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from app.repositories.chat_repository import ChatRepository


class FakeTransaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_: object):
        return None


class FakeConnection:
    def __init__(self) -> None:
        self.rows: list[tuple] = []

    def transaction(self) -> FakeTransaction:
        return FakeTransaction()

    async def fetchrow(self, *_: object):
        return None

    async def execute(self, *_: object) -> None:
        return None

    async def executemany(self, _: str, rows: list[tuple]) -> None:
        self.rows = rows


class FakeAcquire:
    def __init__(self, connection: FakeConnection) -> None:
        self.connection = connection

    async def __aenter__(self) -> FakeConnection:
        return self.connection

    async def __aexit__(self, *_: object):
        return None


class FakePool:
    def __init__(self) -> None:
        self.connection = FakeConnection()

    def acquire(self) -> FakeAcquire:
        return FakeAcquire(self.connection)


class PreferencePool:
    def __init__(self) -> None:
        self.query = ""
        self.args: tuple[object, ...] = ()

    async def fetchrow(self, query: str, *args: object):
        self.query = query
        self.args = args
        return {
            "onboarding_status": "COMPLETED",
            "movie_category_ids": [3, 7],
            "movie_categories": [
                {"id": 3, "code": "ROMANCE", "name": "로맨스", "aliases": ["설렘"], "type": "GENRE"},
                {"id": 7, "code": "HEALING", "name": "힐링", "aliases": ["위로"], "type": "MOOD"},
            ],
        }


@pytest.mark.asyncio
async def test_save_exchange_normalizes_uuid_evidence_for_jsonb(monkeypatch) -> None:
    pool = FakePool()

    async def get_pool() -> FakePool:
        return pool

    monkeypatch.setattr("app.repositories.chat_repository.get_pool", get_pool)
    session_id = str(uuid4())
    review_id = uuid4()

    await ChatRepository().save_exchange(
        session_id=session_id,
        question="헤레틱 네이버 관람평을 알려줘",
        intent="review_summary",
        answer="대표 관람평입니다.",
        sources=[{"type": "review", "review_id": review_id, "movie_id": 1003}],
    )

    user_row, assistant_row = pool.connection.rows
    assert user_row[0] == UUID(session_id)
    assert assistant_row[4][0]["review_id"] == str(review_id)


@pytest.mark.asyncio
async def test_save_exchange_associates_authenticated_user_with_session(monkeypatch) -> None:
    pool = FakePool()

    async def get_pool() -> FakePool:
        return pool

    monkeypatch.setattr("app.repositories.chat_repository.get_pool", get_pool)
    user_id = uuid4()

    await ChatRepository().save_exchange(
        session_id=str(uuid4()),
        question="내 취향에 맞는 영화 추천해줘",
        intent="recommendation",
        answer="추천 영화입니다.",
        sources=[],
        user_id=user_id,
    )

    assert pool.connection.rows


@pytest.mark.asyncio
async def test_load_user_preferences_uses_movie_categories(monkeypatch) -> None:
    pool = PreferencePool()

    async def get_pool() -> PreferencePool:
        return pool

    monkeypatch.setattr("app.repositories.chat_repository.get_pool", get_pool)
    user_id = uuid4()

    preferences = await ChatRepository().load_user_preferences(user_id=user_id)

    assert pool.args == (user_id,)
    assert "onboarding_movie_category_ids" in pool.query
    assert "LEFT JOIN movie_categories m" in pool.query
    assert "'aliases', COALESCE(m.aliases" in pool.query
    assert "display_categories" not in pool.query
    assert preferences["movie_category_ids"] == [3, 7]
    assert [category["name"] for category in preferences["movie_categories"]] == [
        "로맨스",
        "힐링",
    ]
