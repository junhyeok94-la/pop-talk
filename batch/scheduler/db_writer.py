"""Load the curated movies_final.json dataset into PostgreSQL."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from scheduler.database import connect


DEFAULT_DATASET = Path(__file__).resolve().parent / "data" / "movies_final.json"
ADVISORY_LOCK_KEY = 7_602_026_001


def clean_text(value: Any) -> str | None:
    text = "" if value is None else str(value).strip()
    return text or None


def split_values(value: Any, separator: str) -> list[str]:
    if isinstance(value, list):
        candidates = value
    else:
        candidates = str(value or "").split(separator)
    result: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        text = str(candidate).strip()
        if text and text not in seen:
            seen.add(text)
            result.append(text)
    return result


def parse_date(value: Any):
    text = clean_text(value)
    return datetime.strptime(text, "%Y%m%d").date() if text else None


def parse_int(value: Any) -> int | None:
    text = clean_text(value)
    return int(text) if text else None


def canonical_hash(movie: dict[str, Any]) -> str:
    payload = json.dumps(movie, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def normalize_movie(movie: dict[str, Any], publish: bool) -> tuple[Any, ...]:
    movie_cd = clean_text(movie.get("movie_cd"))
    title = clean_text(movie.get("movie_nm"))
    release_date = parse_date(movie.get("open_dt"))
    if not movie_cd or not title or not release_date:
        raise ValueError(f"Required movie field is missing: movie_cd={movie_cd!r}")

    kmdb_id = clean_text(movie.get("kmdb_id"))
    kmdb_matched = bool(movie.get("kmdb_matched")) and bool(kmdb_id)
    return (
        movie_cd,
        kmdb_id,
        kmdb_matched,
        title,
        clean_text(movie.get("movie_nm_en")),
        clean_text(movie.get("movie_nm_og")),
        release_date,
        parse_int(movie.get("prdt_year")),
        parse_int(movie.get("show_tm")),
        clean_text(movie.get("type_nm")),
        clean_text(movie.get("prdt_stat_nm")),
        split_values(movie.get("nation_alt"), ","),
        clean_text(movie.get("rep_nation_nm")),
        split_values(movie.get("genre_alt"), ","),
        clean_text(movie.get("rep_genre_nm")),
        split_values(movie.get("director_nm"), "|"),
        split_values(movie.get("director_nm_en"), "|"),
        split_values(movie.get("actor_nm"), "|"),
        split_values(movie.get("actor_cast"), "|"),
        split_values(movie.get("company_nm"), "|"),
        clean_text(movie.get("watch_grade")),
        clean_text(movie.get("poster_url")),
        clean_text(movie.get("plot")),
        split_values(movie.get("keywords"), "|"),
        "PUBLISHED" if publish else "DRAFT",
        "APPROVED" if publish else "PENDING",
        "initial-dataset" if publish else None,
        datetime.now().astimezone() if publish else None,
        canonical_hash(movie),
    )


INSERT_SQL = """
INSERT INTO popcorn_movies (
    kofic_movie_cd, kmdb_id, kmdb_matched,
    title_ko, title_en, title_original,
    release_date, production_year, runtime_minutes,
    movie_type, production_status,
    production_countries, representative_country,
    genres, representative_genre,
    directors, director_names_en, actors, actor_roles, production_companies,
    viewing_grade, poster_url, plot, source_keywords,
    service_status, approval_status, approved_by, approved_at, source_hash
)
VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
    $21, $22, $23, $24, $25::movie_service_status,
    $26::movie_approval_status, $27, $28, $29
)
ON CONFLICT (kofic_movie_cd) DO NOTHING
"""


UPDATE_SQL = """
UPDATE popcorn_movies
   SET kmdb_id = $2,
       kmdb_matched = $3,
       title_ko = $4,
       title_en = $5,
       title_original = $6,
       release_date = $7,
       production_year = $8,
       runtime_minutes = $9,
       movie_type = $10,
       production_status = $11,
       production_countries = $12,
       representative_country = $13,
       genres = $14,
       representative_genre = $15,
       directors = $16,
       director_names_en = $17,
       actors = $18,
       actor_roles = $19,
       production_companies = $20,
       viewing_grade = $21,
       poster_url = $22,
       plot = $23,
       source_keywords = $24,
       source_hash = $25,
       source_synced_at = CURRENT_TIMESTAMP
 WHERE kofic_movie_cd = $1
   AND source_hash IS DISTINCT FROM $25
"""


PUBLISH_SQL = """
UPDATE popcorn_movies
   SET service_status = 'PUBLISHED',
       approval_status = 'APPROVED',
       approved_by = COALESCE(approved_by, 'initial-dataset'),
       approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
       rejection_reason = NULL
 WHERE kofic_movie_cd = ANY($1::text[])
   AND (service_status <> 'PUBLISHED' OR approval_status <> 'APPROVED')
"""


async def load_dataset(
    dataset_path: Path | list[dict[str, Any]],
    database_url: str,
    publish: bool,
    database_schema: str | None = None,
) -> None:
    if isinstance(dataset_path, list):
        movies = dataset_path
        source_name = "KOFIC_KMDB_DAILY_API"
        source_bytes = json.dumps(movies, ensure_ascii=False, sort_keys=True).encode("utf-8")
    else:
        movies = json.loads(dataset_path.read_text(encoding="utf-8"))
        source_name = str(dataset_path)
        source_bytes = dataset_path.read_bytes()
    if not isinstance(movies, list):
        raise ValueError("movies_final.json must contain a JSON array")

    movie_codes = [clean_text(movie.get("movie_cd")) for movie in movies]
    if any(code is None for code in movie_codes):
        raise ValueError("movie_cd is missing")
    if len(movie_codes) != len(set(movie_codes)):
        raise ValueError("movie_cd contains duplicates")

    rows = [normalize_movie(movie, publish) for movie in movies]
    dataset_hash = hashlib.sha256(source_bytes).hexdigest()
    schema = database_schema or os.getenv("DATABASE_SCHEMA", "")
    connection = await connect(database_url, schema)
    try:
        async with connection.transaction():
            locked = await connection.fetchval(
                "SELECT pg_try_advisory_xact_lock($1)", ADVISORY_LOCK_KEY
            )
            if not locked:
                raise RuntimeError("another initial movie load is already running")

            run_id = await connection.fetchval(
                """
                INSERT INTO batch_runs (
                    job_name, scheduled_for, status, source_file, source_hash, started_at
                )
                VALUES ('load-initial-movies', CURRENT_TIMESTAMP, 'PROCESSING', $1, $2,
                        CURRENT_TIMESTAMP)
                RETURNING id
                """,
                source_name,
                dataset_hash,
            )

            existing_hashes = {
                row["kofic_movie_cd"]: row["source_hash"]
                for row in await connection.fetch(
                    """
                    SELECT kofic_movie_cd, source_hash
                      FROM popcorn_movies
                     WHERE kofic_movie_cd = ANY($1::text[])
                    """,
                    movie_codes,
                )
            }
            inserted_count = sum(code not in existing_hashes for code in movie_codes)
            updated_count = sum(
                code in existing_hashes and existing_hashes[code] != row[-1]
                for code, row in zip(movie_codes, rows)
            )
            await connection.executemany(INSERT_SQL, rows)
            update_rows = [row[:24] + (row[28],) for row in rows]
            await connection.executemany(UPDATE_SQL, update_rows)
            if publish:
                await connection.execute(PUBLISH_SQL, movie_codes)

            movie_map = {
                row["kofic_movie_cd"]: row["id"]
                for row in await connection.fetch(
                    "SELECT id, kofic_movie_cd FROM popcorn_movies WHERE kofic_movie_cd = ANY($1::text[])",
                    movie_codes,
                )
            }
            movie_ids = list(movie_map.values())
            await connection.execute(
                "DELETE FROM popcorn_movie_media WHERE source_system = 'KMDB' AND movie_id = ANY($1::bigint[])",
                movie_ids,
            )

            media_rows: list[tuple[int, str, str, int, bool]] = []
            for movie in movies:
                movie_id = movie_map[str(movie["movie_cd"])]
                posters = split_values(movie.get("posters_all"), "|")
                stills = split_values(movie.get("stlls_all"), "|")
                for order, url in enumerate(posters):
                    media_rows.append((movie_id, "POSTER", url, order, order == 0))
                for order, url in enumerate(stills):
                    media_rows.append((movie_id, "STILL", url, order, False))
            if media_rows:
                await connection.executemany(
                    """
                    INSERT INTO popcorn_movie_media (
                        movie_id, media_type, url, display_order, is_primary
                    ) VALUES ($1, $2::movie_media_type, $3, $4, $5)
                    ON CONFLICT DO NOTHING
                    """,
                    media_rows,
                )

            await connection.execute(
                """
                UPDATE batch_runs
                   SET status = 'SUCCEEDED', processed_count = $2,
                       inserted_count = $3, updated_count = $4,
                       result = $5::jsonb, finished_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                """,
                run_id,
                len(rows),
                inserted_count,
                updated_count,
                json.dumps(
                    {
                        "dataset_hash": dataset_hash,
                        "media_count": len(media_rows),
                        "publish": publish,
                    }
                ),
            )
    finally:
        await connection.close()

    print(
        f"Loaded {len(rows):,} movies from {source_name} "
        f"(publish={publish}, dataset_hash={dataset_hash[:12]}...)"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dataset",
        "--input",
        dest="dataset",
        type=Path,
        default=DEFAULT_DATASET,
        help="Path to movies_final.json",
    )
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", ""))
    parser.add_argument("--database-schema", default=os.getenv("DATABASE_SCHEMA", ""))
    parser.add_argument(
        "--publish",
        action="store_true",
        help="mark the curated initial dataset as APPROVED and PUBLISHED",
    )
    args = parser.parse_args()
    if not args.database_url:
        raise SystemExit("DATABASE_URL or --database-url is required")
    if not args.database_schema:
        raise SystemExit("DATABASE_SCHEMA or --database-schema is required")
    asyncio.run(
        load_dataset(
            args.dataset.resolve(),
            args.database_url,
            args.publish,
            args.database_schema,
        )
    )


if __name__ == "__main__":
    main()
