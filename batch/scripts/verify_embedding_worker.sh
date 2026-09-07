#!/usr/bin/env bash
set -euo pipefail

# This verification is intentionally offline: it does not connect to PostgreSQL
# or CLOVA Studio.  Run it inside the batch virtual environment after pip install.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"

cd "${PROJECT_ROOT}"
"${PYTHON_BIN}" -m compileall -q embedding/worker.py scheduler
"${PYTHON_BIN}" -m compileall -q scripts/preflight_embedding_worker.py
"${PYTHON_BIN}" -m embedding.worker --help >/dev/null
"${PYTHON_BIN}" - <<'PY'
from embedding.worker import (
    DEFAULT_MAX_TEXT_CHARS,
    EMBEDDING_DIMENSION,
    build_movie_profile_text,
)
from scheduler.database import asyncpg_server_settings, validate_database_schema

profile = build_movie_profile_text(
    {
        "movie_id": 1,
        "title_ko": "테스트 영화",
        "genres": ["드라마"],
        "directors": ["감독"],
        "actors": ["배우"],
        "plot": "줄거리",
    },
    DEFAULT_MAX_TEXT_CHARS,
)
assert "테스트 영화" in profile
assert EMBEDDING_DIMENSION == 1024
assert validate_database_schema("dev") == "dev"
assert asyncpg_server_settings("prd")["search_path"] == '"prd", public'
try:
    validate_database_schema("dev, public")
except ValueError:
    pass
else:
    raise AssertionError("unsafe schema name was accepted")
print("embedding worker static verification passed")
PY
