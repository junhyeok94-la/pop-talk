"""Read-only production readiness checks for the movie embedding worker."""

from __future__ import annotations

import asyncio
import os
import sys
from collections.abc import Iterable
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scheduler.database import connect


load_dotenv(PROJECT_ROOT / "scheduler" / ".env")
load_dotenv(PROJECT_ROOT / ".env")


def print_counts(title: str, rows: Iterable[object]) -> None:
    values = list(rows)
    rendered = ", ".join(f"{row['status']}={row['count']}" for row in values)
    print(f"{title}: {rendered or 'none'}")


async def main() -> None:
    database_url = os.getenv("DATABASE_URL", "").strip()
    database_schema = os.getenv("DATABASE_SCHEMA", "").strip()
    clova_key = os.getenv("CLOVA_EMBEDDING_API_KEY", "").strip()
    if not database_url:
        raise SystemExit("DATABASE_URL is required in scheduler/.env")
    if not database_schema:
        raise SystemExit("DATABASE_SCHEMA is required in scheduler/.env")
    if not clova_key:
        raise SystemExit("CLOVA_EMBEDDING_API_KEY is required in scheduler/.env")

    conn = await connect(database_url, database_schema)
    try:
        current_user = await conn.fetchval("SELECT current_user")
        current_schema = await conn.fetchval("SELECT current_schema()")
        print(f"database_schema: {current_schema}")
        print(f"database_user: {current_user}")
        print("clova_key_configured: true")

        required_relations = (
            "popcorn_movies",
            "popcorn_movie_embeddings",
            "movie_embedding_jobs",
        )
        missing = []
        for relation in required_relations:
            exists = await conn.fetchval("SELECT to_regclass($1) IS NOT NULL", relation)
            print(f"relation.{relation}: {'ok' if exists else 'missing'}")
            if not exists:
                missing.append(relation)

        domain_exists = await conn.fetchval(
            "SELECT to_regtype($1) IS NOT NULL",
            f"{database_schema}.embedding_vector_1024",
        )
        print(f"domain.embedding_vector_1024: {'ok' if domain_exists else 'missing'}")

        if missing:
            raise SystemExit(
                "required relations are missing: " + ", ".join(missing)
            )
        if not domain_exists:
            raise SystemExit("schema-scoped embedding_vector_1024 domain is missing")

        trigger_exists = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1
                  FROM pg_trigger
                 WHERE tgrelid = 'popcorn_movies'::regclass
                   AND tgname = 'trg_queue_movie_embedding'
                   AND NOT tgisinternal
            )
            """
        )
        print(f"trigger.trg_queue_movie_embedding: {'ok' if trigger_exists else 'missing'}")

        permissions = await conn.fetchrow(
            """
            SELECT
                has_table_privilege(current_user, 'popcorn_movies', 'SELECT') AS movies_select,
                has_table_privilege(current_user, 'popcorn_movie_embeddings',
                                    'SELECT,INSERT,UPDATE,DELETE') AS embeddings_write,
                has_table_privilege(current_user, 'movie_embedding_jobs',
                                    'SELECT,INSERT,UPDATE,DELETE') AS jobs_write
            """
        )
        for name, allowed in dict(permissions).items():
            print(f"permission.{name}: {'ok' if allowed else 'missing'}")

        movie_count = await conn.fetchval("SELECT count(*) FROM popcorn_movies")
        eligible_count = await conn.fetchval(
            """
            SELECT count(*)
              FROM popcorn_movies
             WHERE service_status = 'PUBLISHED'
               AND approval_status = 'APPROVED'
            """
        )
        ready_count = await conn.fetchval(
            """
            SELECT count(DISTINCT movie_id)
              FROM popcorn_movie_embeddings
             WHERE document_type = 'PROFILE'
               AND embedding_model = 'bge-m3'
               AND status = 'READY'
               AND embedding IS NOT NULL
            """
        )
        missing_embedding_count = await conn.fetchval(
            """
            SELECT count(*)
              FROM popcorn_movies m
             WHERE m.service_status = 'PUBLISHED'
               AND m.approval_status = 'APPROVED'
               AND NOT EXISTS (
                    SELECT 1
                      FROM popcorn_movie_embeddings e
                     WHERE e.movie_id = m.id
                       AND e.document_type = 'PROFILE'
                       AND e.embedding_model = 'bge-m3'
                       AND e.status = 'READY'
                       AND e.embedding IS NOT NULL
               )
            """
        )
        print(f"movies.total: {movie_count}")
        print(f"movies.embedding_eligible: {eligible_count}")
        print(f"movies.embedding_ready: {ready_count}")
        print(f"movies.embedding_missing: {missing_embedding_count}")

        print_counts(
            "jobs",
            await conn.fetch(
                """
                SELECT status::text AS status, count(*) AS count
                  FROM movie_embedding_jobs
                 GROUP BY status
                 ORDER BY status
                """
            ),
        )

        failed_checks = [
            not trigger_exists,
            not all(dict(permissions).values()),
        ]
        if any(failed_checks):
            raise SystemExit("embedding worker preflight failed")
        print("preflight: passed")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
