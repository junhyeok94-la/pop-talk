"""
config.py
---------
환경변수 로딩, API 설정, API 키 로테이션(Key Rotation), 경로 상수 정의 및 필터링 규칙
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# ──────────────────────────────────────────
# 경로 설정
# ──────────────────────────────────────────
BATCH_DIR = Path(__file__).parent
PROJECT_ROOT = BATCH_DIR.parent
DATA_DIR = BATCH_DIR / "data"  # 레거시 수집 함수 호환용이며 운영 배치는 파일을 기록하지 않습니다.
# 배치 서버 전용 설정을 우선하고, 저장소 루트 .env는 로컬 개발용 fallback으로 사용합니다.
SCHEDULED_ENV_PATH = BATCH_DIR / ".env"
load_dotenv(SCHEDULED_ENV_PATH)
load_dotenv(PROJECT_ROOT / ".env")
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DATABASE_SCHEMA = os.getenv("DATABASE_SCHEMA", "").strip()

# ──────────────────────────────────────────
# API 키 및 로테이션 (Key Rotation) 설정
# ──────────────────────────────────────────
# 1) KOFIC_API_KEY 에 쉼표(,)로 복수 키 지정 가능 (예: "key1,key2,key3")
# 2) KOFIC_API_KEY_1, KOFIC_API_KEY_2 형태 환경변수도 자동 인식
_kofic_raw = os.getenv("KOFIC_API_KEY", "")
_kofic_keys_list = [k.strip() for k in _kofic_raw.split(",") if k.strip()]

# KOFIC_API_KEY_1, KOFIC_API_KEY_2 ... 도 추가 탐색
for i in range(1, 10):
    k = os.getenv(f"KOFIC_API_KEY_{i}", "").strip()
    if k and k not in _kofic_keys_list:
        _kofic_keys_list.append(k)

KOFIC_API_KEYS: list[str] = _kofic_keys_list
_kofic_key_idx: int = 0

_kmdb_raw = os.getenv("KMDB_API_KEY", "")
KMDB_API_KEYS: list[str] = [k.strip() for k in _kmdb_raw.split(",") if k.strip()]
KMDB_API_KEY: str = KMDB_API_KEYS[0] if KMDB_API_KEYS else ""


def get_kofic_api_key() -> str:
    """현재 활성화된 KOFIC API 키를 반환합니다."""
    if not KOFIC_API_KEYS:
        return ""
    return KOFIC_API_KEYS[_kofic_key_idx % len(KOFIC_API_KEYS)]


def reload_kofic_keys() -> None:
    """실행 중 .env 파일이 수정되었을 때 새로운 API 키를 동적으로 감지하여 목록에 추가합니다."""
    global KOFIC_API_KEYS
    load_dotenv(SCHEDULED_ENV_PATH, override=True)
    load_dotenv(PROJECT_ROOT / ".env", override=False)
    raw = os.getenv("KOFIC_API_KEY", "")
    new_list = [k.strip() for k in raw.split(",") if k.strip()]
    for i in range(1, 10):
        k = os.getenv(f"KOFIC_API_KEY_{i}", "").strip()
        if k and k not in new_list:
            new_list.append(k)

    for k in new_list:
        if k not in KOFIC_API_KEYS:
            KOFIC_API_KEYS.append(k)


def rotate_kofic_api_key() -> str | None:
    """
    KOFIC API 일일 호출 한도 초과 시 다음 키로 스위칭합니다.
    새로운 키가 있으면 키 문자열 반환, 더 이상 키가 없으면 None 반환.
    """
    global _kofic_key_idx
    # 런타임 .env 재감지
    reload_kofic_keys()

    if len(KOFIC_API_KEYS) <= 1:
        return None

    _kofic_key_idx += 1
    if _kofic_key_idx >= len(KOFIC_API_KEYS):
        return None

    new_key = get_kofic_api_key()
    print(f"[KEY ROTATION] KOFIC API 키 한도 초과 -> 다음 키({_kofic_key_idx + 1}/{len(KOFIC_API_KEYS)})로 자동 전환: {new_key[:8]}***")
    return new_key


def validate_keys(require_kofic: bool = True, require_kmdb: bool = True) -> None:
    """API 키 존재 여부를 확인합니다. 키 미설정 시 오류를 출력하고 종료."""
    missing = []
    if require_kofic and not KOFIC_API_KEYS:
        missing.append("KOFIC_API_KEY")
    if require_kmdb and not KMDB_API_KEYS:
        missing.append("KMDB_API_KEY")
    if missing:
        print(f"[ERROR] .env 파일에 다음 키가 없습니다: {', '.join(missing)}")
        print(f"  → 프로젝트 루트({PROJECT_ROOT / '.env'})를 확인해 주세요.")
        sys.exit(1)


def validate_scheduled_settings() -> None:
    validate_keys(require_kofic=True, require_kmdb=True)
    if not DATABASE_URL:
        raise RuntimeError(f"DATABASE_URL이 없습니다: {SCHEDULED_ENV_PATH}")
    if not DATABASE_SCHEMA:
        raise RuntimeError(f"DATABASE_SCHEMA가 없습니다: {SCHEDULED_ENV_PATH}")


# 하위 호환성을 위해 KOFIC_API_KEY 프로퍼티 형태 제공
KOFIC_API_KEY = get_kofic_api_key()


# ──────────────────────────────────────────
# KOFIC(KOBIS) API 설정
# ──────────────────────────────────────────
KOFIC_BASE_URL = "http://www.kobis.or.kr/kobisopenapi/webservice/rest"

KOFIC_MOVIE_LIST_URL = f"{KOFIC_BASE_URL}/movie/searchMovieList.json"
KOFIC_MOVIE_DETAIL_URL = f"{KOFIC_BASE_URL}/movie/searchMovieInfo.json"

KOFIC_ITEMS_PER_PAGE = 100
KOFIC_DEFAULT_NATION = ""
KOFIC_RATE_LIMIT_DELAY = 0.2

# 기본 영화 구분 코드 (220101: 장편, 220102: 단편, 220103: 옴니버스 등)
KOFIC_DEFAULT_MOVIE_TYPE_CD = "220101"


# ──────────────────────────────────────────
# KMDB API 설정
# ──────────────────────────────────────────
KMDB_BASE_URL = "http://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp"
KMDB_COLLECTION = "kmdb_new2"
KMDB_LIST_COUNT = 5
KMDB_RATE_LIMIT_DELAY = 0.3


# ──────────────────────────────────────────
# 제외 장르/콘텐츠 필터링 규칙 (성인물/에로 영화 제외)
# ──────────────────────────────────────────
EXCLUDED_GENRE_KEYWORDS = ["성인물", "에로"]

# 에로 영화 전문 수입/배급사 목록
EXCLUDED_COMPANIES = [
    "(주)영진크리에이티브",
    "(주)가온콘텐츠",
    "(주)라온컴퍼니플러스",
    "(주)도키엔터테인먼트",
    "주식회사 케이앤아이",
    "(주)영화사가을",
    "(주)영화사 가을",
    "엔트리커뮤니케이션즈",
    "스마일컨텐츠",
    "에스팀",
    "(주)아이피큐",
    "영드래곤 미디어",
    "(주)컨텐츠 빌리지",
    "(주)디에이치미디어",
    "주식회사 피에스앤제이",
]

EXCLUDED_COMPANY_GROUPS = [
    {"라임필름", "케이엘 픽쳐스"},
]

# 에로 영화 전문 가명 감독 목록
EXCLUDED_DIRECTORS = [
    "김종석",
    "천성준",
    "사쿠라비토",
    "버드맨 텟페이",
    "디렉터 O",
    "토미죠 타로",
    "나기라 겐조",
    "모소조쿠",
    "츠지 코지",
    "사노 B사쿠",
    "나카노 야요이",
    "오오사키히로하루",
    "아카바네 키쿠지로",
    "히이라기 엔부",
    "키무라 히로유키",
    "하라다 칸토나",
    "코이케.Jp",
    "이즈미 류지",
    "나가에 타카미",
    "아나콘다 아나키",
    "사다오카 사다오",
    "비바 곤조",
    "아카바네 류지",
    "쿠로아카 긴조",
]


def is_excluded_movie(movie: dict) -> bool:
    """
    성인물(에로) 등 서비스 성격과 맞지 않는 불필요한 영화인지 판단합니다.
    - 장르 키워드 ('성인물', '에로')
    - 에로 전문 수입/배급사
    - 에로 전문 가명 감독
    """
    if not isinstance(movie, dict):
        return True

    # 1. 장르 검사
    genres = [
        movie.get("genreAlt", ""),
        movie.get("repGenreNm", ""),
        movie.get("genreNm", ""),
        movie.get("kmdb_genre", ""),
    ]
    genre_str = " ".join(str(g) for g in genres if g)

    for kw in EXCLUDED_GENRE_KEYWORDS:
        if kw in genre_str:
            return True

    # 2. 수입/배급사 검사
    companys = movie.get("companys", [])
    company_names: set[str] = set()
    if isinstance(companys, list):
        for c in companys:
            c_name = c.get("companyNm", "") if isinstance(c, dict) else str(c)
            if c_name:
                company_names.add(c_name)
            if c_name in EXCLUDED_COMPANIES:
                return True
    if any(group.issubset(company_names) for group in EXCLUDED_COMPANY_GROUPS):
        return True

    # 3. 감독 검사
    directors = movie.get("directors", [])
    if isinstance(directors, list):
        for d in directors:
            d_name = d.get("peopleNm", "") if isinstance(d, dict) else str(d)
            if d_name in EXCLUDED_DIRECTORS:
                return True

    return False


# ──────────────────────────────────────────
# 데이터 파일 경로
# ──────────────────────────────────────────
KOFIC_LIST_PATH = DATA_DIR / "kofic_movie_list.json"
KOFIC_DETAIL_PATH = DATA_DIR / "kofic_movie_detail.json"
MOVIES_MERGED_PATH = DATA_DIR / "movies_merged.json"
MOVIES_FINAL_JSON_PATH = DATA_DIR / "movies_final.json"
MOVIES_FINAL_CSV_PATH = DATA_DIR / "movies_final.csv"
FAILED_LOG_PATH = DATA_DIR / "failed_log.json"
EXCLUDED_LOG_PATH = DATA_DIR / "excluded_log.json"


# ──────────────────────────────────────────
# 수집 기본 파라미터
# ──────────────────────────────────────────
import datetime

DEFAULT_START_YEAR = 2020
DEFAULT_END_YEAR = datetime.date.today().year
