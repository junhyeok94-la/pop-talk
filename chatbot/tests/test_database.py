import pytest
from pydantic import ValidationError
from app import database
from app.database import validate_database_schema
from app.schemas.chat import ChatRequest


@pytest.mark.parametrize("schema", ["dev", "prd", "popcorn_dev", "Tenant1"])
def test_validate_database_schema_accepts_identifiers(schema: str) -> None:
    assert validate_database_schema(schema) == schema


@pytest.mark.parametrize("schema", ["", "dev, public", "dev; DROP SCHEMA prd", "pg_temp"])
def test_validate_database_schema_rejects_unsafe_values(schema: str) -> None:
    with pytest.raises(RuntimeError):
        validate_database_schema(schema)


class FakeConnection:
    def __init__(self, current_schema: str) -> None:
        self.current_schema = current_schema
        self.codecs: list[str] = []

    async def fetchval(self, _: str) -> str:
        return self.current_schema

    async def set_type_codec(self, type_name: str, **_: object) -> None:
        self.codecs.append(type_name)


@pytest.mark.asyncio
async def test_initialize_connection_accepts_configured_schema(monkeypatch) -> None:
    monkeypatch.setattr(database, "_database_schema", lambda: "dev")
    connection = FakeConnection("dev")

    await database._initialize_connection(connection)

    assert connection.codecs == ["json", "jsonb"]


@pytest.mark.asyncio
async def test_initialize_connection_rejects_public_fallback(monkeypatch) -> None:
    monkeypatch.setattr(database, "_database_schema", lambda: "prd")
    connection = FakeConnection("public")

    with pytest.raises(RuntimeError, match="is unavailable"):
        await database._initialize_connection(connection)


def test_chat_request_is_anonymous_and_rejects_user_id() -> None:
    request = ChatRequest(message="영화 추천해 줘")
    assert request.session_id is None
    assert "user_id" not in request.model_dump()
    with pytest.raises(ValidationError, match="user_id"):
        ChatRequest(message="영화 추천해 줘", user_id=1)
