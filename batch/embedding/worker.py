"""Consume movie embedding jobs using CLOVA Studio Embedding v2.

The worker claims jobs atomically, processes the CLOVA request outside a DB
transaction, and completes jobs only while it still owns their lease.  This
keeps multiple worker instances safe without holding PostgreSQL locks during
network calls.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import logging
import os
import random
import re
import sys
from pathlib import Path
from typing import Any

import asyncpg
import httpx
from dotenv import load_dotenv

from scheduler.database import connect

BATCH_DIR = Path(__file__).parent
PROJECT_ROOT = BATCH_DIR.parent
load_dotenv(PROJECT_ROOT / "scheduler" / ".env")
load_dotenv(PROJECT_ROOT / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("embedding_worker")

EMBEDDING_DIMENSION = 1024
DEFAULT_MAX_TEXT_CHARS = 6_000
RETRIABLE_HTTP_STATUS_CODES = {408, 429, 500, 502, 503, 504}
DEFAULT_REQUEST_INTERVAL_SECONDS = 1.1

CLOVA_EMBEDDING_HOST = os.getenv(
    "CLOVA_EMBEDDING_HOST", "clovastudio.stream.ntruss.com"
).strip()
CLOVA_EMBEDDING_API_KEY = os.getenv(
    "CLOVA_EMBEDDING_API_KEY", os.getenv("CLOVA_STUDIO_API_KEY", "")
).strip()
CLOVA_REQUEST_ID = os.getenv("CLOVA_EMBEDDING_REQUEST_ID", "").strip()
DATABASE_SCHEMA = os.getenv("DATABASE_SCHEMA", "").strip()


class ClovaEmbeddingError(RuntimeError):
    """An API response or transport failure returned by CLOVA Embedding."""

    def __init__(
        self,
        message: str,
        *,
        http_status: int | None = None,
        api_code: str | None = None,
        retry_after_seconds: float | None = None,
    ) -> None:
        super().__init__(message)
        self.http_status = http_status
        self.api_code = api_code
        self.retry_after_seconds = retry_after_seconds

    @property
    def retriable(self) -> bool:
        return (
            self.http_status in RETRIABLE_HTTP_STATUS_CODES
            or (self.api_code is not None and self.api_code.startswith("429"))
            or (self.api_code is not None and self.api_code.startswith("5"))
        )


def parse_rate_limit_seconds(value: str | None) -> float | None:
    """Parse CLOVA reset headers such as ``23s`` (and Retry-After seconds)."""
    if not value:
        return None
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(ms|s|m)?\s*", value, re.IGNORECASE)
    if not match:
        return None
    amount = float(match.group(1))
    unit = (match.group(2) or "s").lower()
    if unit == "ms":
        return amount / 1_000
    if unit == "m":
        return amount * 60
    return amount


def rate_limit_delay_from_headers(headers: httpx.Headers) -> float | None:
    """Return the most conservative reset delay advertised by CLOVA."""
    delays = (
        parse_rate_limit_seconds(headers.get("retry-after")),
        parse_rate_limit_seconds(headers.get("x-ratelimit-reset-requests")),
        parse_rate_limit_seconds(headers.get("x-ratelimit-reset-tokens")),
    )
    available = [delay for delay in delays if delay is not None]
    return max(available) if available else None


class LeaseLostError(RuntimeError):
    """The job was recovered by another worker while this worker was running."""


def clova_base_url() -> str:
    """Accept either a host name or a complete HTTPS URL from the environment."""
    host = CLOVA_EMBEDDING_HOST.rstrip("/")
    if host.startswith(("https://", "http://")):
        return host
    return f"https://{host}"


def clova_headers() -> dict[str, str]:
    if not CLOVA_EMBEDDING_API_KEY:
        raise RuntimeError(
            "CLOVA_EMBEDDING_API_KEY (or CLOVA_STUDIO_API_KEY) must be configured."
        )

    api_key = CLOVA_EMBEDDING_API_KEY
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": api_key if api_key.startswith("Bearer ") else f"Bearer {api_key}",
    }
    if CLOVA_REQUEST_ID:
        headers["X-NCP-CLOVASTUDIO-REQUEST-ID"] = CLOVA_REQUEST_ID
    return headers


async def generate_clova_embedding(
    client: httpx.AsyncClient, text: str
) -> list[float]:
    """Call CLOVA Studio Embedding v2 and validate the vector contract."""
    try:
        response = await client.post(
            "/v1/api-tools/embedding/v2",
            headers=clova_headers(),
            json={"text": text},
        )
    except httpx.RequestError as exc:
        raise ClovaEmbeddingError(f"CLOVA request failed: {exc}") from exc

    if response.status_code >= 400:
        raise ClovaEmbeddingError(
            f"CLOVA HTTP {response.status_code}: {response.text[:500]}",
            http_status=response.status_code,
            retry_after_seconds=rate_limit_delay_from_headers(response.headers),
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise ClovaEmbeddingError("CLOVA returned a non-JSON response.") from exc

    status = payload.get("status", {})
    api_code = str(status.get("code", "UNKNOWN"))
    if api_code != "20000":
        raise ClovaEmbeddingError(
            f"CLOVA API error [{api_code}]: {status.get('message', 'unknown error')}",
            http_status=response.status_code,
            api_code=api_code,
            retry_after_seconds=rate_limit_delay_from_headers(response.headers),
        )

    embedding = payload.get("result", {}).get("embedding")
    if not isinstance(embedding, list) or len(embedding) != EMBEDDING_DIMENSION:
        actual_size = len(embedding) if isinstance(embedding, list) else "missing"
        raise ClovaEmbeddingError(
            f"CLOVA returned an invalid embedding dimension: {actual_size}; "
            f"expected {EMBEDDING_DIMENSION}."
        )

    try:
        return [float(value) for value in embedding]
    except (TypeError, ValueError) as exc:
        raise ClovaEmbeddingError("CLOVA embedding contains a non-numeric value.") from exc


async def generate_embedding(
    client: httpx.AsyncClient,
    text: str,
    api_attempts: int,
    request_interval: float,
) -> list[float]:
    """Retry only transient API failures; permanent failures return to the queue."""
    for attempt in range(1, api_attempts + 1):
        try:
            embedding = await generate_clova_embedding(client, text)
            if request_interval:
                await asyncio.sleep(request_interval)
            return embedding
        except ClovaEmbeddingError as exc:
            if not exc.retriable or attempt == api_attempts:
                cooldown = request_interval
                if exc.retriable:
                    cooldown = max(cooldown, exc.retry_after_seconds or 0.0)
                if cooldown:
                    await asyncio.sleep(cooldown)
                raise
            exponential_delay = min(20.0, float(2 ** (attempt - 1)))
            header_delay = exc.retry_after_seconds or 0.0
            delay = max(exponential_delay, header_delay) + random.uniform(0.25, 0.75)
            logger.warning(
                "Transient CLOVA failure (attempt %s/%s); retrying in %.1fs: %s",
                attempt,
                api_attempts,
                delay,
                exc,
            )
            await asyncio.sleep(delay)

    raise AssertionError("unreachable")


def build_movie_profile_text(movie: dict[str, Any], max_chars: int) -> str:
    """Build a bounded profile document suitable for a single embedding request."""
    parts: list[str] = []
    fields = (
        ("영화 제목", movie.get("title_ko")),
        ("영문 제목", movie.get("title_en")),
        ("개봉일", movie.get("release_date")),
        ("관람등급", movie.get("viewing_grade")),
        ("줄거리", movie.get("plot")),
    )
    for label, value in fields:
        if value:
            parts.append(f"{label}: {value}")

    for label, key, limit in (
        ("장르", "genres", None),
        ("감독", "directors", None),
        ("출연", "actors", 5),
    ):
        value = movie.get(key)
        if isinstance(value, list) and value:
            parts.append(f"{label}: {', '.join(value[:limit])}")

    profile_text = " | ".join(parts).strip()
    if not profile_text:
        raise ValueError("Movie profile is empty; refusing to create a meaningless embedding.")
    if len(profile_text) > max_chars:
        logger.warning(
            "Movie %s profile exceeds %s characters; truncating before embedding.",
            movie.get("movie_id", "unknown"),
            max_chars,
        )
        return profile_text[:max_chars]
    return profile_text


async def claim_movie_embedding_jobs(
    conn: asyncpg.Connection, batch_size: int, lease_seconds: int
) -> list[asyncpg.Record]:
    """Atomically claim pending or expired jobs without holding locks during HTTP."""
    return await conn.fetch(
        """
        WITH candidates AS (
            SELECT j.id
              FROM movie_embedding_jobs j
             WHERE j.attempts < j.max_attempts
               AND (
                    (j.status = 'PENDING' AND j.available_at <= CURRENT_TIMESTAMP)
                 OR (
                        j.status = 'PROCESSING'
                    AND (j.lease_expires_at IS NULL OR j.lease_expires_at <= CURRENT_TIMESTAMP)
                    )
               )
             ORDER BY j.id ASC
             LIMIT $1
             FOR UPDATE SKIP LOCKED
        ), claimed AS (
            UPDATE movie_embedding_jobs j
               SET status = 'PROCESSING',
                   attempts = j.attempts + 1,
                   last_error = NULL,
                   started_at = CURRENT_TIMESTAMP,
                   finished_at = NULL,
                   lease_token = gen_random_uuid(),
                   lease_expires_at = CURRENT_TIMESTAMP
                                      + ($2::integer * INTERVAL '1 second')
              FROM candidates c
             WHERE j.id = c.id
         RETURNING j.id AS job_id, j.movie_id, j.embedding_model, j.operation,
                   j.attempts, j.max_attempts, j.lease_token
        )
        SELECT c.*, m.title_ko, m.title_en, m.genres, m.release_date,
               m.directors, m.actors, m.viewing_grade, m.plot
          FROM claimed c
          JOIN popcorn_movies m ON m.id = c.movie_id
        """,
        batch_size,
        lease_seconds,
    )


async def complete_movie_job(
    conn: asyncpg.Connection,
    job: asyncpg.Record,
    profile_text: str | None = None,
    vector: list[float] | None = None,
) -> None:
    """Persist the vector and success state atomically while the lease is valid."""

    async with conn.transaction():
        if job["operation"] == "DELETE":
            await conn.execute(
                """
                DELETE FROM popcorn_movie_embeddings
                 WHERE movie_id = $1 AND embedding_model = $2
                """,
                job["movie_id"],
                job["embedding_model"] or "bge-m3",
            )
        else:
            if profile_text is None or vector is None:
                raise ValueError("UPSERT job requires profile text and an embedding vector.")
            vector_text = "[" + ",".join(map(str, vector)) + "]"
            content_hash = hashlib.sha256(profile_text.encode("utf-8")).hexdigest()
            await conn.execute(
                """
                INSERT INTO popcorn_movie_embeddings (
                    movie_id, document_type, chunk_no, embedding_model,
                    status, embedding_text, content_hash, embedding, embedded_at
                ) VALUES ($1, 'PROFILE', 0, $2, 'READY', $3, $4,
                          $5::embedding_vector_1024, CURRENT_TIMESTAMP)
                ON CONFLICT (movie_id, document_type, chunk_no, embedding_model)
                DO UPDATE SET
                    status = 'READY',
                    embedding_text = EXCLUDED.embedding_text,
                    content_hash = EXCLUDED.content_hash,
                    embedding = EXCLUDED.embedding,
                    embedded_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                """,
                job["movie_id"],
                job["embedding_model"] or "bge-m3",
                profile_text,
                content_hash,
                vector_text,
            )

        result = await conn.execute(
            """
            UPDATE movie_embedding_jobs
               SET status = 'SUCCEEDED',
                   finished_at = CURRENT_TIMESTAMP,
                   last_error = NULL,
                   lease_token = NULL,
                   lease_expires_at = NULL
             WHERE id = $1
               AND status = 'PROCESSING'
               AND lease_token = $2
            """,
            job["job_id"],
            job["lease_token"],
        )
        if result != "UPDATE 1":
            raise LeaseLostError(f"Job {job['job_id']} lease expired or was reclaimed.")


async def release_failed_movie_job(
    conn: asyncpg.Connection, job: asyncpg.Record, error: Exception
) -> bool:
    """Requeue transient errors with backoff, otherwise mark the job as failed."""
    retriable = isinstance(error, ClovaEmbeddingError) and error.retriable
    should_retry = retriable and job["attempts"] < job["max_attempts"]
    error_text = str(error)[:4_000]

    if should_retry:
        delay_seconds = min(900, 15 * (2 ** (job["attempts"] - 1))) + random.randint(0, 10)
        result = await conn.execute(
            """
            UPDATE movie_embedding_jobs
               SET status = 'PENDING',
                   last_error = $3,
                   available_at = CURRENT_TIMESTAMP
                                  + ($4::integer * INTERVAL '1 second'),
                   finished_at = CURRENT_TIMESTAMP,
                   lease_token = NULL,
                   lease_expires_at = NULL
             WHERE id = $1 AND status = 'PROCESSING' AND lease_token = $2
            """,
            job["job_id"],
            job["lease_token"],
            error_text,
            delay_seconds,
        )
        logger.warning(
            "Job %s requeued after transient error; next attempt in %ss.",
            job["job_id"],
            delay_seconds,
        )
    else:
        result = await conn.execute(
            """
            UPDATE movie_embedding_jobs
               SET status = 'FAILED',
                   last_error = $3,
                   finished_at = CURRENT_TIMESTAMP,
                   lease_token = NULL,
                   lease_expires_at = NULL
             WHERE id = $1 AND status = 'PROCESSING' AND lease_token = $2
            """,
            job["job_id"],
            job["lease_token"],
            error_text,
        )
    return result == "UPDATE 1"


async def process_movie_embedding_jobs(
    conn: asyncpg.Connection,
    client: httpx.AsyncClient,
    *,
    batch_size: int,
    lease_seconds: int,
    api_attempts: int,
    request_interval: float,
    max_text_chars: int,
) -> tuple[int, int]:
    jobs = await claim_movie_embedding_jobs(conn, batch_size, lease_seconds)
    if not jobs:
        return 0, 0

    logger.info("Claimed %s movie embedding job(s).", len(jobs))
    processed_count = 0
    for job in jobs:
        try:
            if job["operation"] == "DELETE":
                await complete_movie_job(conn, job)
                processed_count += 1
                continue
            profile_text = build_movie_profile_text(dict(job), max_text_chars)
            vector = await generate_embedding(
                client,
                profile_text,
                api_attempts,
                request_interval,
            )
            await complete_movie_job(conn, job, profile_text, vector)
            processed_count += 1
        except LeaseLostError as exc:
            logger.warning("Job %s was not completed: %s", job["job_id"], exc)
        except Exception as exc:
            logger.exception(
                "Movie embedding job %s (movie %s) failed.",
                job["job_id"],
                job["movie_id"],
            )
            if not await release_failed_movie_job(conn, job, exc):
                logger.warning("Job %s failure state was not updated because its lease was lost.", job["job_id"])
    return processed_count, len(jobs)


async def process_review_embedding_jobs(*_: Any) -> int:
    """Reserved for the review queue, which has not been added to the schema yet."""
    return 0


async def run_worker(
    database_url: str,
    *,
    database_schema: str,
    once: bool,
    interval: int,
    batch_size: int,
    lease_seconds: int,
    api_attempts: int,
    request_interval: float,
    max_text_chars: int,
    max_cycles: int | None,
) -> None:
    timeout = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)

    logger.info(
        "Embedding worker started (batch=%s, poll=%ss, lease=%ss, once=%s, request_interval=%.2fs).",
        batch_size,
        interval,
        lease_seconds,
        once,
        request_interval,
    )
    async with httpx.AsyncClient(base_url=clova_base_url(), timeout=timeout) as client:
        cycle_count = 0
        while True:
            try:
                conn = await connect(database_url, database_schema)
                try:
                    movie_count, claimed_movie_count = await process_movie_embedding_jobs(
                        conn,
                        client,
                        batch_size=batch_size,
                        lease_seconds=lease_seconds,
                        api_attempts=api_attempts,
                        request_interval=request_interval,
                        max_text_chars=max_text_chars,
                    )
                    review_count = await process_review_embedding_jobs(conn, client)
                finally:
                    await conn.close()
            except Exception:
                logger.exception("Embedding worker cycle failed.")
                if once or max_cycles is not None:
                    raise
                await asyncio.sleep(min(interval, 60))
                continue

            cycle_count += 1
            total_processed = movie_count + review_count
            if max_cycles is not None and cycle_count >= max_cycles:
                logger.info("Maximum cycle count reached; worker is exiting.")
                return
            if total_processed:
                logger.info(
                    "Completed %s embedding job(s) (movie=%s, review=%s).",
                    total_processed,
                    movie_count,
                    review_count,
                )
                # Drain immediately.  This is essential for an initial queue backlog.
                continue
            if claimed_movie_count:
                # A job may have been requeued after a transient failure while other
                # pending jobs still exist. Continue draining rather than exiting once.
                continue
            if once:
                logger.info("No claimable embedding jobs remain; worker is exiting.")
                return
            await asyncio.sleep(interval)


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("value must be greater than zero")
    return parsed


def non_negative_float(value: str) -> float:
    parsed = float(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("value must be zero or greater")
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser(description="Popcorn movie embedding worker")
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", ""))
    parser.add_argument("--database-schema", default=DATABASE_SCHEMA)
    parser.add_argument("--once", action="store_true", help="Drain claimable jobs, then exit")
    parser.add_argument("--interval", type=positive_int, default=60, help="Idle poll interval in seconds")
    parser.add_argument("--batch-size", type=positive_int, default=20)
    parser.add_argument("--lease-seconds", type=positive_int, default=600)
    parser.add_argument("--api-attempts", type=positive_int, default=3)
    parser.add_argument(
        "--request-interval",
        type=non_negative_float,
        default=float(
            os.getenv(
                "CLOVA_EMBEDDING_REQUEST_INTERVAL_SECONDS",
                DEFAULT_REQUEST_INTERVAL_SECONDS,
            )
        ),
        help="Minimum delay after each CLOVA request (default: 1.1 seconds)",
    )
    parser.add_argument("--max-text-chars", type=positive_int, default=DEFAULT_MAX_TEXT_CHARS)
    parser.add_argument(
        "--max-cycles",
        type=positive_int,
        help="Run at most this many queue-claim cycles (use 1 for a canary).",
    )
    args = parser.parse_args()

    if not args.database_url:
        parser.error("DATABASE_URL or --database-url is required")
    if not args.database_schema:
        parser.error("DATABASE_SCHEMA or --database-schema is required")
    if not CLOVA_EMBEDDING_API_KEY:
        parser.error("CLOVA_EMBEDDING_API_KEY or CLOVA_STUDIO_API_KEY is required")

    try:
        asyncio.run(
            run_worker(
                database_url=args.database_url,
                database_schema=args.database_schema,
                once=args.once,
                interval=args.interval,
                batch_size=args.batch_size,
                lease_seconds=args.lease_seconds,
                api_attempts=args.api_attempts,
                request_interval=args.request_interval,
                max_text_chars=args.max_text_chars,
                max_cycles=args.max_cycles,
            )
        )
    except KeyboardInterrupt:
        logger.info("Embedding worker interrupted.")


if __name__ == "__main__":
    main()
