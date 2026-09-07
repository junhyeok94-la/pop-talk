from __future__ import annotations

import json
import re

import asyncpg

from app.config import get_settings


_pool: asyncpg.Pool | None = None
_SCHEMA_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _asyncpg_dsn() -> str:
    return get_settings().database_url.replace("postgresql+asyncpg://", "postgresql://", 1)


def validate_database_schema(schema: str) -> str:
    schema = schema.strip()
    if not schema:
        raise RuntimeError("DATABASE_SCHEMA must be configured (for example: dev or prd).")
    if not _SCHEMA_NAME_PATTERN.fullmatch(schema) or schema.lower().startswith("pg_"):
        raise RuntimeError(f"Invalid DATABASE_SCHEMA: {schema!r}")
    return schema


def _database_schema() -> str:
    return validate_database_schema(get_settings().database_schema)


async def _initialize_connection(connection: asyncpg.Connection) -> None:
    expected_schema = _database_schema()
    current_schema = await connection.fetchval("SELECT current_schema()")
    if current_schema != expected_schema:
        raise RuntimeError(
            f"Configured DATABASE_SCHEMA {expected_schema!r} is unavailable; "
            f"PostgreSQL selected {current_schema!r}."
        )
    for type_name in ("json", "jsonb"):
        await connection.set_type_codec(
            type_name,
            schema="pg_catalog",
            encoder=json.dumps,
            decoder=json.loads,
            format="text",
        )


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=_asyncpg_dsn(),
            server_settings={"search_path": f'"{_database_schema()}", public'},
            min_size=1,
            max_size=10,
            command_timeout=30,
            init=_initialize_connection,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
