"""
step4_export.py
---------------
병합 완료된 movies_merged.json을 최종 데이터셋으로 정제·변환합니다.

처리 내용:
1. 중복 제거 및 최소 필드 검증
2. 복합 필드 정규화 (리스트, 중첩 딕셔너리 → 문자열 또는 정규화 구조)
3. 통계 출력
4. movies_final.json / movies_final.csv 저장

출력:
- data/movies_final.json   : 최종 정제 데이터
- data/movies_final.csv    : CSV 형태 (DB import용)

사용법:
    python step4_export.py
"""

import csv
import json
import logging
from pathlib import Path

from . import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ──────────────────────────────────────────
# 필드 추출 도우미
# ──────────────────────────────────────────

def extract_names(obj_or_list, name_key: str, separator: str = "|") -> str:
    """
    KOFIC directors/actors/companys 같은 중첩 구조에서
    name_key에 해당하는 이름들을 separator로 연결한 문자열로 반환합니다.

    예) directors: [{"peopleNm": "홍길동"}] → "홍길동"
    """
    if not obj_or_list:
        return ""
    if isinstance(obj_or_list, list):
        items = obj_or_list
    elif isinstance(obj_or_list, dict):
        # KMDB 형식: {"director": [...]} 또는 {"actor": [...]}
        items = next(iter(obj_or_list.values()), []) if obj_or_list else []
    else:
        return str(obj_or_list)

    names = []
    for item in items:
        if isinstance(item, dict):
            name = item.get(name_key, "")
            if name:
                names.append(name)
    return separator.join(names)


def first_poster(posters) -> str:
    """포스터 URL 목록에서 첫 번째를 반환합니다."""
    if not posters:
        return ""
    if isinstance(posters, list) and posters:
        return posters[0]
    if isinstance(posters, str):
        parts = [p.strip() for p in posters.split("|") if p.strip()]
        return parts[0] if parts else ""
    return ""


def safe_str(val) -> str:
    """None을 빈 문자열로 변환합니다."""
    if val is None:
        return ""
    return str(val)


# ──────────────────────────────────────────
# 영화 데이터 정규화
# ──────────────────────────────────────────

def normalize_movie(movie_cd: str, data: dict) -> dict:
    """
    병합된 영화 데이터를 최종 정제 형태로 변환합니다.

    KOFIC 필드와 KMDB 필드를 통합하여 일관된 스키마로 반환합니다.
    """
    # ── 기본 정보 (KOFIC 우선) ──────────────────
    movie_nm = safe_str(data.get("movieNm", ""))
    movie_nm_en = safe_str(data.get("movieNmEn", "") or data.get("kmdb_title_en", ""))
    movie_nm_og = safe_str(data.get("movieNmOg", ""))

    open_dt = safe_str(data.get("openDt", ""))
    prdt_year = safe_str(data.get("prdtYear", ""))

    show_tm = safe_str(data.get("showTm", "") or data.get("kmdb_runtime", ""))
    type_nm = safe_str(data.get("typeNm", ""))
    prdt_stat_nm = safe_str(data.get("prdtStatNm", ""))

    # ── 국가·장르 ────────────────────────────────
    nation_alt = safe_str(data.get("nationAlt", "") or data.get("kmdb_nation", ""))
    rep_nation_nm = safe_str(data.get("repNationNm", ""))
    genre_alt = safe_str(data.get("genreAlt", "") or data.get("kmdb_genre", ""))
    rep_genre_nm = safe_str(data.get("repGenreNm", ""))

    # ── 감독 ─────────────────────────────────────
    # KOFIC directors 구조: [{"peopleNm": "...", "peopleNmEn": "..."}]
    # KMDB kmdb_directors 구조: [{"name": "...", "name_en": "..."}]
    directors_kofic = data.get("directors", [])
    directors_kmdb = data.get("kmdb_directors", [])

    if directors_kofic:
        director_nm = extract_names(directors_kofic, "peopleNm")
        director_nm_en = extract_names(directors_kofic, "peopleNmEn")
    elif directors_kmdb:
        director_nm = "|".join(d.get("name", "") for d in directors_kmdb if d.get("name"))
        director_nm_en = "|".join(d.get("name_en", "") for d in directors_kmdb if d.get("name_en"))
    else:
        director_nm = ""
        director_nm_en = ""

    # ── 배우 ─────────────────────────────────────
    actors_kofic = data.get("actors", [])
    actors_kmdb = data.get("kmdb_actors", [])

    if actors_kofic:
        if isinstance(actors_kofic, list):
            actor_nm = extract_names(actors_kofic, "peopleNm")
            actor_cast = extract_names(actors_kofic, "cast")
        else:
            actor_nm = ""
            actor_cast = ""
    elif actors_kmdb:
        actor_nm = "|".join(a.get("name", "") for a in actors_kmdb if a.get("name"))
        actor_cast = "|".join(a.get("role", "") for a in actors_kmdb if a.get("role"))
    else:
        actor_nm = ""
        actor_cast = ""

    # ── 제작사 ──────────────────────────────────
    companys = data.get("companys", [])
    company_nm = extract_names(companys, "companyNm")

    # ── 심의등급 ─────────────────────────────────
    # KOFIC: audits: [{"watchGradeNm": "15세이상관람가"}]
    # KMDB: kmdb_rating
    audits = data.get("audits", [])
    watch_grade = ""
    if audits and isinstance(audits, list):
        for a in audits:
            if isinstance(a, dict) and a.get("watchGradeNm"):
                watch_grade = a["watchGradeNm"]
                break
    if not watch_grade:
        watch_grade = safe_str(data.get("kmdb_rating", ""))

    # ── KMDB 보강 필드 ───────────────────────────
    kmdb_id = safe_str(data.get("kmdb_id", ""))
    kmdb_matched = bool(data.get("kmdb_matched", False))
    plot = safe_str(data.get("kmdb_plot", ""))
    poster_url = first_poster(data.get("kmdb_posters", []))
    posters_all = data.get("kmdb_posters", [])
    stlls_all = data.get("kmdb_stlls", [])
    keywords = data.get("kmdb_keywords", [])
    if isinstance(keywords, list):
        keywords_str = "|".join(keywords)
    else:
        keywords_str = safe_str(keywords)

    return {
        # 식별자
        "movie_cd": movie_cd,
        "kmdb_id": kmdb_id,
        # 제목
        "movie_nm": movie_nm,
        "movie_nm_en": movie_nm_en,
        "movie_nm_og": movie_nm_og,
        # 날짜·기간
        "open_dt": open_dt,
        "prdt_year": prdt_year,
        "show_tm": show_tm,
        # 분류
        "type_nm": type_nm,
        "prdt_stat_nm": prdt_stat_nm,
        "nation_alt": nation_alt,
        "rep_nation_nm": rep_nation_nm,
        "genre_alt": genre_alt,
        "rep_genre_nm": rep_genre_nm,
        # 인물·제작사
        "director_nm": director_nm,
        "director_nm_en": director_nm_en,
        "actor_nm": actor_nm,
        "actor_cast": actor_cast,
        "company_nm": company_nm,
        # 심의·등급
        "watch_grade": watch_grade,
        # KMDB 보강
        "kmdb_matched": kmdb_matched,
        "poster_url": poster_url,
        "posters_all": posters_all,
        "stlls_all": stlls_all,
        "plot": plot,
        "keywords": keywords_str,
    }


# ──────────────────────────────────────────
# 통계 출력
# ──────────────────────────────────────────

def print_stats(movies: list[dict]) -> None:
    total = len(movies)
    kmdb_matched = sum(1 for m in movies if m.get("kmdb_matched"))
    has_poster = sum(1 for m in movies if m.get("poster_url"))
    has_plot = sum(1 for m in movies if m.get("plot"))
    has_genre = sum(1 for m in movies if m.get("genre_alt") or m.get("rep_genre_nm"))

    logger.info("=" * 50)
    logger.info(f"최종 데이터셋 통계")
    logger.info(f"  총 영화 수        : {total:,}건")
    logger.info(f"  KMDB 매칭 완료    : {kmdb_matched:,}건 ({kmdb_matched/total*100:.1f}%)" if total else "  KMDB 매칭 완료    : 0건")
    logger.info(f"  포스터 URL 보유   : {has_poster:,}건 ({has_poster/total*100:.1f}%)" if total else "  포스터 URL 보유   : 0건")
    logger.info(f"  줄거리 보유       : {has_plot:,}건 ({has_plot/total*100:.1f}%)" if total else "  줄거리 보유       : 0건")
    logger.info(f"  장르 정보 보유    : {has_genre:,}건 ({has_genre/total*100:.1f}%)" if total else "  장르 정보 보유    : 0건")
    logger.info("=" * 50)


# ──────────────────────────────────────────
# CSV 저장
# ──────────────────────────────────────────

# CSV에 포함할 필드 (리스트 타입 제외)
CSV_FIELDS = [
    "movie_cd", "kmdb_id",
    "movie_nm", "movie_nm_en", "movie_nm_og",
    "open_dt", "prdt_year", "show_tm",
    "type_nm", "prdt_stat_nm",
    "nation_alt", "rep_nation_nm",
    "genre_alt", "rep_genre_nm",
    "director_nm", "director_nm_en",
    "actor_nm", "actor_cast",
    "company_nm",
    "watch_grade",
    "kmdb_matched",
    "poster_url",
    "plot",
    "keywords",
]


def save_csv(movies: list[dict]) -> None:
    """CSV 형식으로 저장합니다 (리스트 타입 필드 제외)."""
    with open(config.MOVIES_FINAL_CSV_PATH, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        for movie in movies:
            row = {k: movie.get(k, "") for k in CSV_FIELDS}
            writer.writerow(row)
    logger.info(f"CSV 저장: {config.MOVIES_FINAL_CSV_PATH} ({len(movies)}건)")


def save_json(movies: list[dict]) -> None:
    """JSON 형식으로 저장합니다."""
    with open(config.MOVIES_FINAL_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(movies, f, ensure_ascii=False, indent=2)
    logger.info(f"JSON 저장: {config.MOVIES_FINAL_JSON_PATH} ({len(movies)}건)")


# ──────────────────────────────────────────
# 메인
# ──────────────────────────────────────────

def main() -> None:
    if not config.MOVIES_MERGED_PATH.exists():
        logger.error(f"병합 파일이 없습니다: {config.MOVIES_MERGED_PATH}")
        logger.error("step3_kmdb_merge.py를 먼저 실행하세요.")
        return

    logger.info(f"병합 데이터 로드: {config.MOVIES_MERGED_PATH}")
    with open(config.MOVIES_MERGED_PATH, "r", encoding="utf-8") as f:
        merged_data = json.load(f)

    logger.info(f"총 {len(merged_data)}건 정규화 중...")

    movies: list[dict] = []
    for movie_cd, data in merged_data.items():
        if config.is_excluded_movie(data):
            continue
        normalized = normalize_movie(movie_cd, data)
        # 최소 기준: 영화명 필수 & 성인물 제외
        if normalized["movie_nm"] and not config.is_excluded_movie(normalized):
            movies.append(normalized)

    # 개봉일 기준 정렬 (내림차순)
    movies.sort(key=lambda m: m.get("open_dt", "") or "", reverse=True)

    logger.info(f"정규화 완료: {len(movies)}건 유효")

    print_stats(movies)
    save_json(movies)
    save_csv(movies)

    logger.info("Step 4 완료 ✓")


if __name__ == "__main__":
    main()
