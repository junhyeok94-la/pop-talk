"""PostgreSQL connection helpers shared by batch processes."""

from __future__ import annotations

import re

import asyncpg


_SCHEMA_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def validate_database_schema(schema: str) -> str:
    """Validate a trusted PostgreSQL schema identifier from configuration."""
    normalized = schema.strip()
    if not normalized:
        raise ValueError("DATABASE_SCHEMA must be configured (for example: dev or prd).")
    if not _SCHEMA_NAME_PATTERN.fullmatch(normalized) or normalized.lower().startswith("pg_"):
        raise ValueError(f"Invalid DATABASE_SCHEMA: {schema!r}")
    return normalized


def asyncpg_server_settings(schema: str) -> dict[str, str]:
    validated = validate_database_schema(schema)
    return {"search_path": f'"{validated}", public'}


async def connect(database_url: str, schema: str) -> asyncpg.Connection:
    validated_schema = validate_database_schema(schema)
    dsn = database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    connection = await asyncpg.connect(
        dsn,
        server_settings=asyncpg_server_settings(validated_schema),
    )
    current_schema = await connection.fetchval("SELECT current_schema()")
    if current_schema != validated_schema:
        await connection.close()
        raise RuntimeError(
            f"Configured DATABASE_SCHEMA {validated_schema!r} is unavailable; "
            f"PostgreSQL selected {current_schema!r}."
        )
    return connection
