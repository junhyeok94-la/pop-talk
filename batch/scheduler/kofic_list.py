"""
step1_kofic_list.py
-------------------
KOFIC(KOBIS) searchMovieList API를 호출하여 영화 목록을 수집합니다.

수집 전략:
- 지정된 연도 범위(개봉연도 기준)를 연도별로 순회
- 각 연도마다 페이지네이션으로 전체 목록 수집
- 기존 수집 데이터가 있으면 이어서 수집 (멱등성 보장)

출력:
- data/kofic_movie_list.json : {movieCd: {...}} 형태의 영화 목록

사용법:
    python step1_kofic_list.py
    python step1_kofic_list.py --start-year 2020 --end-year 2023
    python step1_kofic_list.py --start-year 2023 --end-year 2023 --pages 1
"""

import argparse
import json
import logging
import time
from pathlib import Path

import requests
from tqdm import tqdm

from . import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def fetch_movie_list_page(
    year: int,
    page: int,
    items_per_page: int = config.KOFIC_ITEMS_PER_PAGE,
    movie_type_cd: str = config.KOFIC_DEFAULT_MOVIE_TYPE_CD,
) -> dict:
    """KOFIC searchMovieList API를 호출하여 단일 페이지 결과를 반환합니다."""
    while True:
        api_key = config.get_kofic_api_key()
        params = {
            "key": api_key,
            "curPage": page,
            "itemPerPage": items_per_page,
            "openStartDt": year,
            "openEndDt": year,
        }
        if movie_type_cd:
            params["movieTypeCd"] = movie_type_cd

        try:
            resp = requests.get(config.KOFIC_MOVIE_LIST_URL, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            # 한도 초과 체크 (320011)
            fault = data.get("faultInfo", {})
            if fault.get("errorCode") == "320011":
                new_key = config.rotate_kofic_api_key()
                if new_key:
                    logger.warning(f"KOFIC API 한도 초과 발생 -> 키 전환하여 재시도...")
                    continue
                else:
                    logger.error("등록된 모든 KOFIC API 키의 일일 한도가 소진되었습니다.")
                    return data
            return data
        except requests.RequestException as e:
            logger.error(f"API 호출 실패 (year={year}, page={page}): {e}")
            return {}


def collect_year(
    year: int,
    max_pages: int | None = None,
    existing: dict | None = None,
    movie_type_cd: str = config.KOFIC_DEFAULT_MOVIE_TYPE_CD,
) -> dict:
    """
    특정 연도의 전체 영화 목록을 수집합니다.
    """
    if existing is None:
        existing = {}

    collected = {}
    page = 1

    # 첫 페이지 호출로 전체 건수 파악
    data = fetch_movie_list_page(year, page, movie_type_cd=movie_type_cd)
    time.sleep(config.KOFIC_RATE_LIMIT_DELAY)

    movie_list_result = data.get("movieListResult", {})
    total_count = int(movie_list_result.get("totCnt", 0))
    movies = movie_list_result.get("movieList", [])

    if total_count == 0:
        logger.info(f"  {year}년: 수집 데이터 없음")
        return collected

    total_pages = (total_count + config.KOFIC_ITEMS_PER_PAGE - 1) // config.KOFIC_ITEMS_PER_PAGE
    if max_pages:
        total_pages = min(total_pages, max_pages)

    logger.info(f"  {year}년: 총 {total_count}건 / {total_pages}페이지")

    # 첫 페이지 처리
    for movie in movies:
        movie_cd = movie.get("movieCd", "")
        if movie_cd and movie_cd not in existing:
            movie["_kofic_open_year"] = year
            collected[movie_cd] = movie

    # 나머지 페이지 처리
    for p in tqdm(range(2, total_pages + 1), desc=f"  {year}년 수집", leave=False):
        data = fetch_movie_list_page(year, p, movie_type_cd=movie_type_cd)
        time.sleep(config.KOFIC_RATE_LIMIT_DELAY)

        movies = data.get("movieListResult", {}).get("movieList", [])
        for movie in movies:
            movie_cd = movie.get("movieCd", "")
            if movie_cd and movie_cd not in existing:
                movie["_kofic_open_year"] = year
                collected[movie_cd] = movie

    return collected


def load_existing() -> dict:
    """기존 수집 데이터를 로드합니다."""
    if config.KOFIC_LIST_PATH.exists():
        try:
            with open(config.KOFIC_LIST_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            logger.info(f"기존 수집 데이터 로드: {len(data)}건")
            return data
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"기존 데이터 로드 실패: {e} → 새로 수집합니다.")
    return {}


def save(data: dict) -> None:
    """수집 데이터를 저장합니다."""
    with open(config.KOFIC_LIST_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"저장 완료: {config.KOFIC_LIST_PATH} ({len(data)}건)")


def main(
    start_year: int = config.DEFAULT_START_YEAR,
    end_year: int = config.DEFAULT_END_YEAR,
    max_pages: int | None = None,
    movie_type_cd: str = config.KOFIC_DEFAULT_MOVIE_TYPE_CD,
) -> None:
    config.validate_keys(require_kofic=True, require_kmdb=False)

    type_str = f" (구분코드: {movie_type_cd})" if movie_type_cd else ""
    logger.info(f"KOFIC 영화목록 수집 시작: {start_year}~{end_year}년{type_str}")
    all_movies = load_existing()
    initial_count = len(all_movies)

    for year in range(start_year, end_year + 1):
        new_movies = collect_year(year, max_pages=max_pages, existing=all_movies, movie_type_cd=movie_type_cd)
        all_movies.update(new_movies)
        logger.info(f"  {year}년 신규 수집: {len(new_movies)}건 (누적: {len(all_movies)}건)")
        # 연도별 중간 저장
        save(all_movies)

    total_new = len(all_movies) - initial_count
    logger.info(f"수집 완료 — 신규: {total_new}건 / 전체: {len(all_movies)}건")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="KOFIC 영화목록 수집")
    parser.add_argument("--start-year", type=int, default=config.DEFAULT_START_YEAR)
    parser.add_argument("--end-year", type=int, default=config.DEFAULT_END_YEAR)
    parser.add_argument("--movie-type-cd", type=str, default=config.KOFIC_DEFAULT_MOVIE_TYPE_CD)
    parser.add_argument("--pages", type=int, default=None, help="연도별 최대 수집 페이지 수 (테스트용)")
    args = parser.parse_args()
    main(args.start_year, args.end_year, args.pages, args.movie_type_cd)
