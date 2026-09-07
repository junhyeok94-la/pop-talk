#!/usr/bin/env python3
"""Validate and import Naver Movie review CSVs into the configured schema."""

from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import os
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable

import asyncpg
from dotenv import load_dotenv

SOURCE_SYSTEM = "naver_movie"
KST = timezone(timedelta(hours=9), name="Asia/Seoul")
SCHEMA_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
TITLE_PATTERN = re.compile(r"[^0-9a-z가-힣]+")


@dataclass(frozen=True)
class SourceReview:
    kofic_movie_cd: str
    title: str
    source_user_key: str
    rating: Decimal
    content: str
    created_at: datetime
    source_review_key: str


def normalize_title(value: str) -> str:
    """Compare titles after removing whitespace and punctuation."""
    return TITLE_PATTERN.sub("", unicodedata.normalize("NFKC", value).casefold())


def parse_created_at(value: str, row_number: int) -> datetime:
    normalized = re.sub(r"\s+", " ", value.strip())
    for fmt in ("%Y.%m.%d. %H:%M", "%Y.%m.%d. %H:%M:%S"):
        try:
            return datetime.strptime(normalized, fmt).replace(tzinfo=KST)
        except ValueError:
            continue
    raise ValueError(f"row {row_number}: unsupported date format {value!r}")


def parse_rating(value: str, row_number: int) -> Decimal:
    try:
        source_score = Decimal(value.strip())
    except InvalidOperation as exc:
        raise ValueError(f"row {row_number}: invalid score {value!r}") from exc
    if source_score != source_score.to_integral_value() or not Decimal("1") <= source_score <= Decimal("10"):
        raise ValueError(f"row {row_number}: score must be an integer from 1 through 10, got {value!r}")
    return source_score / Decimal("2")


def build_source_review_key(
    kofic_movie_cd: str, source_user_key: str, created_at: datetime, content: str, rating: Decimal
) -> str:
    payload = "\n".join(
        (SOURCE_SYSTEM, kofic_movie_cd, source_user_key, created_at.isoformat(), content, str(rating))
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def load_reviews(csv_path: Path) -> list[SourceReview]:
    required_columns = {"title", "user_id", "score", "review", "date", "kofic_movie_cd"}
    reviews: list[SourceReview] = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError("CSV has no header row")
        missing = required_columns - set(reader.fieldnames)
        if missing:
            raise ValueError(f"CSV is missing required columns: {', '.join(sorted(missing))}")
        for row_number, row in enumerate(reader, start=2):
            kofic_movie_cd = (row["kofic_movie_cd"] or "").strip()
            title = (row["title"] or "").strip()
            source_user_key = (row["user_id"] or "").strip()
            content = (row["review"] or "").strip()
            if not kofic_movie_cd or not title or not source_user_key or not content:
                raise ValueError(f"row {row_number}: title, user_id, review, and kofic_movie_cd are required")
            if len(source_user_key) > 64:
                raise ValueError(f"row {row_number}: source user key is longer than 64 characters")
            created_at = parse_created_at(row["date"] or "", row_number)
            rating = parse_rating(row["score"] or "", row_number)
            reviews.append(
                SourceReview(
                    kofic_movie_cd=kofic_movie_cd,
                    title=title,
                    source_user_key=source_user_key,
                    rating=rating,
                    content=content,
                    created_at=created_at,
                    source_review_key=build_source_review_key(
                        kofic_movie_cd, source_user_key, created_at, content, rating
                    ),
                )
            )
    if not reviews:
        raise ValueError("CSV contains no reviews")
    duplicate_keys = [key for key, count in Counter(review.source_review_key for review in reviews).items() if count > 1]
    if duplicate_keys:
        raise ValueError(f"CSV contains {len(duplicate_keys)} duplicate source review signatures")
    return reviews


def load_database_settings(env_file: Path, database_url: str | None, database_schema: str | None) -> tuple[str, str]:
    if env_file.exists():
        load_dotenv(env_file, override=False)
    dsn = database_url or os.getenv("DATABASE_URL", "")
    schema = database_schema or os.getenv("DATABASE_SCHEMA", "")
    if not dsn:
        raise ValueError("DATABASE_URL is required (set it in the env file or pass --database-url)")
    if not SCHEMA_PATTERN.fullmatch(schema):
        raise ValueError("DATABASE_SCHEMA must be an explicit schema name, such as dev or prd")
    return dsn.replace("postgresql+asyncpg://", "postgresql://", 1), schema


async def validate_mappings(
    connection: asyncpg.Connection, schema: str, reviews: Iterable[SourceReview]
) -> dict[str, int]:
    source_titles: dict[str, set[str]] = {}
    for review in reviews:
        source_titles.setdefault(review.kofic_movie_cd, set()).add(normalize_title(review.title))
    codes = sorted(source_titles)
    rows = await connection.fetch(
        f"SELECT id, kofic_movie_cd::text AS kofic_movie_cd, title_ko, title_original, title_en "
        f"FROM {schema}.popcorn_movies WHERE kofic_movie_cd::text = ANY($1::text[])",
        codes,
    )
    movies = {row["kofic_movie_cd"]: row for row in rows}
    missing_codes = sorted(set(codes) - set(movies))
    if missing_codes:
        raise ValueError(f"{len(missing_codes)} KOFIC codes are missing from {schema}.popcorn_movies: {missing_codes[:10]}")

    title_mismatches: list[str] = []
    for code, normalized_titles in source_titles.items():
        movie = movies[code]
        db_titles = {
            normalize_title(value)
            for value in (movie["title_ko"], movie["title_original"], movie["title_en"])
            if value
        }
        if not normalized_titles.issubset(db_titles):
            title_mismatches.append(code)
    if title_mismatches:
        raise ValueError(
            f"{len(title_mismatches)} KOFIC mappings have a normalized title mismatch: {title_mismatches[:10]}"
        )
    return {code: int(movie["id"]) for code, movie in movies.items()}


UPSERT_SQL = """
INSERT INTO reviews (
    movie_id, rating, content, contains_spoiler, status, created_at, updated_at,
    source_system, source_user_key, source_review_key
)
VALUES ($1, $2, $3, FALSE, 'ACTIVE', $4, NOW(), $5, $6, $7)
ON CONFLICT (source_review_key) WHERE source_review_key IS NOT NULL
DO UPDATE SET
    movie_id = EXCLUDED.movie_id,
    rating = EXCLUDED.rating,
    content = EXCLUDED.content,
    contains_spoiler = EXCLUDED.contains_spoiler,
    status = EXCLUDED.status,
    created_at = EXCLUDED.created_at,
    updated_at = NOW(),
    source_system = EXCLUDED.source_system,
    source_user_key = EXCLUDED.source_user_key,
    deleted_at = NULL
"""


def chunks(values: list[tuple[object, ...]], size: int) -> Iterable[list[tuple[object, ...]]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


async def import_reviews(dsn: str, schema: str, reviews: list[SourceReview], dry_run: bool) -> None:
    connection = await asyncpg.connect(dsn, server_settings={"search_path": f'"{schema}", public'})
    try:
        async with connection.transaction(readonly=dry_run):
            movie_ids = await validate_mappings(connection, schema, reviews)
            review_keys = [review.source_review_key for review in reviews]
            existing_count = await connection.fetchval(
                "SELECT count(*) FROM reviews WHERE source_review_key = ANY($1::text[])", review_keys
            )
            if dry_run:
                print(
                    f"dry-run passed: rows={len(reviews)}, movies={len(movie_ids)}, "
                    f"would_insert={len(reviews) - existing_count}, would_update={existing_count}"
                )
                return
            parameters = [
                (
                    movie_ids[review.kofic_movie_cd],
                    review.rating,
                    review.content,
                    review.created_at,
                    SOURCE_SYSTEM,
                    review.source_user_key,
                    review.source_review_key,
                )
                for review in reviews
            ]
            for batch in chunks(parameters, 500):
                await connection.executemany(UPSERT_SQL, batch)
        print(
            f"import complete: rows={len(reviews)}, movies={len(movie_ids)}, "
            f"inserted={len(reviews) - existing_count}, updated={existing_count}"
        )
    finally:
        await connection.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", type=Path, help="CSV with Naver Movie reviews")
    parser.add_argument("--env-file", type=Path, default=Path("scheduler/.env"))
    parser.add_argument("--database-url", help="override DATABASE_URL from the env file")
    parser.add_argument("--database-schema", help="override DATABASE_SCHEMA from the env file")
    parser.add_argument("--dry-run", action="store_true", help="validate CSV and mappings without writing rows")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    reviews = load_reviews(args.csv_path)
    dsn, schema = load_database_settings(args.env_file, args.database_url, args.database_schema)
    asyncio.run(import_reviews(dsn, schema, reviews, args.dry_run))


if __name__ == "__main__":
    main()
