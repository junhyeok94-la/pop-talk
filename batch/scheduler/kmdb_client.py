"""
step3_kmdb_merge.py
--------------------
KOFIC 영화 상세정보를 기반으로 KMDB API를 호출하여
포스터, 줄거리, 키워드, 스틸컷 등 보강 정보를 병합합니다.

매칭 전략:
  1. 영화명(한국어) + 제작연도로 KMDB 검색
  2. 결과가 없으면 영화명(영어) + 제작연도로 재시도
  3. KMDB API 특유의 HS/HE 하이라이팅 태그 정제
  4. 제목 정규화 일치 및 제작연도 시차(±2년) 기반의 엄격한 매칭 (엉뚱한 fallback 제거)

출력:
- data/movies_merged.json : {movieCd: {kofic + kmdb 병합 데이터}}

사용법:
    python step3_kmdb_merge.py
"""

import json
import logging
import time
import unicodedata
import re

import requests
from tqdm import tqdm

from . import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


class KMDBRequestError(RuntimeError):
    """KMDB 요청 자체가 실패해 미매칭으로 판단할 수 없는 경우입니다."""


# ──────────────────────────────────────────
# KMDB 데이터 정제
# ──────────────────────────────────────────

def clean_kmdb_str(text: str) -> str:
    """
    KMDB API 응답 문자열에서 검색 하이라이트 태그(HS, HE) 및 불필요한 특수문자를 정제합니다.

    Example:
        'HS 젊은이의 HE   HS 양지 HE' -> '젊은이의 양지'
    """
    if not text:
        return ""
    # HS, HE 단어 및 문맥 제거
    text = re.sub(r"\bHS\b|\bHE\b", "", text)
    # ! 및 기타 잔여 표현 정제
    text = text.replace("!", "")
    # 연속 공백 하나로 통합
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ──────────────────────────────────────────
# KMDB API 호출
# ──────────────────────────────────────────

def fetch_kmdb(movie_nm: str, detail: str = "Y") -> list[dict]:
    """
    KMDB API를 호출하여 영화 검색 결과를 반환합니다.
    API prodYear 파라미터를 제외하여 broad하게 후보를 받아옵니다.

    Args:
        movie_nm: 검색할 영화명
        detail: 상세정보 포함 여부 (Y/N)

    Returns:
        KMDB 영화 결과 목록
    """
    cleaned_nm = clean_kmdb_str(movie_nm)
    # 무삭제, [4K], (디렉터스컷) 등 부제 수식어 제거하여 검색 성공률 향상
    query_nm = re.sub(r"무삭제판?|\[.*?\]|\(.*?\)", "", cleaned_nm).strip()
    query_nm = re.sub(r"[^\w가-힣\s]", " ", query_nm)
    query_nm = re.sub(r"\s+", " ", query_nm).strip()
    if not query_nm:
        query_nm = cleaned_nm
    if not query_nm:
        return []

    errors = []
    for key_index, api_key in enumerate(config.KMDB_API_KEYS, start=1):
        params = {
            "collection": config.KMDB_COLLECTION,
            "ServiceKey": api_key,
            "query": query_nm,
            "detail": detail,
            "listCount": 20,
        }
        try:
            resp = requests.get(config.KMDB_BASE_URL, params=params, timeout=20)
            resp.raise_for_status()
            resp.encoding = "utf-8"
            try:
                data = resp.json()
            except Exception:
                import json as _json
                data = _json.loads(resp.text.strip())
            if "Data" not in data:
                raise ValueError("KMDB 응답에 Data 필드가 없습니다.")
            data_list = data["Data"]
            if not data_list:
                return []
            return data_list[0].get("Result", [])
        except (requests.ConnectionError, requests.Timeout) as exc:
            raise KMDBRequestError(
                f"KMDB 연결 실패 (query={query_nm!r}); 미매칭으로 저장하지 않습니다."
            ) from exc
        except (requests.HTTPError, ValueError, KeyError) as exc:
            errors.append(f"key#{key_index}: {type(exc).__name__}")
    raise KMDBRequestError(
        f"KMDB 키 {len(config.KMDB_API_KEYS)}개가 모두 실패했습니다 "
        f"(query={query_nm!r}, errors={', '.join(errors)})."
    )


def normalize_title(title: str) -> str:
    """영화 제목 정규화 (비교용): HS/HE 정제 후 특수문자·공백 제거, 소문자화."""
    title = clean_kmdb_str(title)
    title = unicodedata.normalize("NFC", title)
    title = re.sub(r"[^\w가-힣]", "", title).lower()
    return title


def parse_year(year_str: str) -> int | None:
    """연도 문자열을 숫자로 파싱합니다."""
    if not year_str:
        return None
    match = re.search(r"\d{4}", str(year_str))
    if match:
        return int(match.group())
    return None


def find_best_kmdb_match(
    results: list[dict],
    kofic_nm: str,
    kofic_nm_en: str,
    prod_year: str,
) -> dict | None:
    """
    KMDB 결과 중 KOFIC 영화와 가장 잘 매칭되는 항목을 반환합니다.
    HS/HE 태그를 배제하고 제목 일치 및 제작연도 차이를 기반으로 검증합니다.

    매칭 우선순위:
    1. 한국어 제목 완전일치 + 제작연도 차이 <= 1년
    2. 한국어 제목 완전일치 + 제작연도 차이 <= 2년
    3. 영어 제목 완전일치 + 제작연도 차이 <= 2년
    4. 한국어 제목 완전일치 (연도 차이가 최소인 항목)
    5. 조건 불만족 시 None (엉뚱한 fallback 매칭 배제)
    """
    norm_kofic = normalize_title(kofic_nm)
    norm_kofic_en = normalize_title(kofic_nm_en) if kofic_nm_en else ""
    target_year = parse_year(prod_year)

    title_matches_kr = []
    title_matches_en = []

    for r in results:
        raw_title = r.get("title", "")
        raw_title_en = r.get("titleEng", "")
        r_year = parse_year(r.get("prodYear", ""))

        norm_r = normalize_title(raw_title)
        norm_r_en = normalize_title(raw_title_en)

        # 연도 차이 계산
        year_diff = abs(target_year - r_year) if (target_year and r_year) else 999

        # 제목 완전 일치 여부
        is_kr_match = (norm_r and norm_r == norm_kofic)
        is_en_match = (norm_kofic_en and norm_r_en and norm_r_en == norm_kofic_en)

        if is_kr_match:
            if year_diff <= 1:
                return r  # 최우선 매칭 (제목 일치 + 연도 1년 이내)
            title_matches_kr.append((r, year_diff))

        if is_en_match:
            if year_diff <= 1:
                return r  # 영문 최우선 매칭
            title_matches_en.append((r, year_diff))

    # Level 2: 한글 제목 일치 + 연도 차이 <= 2년
    for r, y_diff in title_matches_kr:
        if y_diff <= 2:
            return r

    # Level 3: 영문 제목 일치 + 연도 차이 <= 2년
    for r, y_diff in title_matches_en:
        if y_diff <= 2:
            return r

    # Level 4: 한글 제목 일치 시 연도 차이가 가장 작은 항목 선택 (단, 연도 차이가 5년 이하인 경우만)
    if title_matches_kr:
        title_matches_kr.sort(key=lambda x: x[1])
        best_r, best_diff = title_matches_kr[0]
        if best_diff <= 5:
            return best_r

    # 아무 조건도 충족하지 못하면 매칭 실패 처리 (엉뚱한 results[0] 반환 금지)
    return None


def director_names(movie: dict) -> list[str]:
    """KOFIC 감독 목록에서 KMDB 재검색에 사용할 이름을 추출합니다."""
    names = []
    for director in movie.get("directors", []) or []:
        if not isinstance(director, dict):
            continue
        name = clean_kmdb_str(director.get("peopleNm", ""))
        if name and name not in names:
            names.append(name)
    return names


def build_kmdb_search_queries(
    movie_nm: str,
    movie_nm_en: str = "",
    director_names: list[str] | None = None,
) -> list[str]:
    """일반 제목 검색이 빗나갈 때 감독명과 영문 제목으로 재검색할 쿼리를 만듭니다."""
    titles = [clean_kmdb_str(movie_nm), clean_kmdb_str(movie_nm_en)]
    directors = [clean_kmdb_str(name) for name in (director_names or [])]
    queries: list[str] = []
    for title in titles:
        if not title:
            continue
        for query in [title, *(f"{title} {name}" for name in directors if name)]:
            if query not in queries:
                queries.append(query)
    return queries


def fetch_best_kmdb_match(
    movie_nm: str,
    movie_nm_en: str,
    prod_year: str,
    director_names: list[str] | None = None,
    *,
    fetcher=fetch_kmdb,
    request_delay: float | None = None,
) -> tuple[dict | None, int]:
    """여러 검색 쿼리의 후보를 누적하며 검증된 KMDB 항목을 찾습니다."""
    delay = config.KMDB_RATE_LIMIT_DELAY if request_delay is None else request_delay
    accumulated: list[dict] = []
    seen: set[str] = set()
    calls = 0
    for query in build_kmdb_search_queries(movie_nm, movie_nm_en, director_names):
        results = fetcher(query, detail="Y")
        calls += 1
        if delay:
            time.sleep(delay)
        for result in results:
            identity = str(result.get("DOCID") or id(result))
            if identity not in seen:
                seen.add(identity)
                accumulated.append(result)
        best = find_best_kmdb_match(accumulated, movie_nm, movie_nm_en, prod_year)
        if best:
            return best, calls
    return None, calls


def needs_kmdb_enrichment(movie_cd: str, merged: dict) -> bool:
    """신규 영화와 과거 KMDB 미매칭 영화를 처리 대상으로 포함합니다."""
    return movie_cd not in merged or not merged[movie_cd].get("kmdb_matched", False)


def extract_kmdb_fields(kmdb_movie: dict) -> dict:
    """
    KMDB 영화 딕셔너리에서 KOFIC과 중복되지 않는 고유 보강 필드만 최적화하여 추출합니다.
    (포스터, 스틸컷, 줄거리, 키워드, 관람등급, VOD 링크)
    """
    # 포스터 URL 목록
    posters_raw = kmdb_movie.get("posters", "") or ""
    posters = [p.strip() for p in posters_raw.split("|") if p.strip()]

    # 스틸컷 URL 목록
    stlls_raw = kmdb_movie.get("stlls", "") or ""
    stlls = [s.strip() for s in stlls_raw.split("|") if s.strip()]

    # 줄거리 (plots 배열 또는 문자열)
    plots = kmdb_movie.get("plots", {})
    plot_text = ""
    if isinstance(plots, dict):
        plot_list = plots.get("plot", [])
        for p in plot_list:
            if isinstance(p, dict) and p.get("plotLang") in ("한국어", "", None):
                plot_text = p.get("plotText", "")
                break
        if not plot_text and plot_list:
            first = plot_list[0]
            if isinstance(first, dict):
                plot_text = first.get("plotText", "")
    elif isinstance(plots, str):
        plot_text = plots

    plot_text = clean_kmdb_str(plot_text)

    # 키워드
    keywords_raw = kmdb_movie.get("keywords", "") or ""
    keywords = [clean_kmdb_str(k) for k in keywords_raw.split(",") if clean_kmdb_str(k)]

    # 관람등급
    ratings = kmdb_movie.get("ratings", {})
    rating_nm = ""
    if isinstance(ratings, dict):
        rating_list = ratings.get("rating", [])
        if rating_list:
            first = rating_list[0]
            if isinstance(first, dict):
                rating_nm = first.get("ratingMain", "") or first.get("ratingGrade", "")

    rating_nm = clean_kmdb_str(rating_nm)

    return {
        "kmdb_id": kmdb_movie.get("DOCID", ""),
        "kmdb_posters": posters,
        "kmdb_stlls": stlls,
        "kmdb_plot": plot_text,
        "kmdb_keywords": keywords,
        "kmdb_rating": rating_nm,
        "kmdb_vod_url": kmdb_movie.get("vodUrl", ""),
        "kmdb_matched": True,
    }


# ──────────────────────────────────────────
# 데이터 로드/저장
# ──────────────────────────────────────────

def load_kofic_details() -> dict:
    if not config.KOFIC_DETAIL_PATH.exists():
        logger.error(f"KOFIC 상세정보 파일이 없습니다: {config.KOFIC_DETAIL_PATH}")
        logger.error("step2_kofic_detail.py를 먼저 실행하세요.")
        raise FileNotFoundError(str(config.KOFIC_DETAIL_PATH))
    with open(config.KOFIC_DETAIL_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    logger.info(f"KOFIC 상세정보 로드: {len(data)}건")
    return data


def load_existing_merged() -> dict:
    if config.MOVIES_MERGED_PATH.exists():
        try:
            with open(config.MOVIES_MERGED_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            logger.info(f"기존 병합 데이터 로드: {len(data)}건")
            return data
        except Exception as e:
            logger.warning(f"기존 병합 데이터 로드 실패: {e}")
    return {}


def save_merged(data: dict) -> None:
    with open(config.MOVIES_MERGED_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"저장: {config.MOVIES_MERGED_PATH} ({len(data)}건)")


# ──────────────────────────────────────────
# 메인 로직
# ──────────────────────────────────────────

def main() -> None:
    config.validate_keys(require_kofic=True, require_kmdb=True)

    kofic_details = load_kofic_details()
    merged = load_existing_merged()

    pending = {
        cd: info for cd, info in kofic_details.items()
        if (
            needs_kmdb_enrichment(cd, merged)
            and not config.is_excluded_movie(info)
        )
    }
    logger.info(f"KMDB 병합 대상: {len(pending)}건 (전체 {len(kofic_details)}건 중)")

    matched_count = 0
    unmatched_count = 0
    save_interval = 50

    for i, (movie_cd, kofic_data) in enumerate(
        tqdm(pending.items(), desc="KMDB 병합")
    ):
        movie_nm = kofic_data.get("movieNm", "")
        movie_nm_en = kofic_data.get("movieNmEn", "")
        # 제작연도 우선, 없으면 개봉연도 사용
        prod_year = str(kofic_data.get("prdtYear", ""))
        open_dt = str(kofic_data.get("openDt", ""))
        if not prod_year and open_dt and len(open_dt) >= 4:
            prod_year = open_dt[:4]

        combined = dict(kofic_data)  # KOFIC 데이터 복사

        best, _ = fetch_best_kmdb_match(
            movie_nm,
            movie_nm_en,
            prod_year,
            director_names(kofic_data),
        )
        if best:
            kmdb_fields = extract_kmdb_fields(best)
            combined.update(kmdb_fields)
            matched_count += 1
        else:
            combined["kmdb_matched"] = False
            unmatched_count += 1

        merged[movie_cd] = combined

        # 중간 저장
        if (i + 1) % save_interval == 0:
            save_merged(merged)
            logger.info(
                f"중간 저장 ({i + 1}/{len(pending)}) — "
                f"매칭: {matched_count}, 미매칭: {unmatched_count}"
            )

    save_merged(merged)
    total = len(pending)
    rate_str = f"{matched_count/total*100:.1f}%" if total > 0 else "0.0%"
    logger.info(
        f"병합 완료 — "
        f"매칭: {matched_count}/{total} ({rate_str}), "
        f"미매칭: {unmatched_count}/{total}"
    )


if __name__ == "__main__":
    main()
