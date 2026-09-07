"""
step2_kofic_detail.py
---------------------
Step 1에서 수집한 KOFIC 영화 목록의 movieCd를 기반으로
searchMovieInfo API를 호출하여 상세정보를 수집합니다.

수집 정보:
- 장르, 감독, 배우, 상영시간, 개봉일, 제작사, 심의 등급 등

출력:
- data/kofic_movie_detail.json : {movieCd: {detail...}} 형태
- data/excluded_log.json : 성인물 등 제외된 영화 목록
- data/failed_log.json : 수집 실패 영화 목록

사용법:
    python step2_kofic_detail.py
"""

import argparse
import json
import logging
import time

import requests
from tqdm import tqdm

from . import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def fetch_movie_detail(movie_cd: str) -> dict | None:
    """KOFIC searchMovieInfo API를 호출하여 영화 상세정보를 반환합니다."""
    while True:
        api_key = config.get_kofic_api_key()
        params = {
            "key": api_key,
            "movieCd": movie_cd,
        }
        try:
            resp = requests.get(config.KOFIC_MOVIE_DETAIL_URL, params=params, timeout=15)
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
                    return None

            return data.get("movieInfoResult", {}).get("movieInfo", None)
        except requests.RequestException as e:
            logger.error(f"API 호출 실패 (movieCd={movie_cd}): {e}")
            return None


def load_movie_list() -> dict:
    """Step 1 결과 파일을 로드합니다."""
    if not config.KOFIC_LIST_PATH.exists():
        logger.error(f"영화 목록 파일이 없습니다: {config.KOFIC_LIST_PATH}")
        logger.error("step1_kofic_list.py를 먼저 실행하세요.")
        raise FileNotFoundError(str(config.KOFIC_LIST_PATH))
    with open(config.KOFIC_LIST_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    logger.info(f"영화 목록 로드: {len(data)}건")
    return data


def load_existing_details() -> dict:
    """기존 수집된 상세정보를 로드합니다."""
    if config.KOFIC_DETAIL_PATH.exists():
        try:
            with open(config.KOFIC_DETAIL_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            logger.info(f"기존 상세정보 로드: {len(data)}건")
            return data
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"기존 데이터 로드 실패: {e}")
    return {}


def load_excluded_log() -> dict:
    """제외된 영화 로그를 로드합니다."""
    if config.EXCLUDED_LOG_PATH.exists():
        try:
            with open(config.EXCLUDED_LOG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            logger.info(f"기존 제외 로그 로드: {len(data)}건")
            return data
        except Exception:
            pass
    return {}


def load_failed_log() -> dict:
    """실패 로그를 로드합니다."""
    if config.FAILED_LOG_PATH.exists():
        try:
            with open(config.FAILED_LOG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_details(data: dict) -> None:
    """상세정보를 저장합니다."""
    with open(config.KOFIC_DETAIL_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"저장: {config.KOFIC_DETAIL_PATH} ({len(data)}건)")


def save_excluded_log(excluded: dict) -> None:
    """제외 로그를 저장합니다."""
    with open(config.EXCLUDED_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(excluded, f, ensure_ascii=False, indent=2)


def save_failed_log(failed: dict) -> None:
    """실패 로그를 저장합니다."""
    with open(config.FAILED_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(failed, f, ensure_ascii=False, indent=2)


def main() -> None:
    config.validate_keys(require_kofic=True, require_kmdb=False)

    movie_list = load_movie_list()
    details = load_existing_details()
    excluded_log = load_excluded_log()
    failed_log = load_failed_log()

    # 아직 완료(수집완료, 제외)되지 않은 movieCd만 수집 대상
    pending = [
        cd for cd in movie_list
        if cd not in details and cd not in excluded_log
    ]
    logger.info(
        f"상세정보 수집 대상: {len(pending)}건 (전체 목록 {len(movie_list)}건 중 / "
        f"기수집: {len(details)}건, 기존제외: {len(excluded_log)}건, 기존실패: {len(failed_log)}건)"
    )

    save_interval = 20  # 20건마다 중간 저장
    failed_count = 0
    excluded_count = 0

    for i, movie_cd in enumerate(tqdm(pending, desc="KOFIC 상세정보 수집")):
        detail = fetch_movie_detail(movie_cd)
        time.sleep(config.KOFIC_RATE_LIMIT_DELAY)

        if detail:
            # 불필요하게 파일 용량을 크게 차지하는 staffs(제작진 목록) 제거
            detail.pop("staffs", None)

            # 목록 데이터와 상세 데이터 병합
            base = movie_list.get(movie_cd, {})
            merged = {**base, **detail}
            if not config.is_excluded_movie(merged):
                details[movie_cd] = merged
                failed_log.pop(movie_cd, None)
            else:
                excluded_count += 1
                excluded_log[movie_cd] = {
                    "reason": "adult_or_excluded_genre",
                    "movie_nm": merged.get("movieNm", ""),
                    "genre_alt": merged.get("genreAlt", ""),
                }
                failed_log.pop(movie_cd, None)
                logger.debug(f"성인물 장르 제외: {merged.get('movieNm')} ({movie_cd})")
        else:
            failed_count += 1
            failed_log[movie_cd] = {
                "step": "kofic_detail",
                "movie_nm": movie_list.get(movie_cd, {}).get("movieNm", ""),
            }
            logger.debug(f"실패: {movie_cd}")

        # 중간 저장
        if (i + 1) % save_interval == 0:
            save_details(details)
            save_excluded_log(excluded_log)
            save_failed_log(failed_log)
            logger.info(f"중간 저장 완료 ({i + 1}/{len(pending)}) — 유효: {len(details)}건, 제외: {len(excluded_log)}건")

    # 최종 저장
    save_details(details)
    save_excluded_log(excluded_log)
    save_failed_log(failed_log)

    logger.info(
        f"수집 완료 — 유효저장: {len(details)}건, 신규제외: {excluded_count}건, 실패: {failed_count}건"
    )


if __name__ == "__main__":
    main()
