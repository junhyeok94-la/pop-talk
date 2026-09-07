from __future__ import annotations

import re

import asyncpg

from app.config import get_settings

_pool: asyncpg.Pool | None = None
_SCHEMA_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def validate_schema(schema: str) -> str:
    schema = schema.strip()
    if not schema or not _SCHEMA_PATTERN.fullmatch(schema) or schema.lower().startswith("pg_"):
        raise RuntimeError("DATABASE_SCHEMA must be a valid explicit schema name (for example dev or prd).")
    return schema


def _dsn() -> str:
    url = get_settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL is required.")
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def _initialize(connection: asyncpg.Connection) -> None:
    expected = validate_schema(get_settings().database_schema)
    current = await connection.fetchval("select current_schema()")
    if current != expected:
        raise RuntimeError(f"Configured DATABASE_SCHEMA {expected!r} is unavailable (current: {current!r}).")


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        schema = validate_schema(get_settings().database_schema)
        _pool = await asyncpg.create_pool(
            dsn=_dsn(), min_size=1, max_size=10, command_timeout=30,
            server_settings={"search_path": f'"{schema}", public'}, init=_initialize,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
