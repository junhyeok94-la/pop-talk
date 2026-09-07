"""KOFIC/KMDB 신규 영화를 수집해 PostgreSQL에 직접 UPSERT합니다."""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import logging
import time

from . import config, db_writer, kmdb_client, kofic_detail, kofic_list, normalizer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def fetch_daily_boxoffice(target_date: str) -> list[dict]:
    import requests

    response = requests.get(
        f"{config.KOFIC_BASE_URL}/boxoffice/searchDailyBoxOfficeList.json",
        params={"key": config.get_kofic_api_key(), "targetDt": target_date},
        timeout=15,
    )
    response.raise_for_status()
    return response.json().get("boxOfficeResult", {}).get("dailyBoxOfficeList", [])


def collect_candidates(days_back: int) -> dict[str, dict]:
    candidates: dict[str, dict] = {}
    today = dt.date.today()
    for offset in range(1, days_back + 1):
        target = (today - dt.timedelta(days=offset)).strftime("%Y%m%d")
        for movie in fetch_daily_boxoffice(target):
            code = movie.get("movieCd")
            if code:
                candidates.setdefault(code, movie)
        time.sleep(config.KOFIC_RATE_LIMIT_DELAY)

    page = kofic_list.fetch_movie_list_page(today.year, page=1)
    for movie in page.get("movieListResult", {}).get("movieList", []):
        code = movie.get("movieCd")
        if code and not config.is_excluded_movie(movie):
            candidates.setdefault(code, movie)
    return candidates


def enrich_movie(code: str, basic: dict) -> tuple[dict | None, int]:
    detail = kofic_detail.fetch_movie_detail(code) or basic
    combined = {**basic, **detail}
    if config.is_excluded_movie(combined):
        return None, 0

    title = combined.get("movieNm", "")
    title_en = combined.get("movieNmEn", "")
    year = str(combined.get("prdtYear", "") or combined.get("openDt", ""))[:4]
    match, calls = kmdb_client.fetch_best_kmdb_match(
        title,
        title_en,
        year,
        kmdb_client.director_names(combined),
    )
    if match:
        combined.update(kmdb_client.extract_kmdb_fields(match))
    else:
        combined["kmdb_matched"] = False

    movie = normalizer.normalize_movie(code, combined)
    if not movie.get("movie_nm") or not movie.get("open_dt"):
        logger.warning("필수값이 없어 제외: movie_cd=%s", code)
        return None, calls
    return movie, calls


async def run_daily_sync_async(days_back: int = 7) -> dict:
    config.validate_scheduled_settings()
    candidates = collect_candidates(days_back)
    movies: list[dict] = []
    kmdb_calls = 0
    failed = 0

    for index, (code, basic) in enumerate(candidates.items(), start=1):
        try:
            movie, calls = enrich_movie(code, basic)
            kmdb_calls += calls
            if movie:
                movies.append(movie)
            else:
                failed += 1
        except Exception:
            failed += 1
            logger.exception("영화 수집 실패: %s (%s/%s)", code, index, len(candidates))
        time.sleep(config.KOFIC_RATE_LIMIT_DELAY)

    if movies:
        await db_writer.load_dataset(
            movies,
            config.DATABASE_URL,
            publish=False,
            database_schema=config.DATABASE_SCHEMA,
        )

    stats = {
        "candidate_count": len(candidates),
        "upsert_count": len(movies),
        "failed_count": failed,
        "kmdb_api_calls": kmdb_calls,
        "sync_time": dt.datetime.now().astimezone().isoformat(),
    }
    logger.info("일일 DB 동기화 완료: %s", stats)
    return stats


def run_daily_sync(days_back: int = 7) -> dict:
    return asyncio.run(run_daily_sync_async(days_back))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="영화 데이터를 PostgreSQL에 직접 증분 UPSERT")
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()
    run_daily_sync(args.days)
