from fastapi import APIRouter, Query

from app.database import get_pool
from app.problems import ProblemError

router = APIRouter(prefix="/catalog", tags=["catalog"])

PUBLIC_COLUMNS = """
m.id, m.title_ko, m.title_en, m.title_original, m.release_date, m.production_year,
m.runtime_minutes, m.genres, m.directors, m.actors, m.poster_url,
 m.approval_status, m.service_status,
 (m.approval_status = 'APPROVED') AS is_verified,
COALESCE(e.plot_override, m.plot) AS plot,
COALESCE(
    ARRAY(SELECT c.name FROM movie_category_links l JOIN movie_categories c ON c.id = l.category_id
           WHERE l.movie_id = m.id AND c.is_active = TRUE ORDER BY c.sort_order, c.id),
    '{}'::varchar[]
) AS curated_categories
"""


def _movie(row) -> dict:
    result = dict(row)
    result["id"] = int(result["id"])
    return result


@router.get(
    "/movie-categories",
    summary="회원가입 온보딩 취향 선택지 조회",
    description="회원가입 화면에서 복수 선택할 활성 movie category 목록을 유형 및 노출 순서대로 반환합니다.",
)
async def list_onboarding_movie_categories():
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, code, name, type, description, sort_order
          FROM movie_categories
         WHERE is_active = TRUE
         ORDER BY type, sort_order, id
        """
    )
    return {
        "items": [
            {**dict(row), "id": int(row["id"])}
            for row in rows
        ]
    }


@router.get(
    "/display-categories",
    summary="홈 화면 알약 문구 조회",
    description=(
        "홈의 자연어 입력창 아래 알약에 쓰는 문구 목록입니다. "
        "short_label은 버튼에 보이는 짧은 글자이고, name은 알약을 눌렀을 때 "
        "입력창에 채워져 챗봇에게 그대로 전달되는 문장입니다. "
        "운영자가 꺼 둔 문구도 함께 내려주므로 is_active로 걸러 쓰세요. "
        "회원가입 온보딩 선택지는 이 목록이 아니라 /catalog/movie-categories입니다."
    ),
)
async def list_display_categories():
    """어드민 '화면 문구 관리'가 쓰는 테이블을 그대로 내려준다.

    필터를 걸지 않는다 — 무엇을 보여줄지는 프론트가 정한다. 대신 is_active를
    응답에 실어 보내므로 꺼진 문구를 거르는 일은 호출부의 몫이다.

    category_codes는 이 문구가 묶는 movie_categories.code 목록이다. FK가 아니라
    문자열 배열이라(어드민 011) 실재하지 않는 코드가 섞여 있을 수 있다.
    """
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, name, short_label, category_codes, description,
               sort_order, is_active, created_by, updated_by,
               created_at, updated_at
          FROM display_categories
         ORDER BY sort_order, id
        """
    )
    return {
        "items": [
            {**dict(row), "id": int(row["id"])}
            for row in rows
        ]
    }


@router.get("/movies", summary="영화 카탈로그 목록 조회", description="로그인 없이 모든 서비스 영화를 페이지 단위로 조회합니다. 관리자에 의해 삭제된 영화만 제외하며, 검수 완료 여부는 is_verified로 구분합니다.")
async def list_catalog_movies(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    q: str | None = None,
    genre: str | None = None,
):
    conditions = [
        "COALESCE(e.is_removed, FALSE) = FALSE",
    ]
    args: list[object] = []
    if q:
        args.append(f"%{q.strip()}%")
        conditions.append(
            f"(m.title_ko ILIKE ${len(args)} OR m.title_en ILIKE ${len(args)} OR m.title_original ILIKE ${len(args)})"
        )
    if genre:
        args.append(genre.strip())
        conditions.append(f"(${len(args)} = ANY(m.genres) OR EXISTS ("
                          f"SELECT 1 FROM movie_category_links l JOIN movie_categories c ON c.id=l.category_id "
                          f"WHERE l.movie_id=m.id AND c.name=${len(args)} AND c.is_active=TRUE))")
    args.extend([size, (page - 1) * size])
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT {PUBLIC_COLUMNS}, count(*) OVER() AS full_count
              FROM popcorn_movies m
              LEFT JOIN movie_editorial e ON e.movie_id = m.id
             WHERE {' AND '.join(conditions)}
             ORDER BY m.release_date DESC, m.id DESC
             LIMIT ${len(args) - 1} OFFSET ${len(args)}
            """,
            *args,
        )
    total = int(rows[0]["full_count"]) if rows else 0
    return {"page": page, "size": size, "total": total, "items": [_movie(row) for row in rows]}


@router.get("/movies/{movie_id}", summary="영화 카탈로그 상세 조회", description="로그인 없이 서비스 영화의 상세 정보와 운영자 지정 카테고리를 조회합니다. 관리자에 의해 삭제된 영화는 조회할 수 없습니다.")
async def get_catalog_movie(movie_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""
            SELECT {PUBLIC_COLUMNS}
              FROM popcorn_movies m
              LEFT JOIN movie_editorial e ON e.movie_id = m.id
             WHERE m.id = $1
               AND COALESCE(e.is_removed, FALSE) = FALSE
            """,
            movie_id,
        )
    if not row:
        raise ProblemError(404, "Movie Not Found")
    return _movie(row)
