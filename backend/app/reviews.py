from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.database import get_pool
from app.problems import ProblemError
from app.schemas import ReviewCreate, ReviewStatusUpdate, ReviewUpdate
from app.security import require_admin, require_user, subject_id

router = APIRouter(tags=["reviews"])
admin_router = APIRouter(prefix="/admin/reviews", tags=["admin reviews"], dependencies=[Depends(require_admin)])

REVIEW_COLUMNS = """
r.id, r.movie_id, r.user_id, r.rating, r.content, r.contains_spoiler, r.status,
r.source_system, r.source_user_key, r.created_at, r.updated_at, r.deleted_at
"""


def _review(row) -> dict:
    result = dict(row)
    result["id"] = str(result["id"])
    result["user_id"] = str(result["user_id"]) if result["user_id"] else None
    result["movie_id"] = int(result["movie_id"])
    result["rating"] = float(result["rating"])
    return result


async def _available_movie(conn, movie_id: int) -> bool:
    return bool(
        await conn.fetchval(
            """
            SELECT 1
              FROM popcorn_movies m
              LEFT JOIN movie_editorial e ON e.movie_id = m.id
             WHERE m.id = $1
               AND COALESCE(e.is_removed, FALSE) = FALSE
            """,
            movie_id,
        )
    )


@router.get("/me/reviews", summary="내 리뷰 목록 조회", description="로그인한 회원이 직접 작성한 리뷰만 조회합니다. 외부 수집 리뷰는 포함하지 않습니다.")
async def my_reviews(
    include_deleted: bool = False,
    claims: dict = Depends(require_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT {REVIEW_COLUMNS}
              FROM reviews r
             WHERE r.user_id = $1
               AND r.source_system IS NULL
               AND ($2::boolean OR r.deleted_at IS NULL)
             ORDER BY r.updated_at DESC, r.id DESC
            """,
            subject_id(claims), include_deleted,
        )
    return {"items": [_review(row) for row in rows]}


@router.get("/movies/{movie_id}/reviews", summary="영화별 공개 리뷰 조회", description="활성 상태의 삭제되지 않은 리뷰를 페이지 단위로 조회합니다. 기본값은 스포일러 리뷰를 제외합니다.")
async def movie_reviews(
    movie_id: int,
    include_spoilers: bool = False,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT {REVIEW_COLUMNS}, count(*) OVER() AS full_count
              FROM reviews r
             WHERE r.movie_id = $1
               AND r.status = 'ACTIVE'
               AND r.deleted_at IS NULL
               AND ($2::boolean OR r.contains_spoiler = FALSE)
             ORDER BY r.created_at DESC, r.id DESC
             LIMIT $3 OFFSET $4
            """,
            movie_id, include_spoilers, size, (page - 1) * size,
        )
    total = int(rows[0]["full_count"]) if rows else 0
    return {"page": page, "size": size, "total": total, "items": [_review(row) for row in rows]}


@router.post("/reviews", status_code=201, summary="리뷰 작성", description="관리자에 의해 삭제되지 않은 영화에 대해 로그인한 회원의 리뷰를 작성합니다. 영화당 한 개의 리뷰만 작성할 수 있으며 평점은 0.5점 단위입니다.")
async def create_review(body: ReviewCreate, claims: dict = Depends(require_user)):
    user_id = subject_id(claims)
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        if not await _available_movie(conn, body.movie_id):
            raise ProblemError(404, "Movie Not Available", f"movie_id={body.movie_id}")
        exists = await conn.fetchval(
            """
            SELECT 1 FROM reviews
             WHERE user_id = $1 AND movie_id = $2 AND source_system IS NULL AND deleted_at IS NULL
            """,
            user_id, body.movie_id,
        )
        if exists:
            raise ProblemError(409, "Review Already Exists", "Update your existing review instead.")
        row = await conn.fetchrow(
            f"""
            INSERT INTO reviews (user_id, movie_id, rating, content, contains_spoiler, status)
            VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
            RETURNING {REVIEW_COLUMNS.replace('r.', '')}
            """,
            user_id, body.movie_id, body.rating, body.content, body.contains_spoiler,
        )
    return _review(row)


@router.patch("/reviews/{review_id}", summary="내 리뷰 수정", description="로그인한 회원이 직접 작성한 활성 리뷰를 부분 수정합니다. 외부 수집 리뷰는 수정할 수 없습니다.")
async def update_review(review_id: UUID, body: ReviewUpdate, claims: dict = Depends(require_user)):
    values = body.model_dump(exclude_unset=True)
    columns, args = [], []
    for column in ("rating", "content", "contains_spoiler"):
        if column in values:
            args.append(values[column])
            columns.append(f"{column} = ${len(args)}")
    args.extend([review_id, subject_id(claims)])
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            f"""
            UPDATE reviews
               SET {', '.join(columns)}, updated_at = NOW()
             WHERE id = ${len(args) - 1}
               AND user_id = ${len(args)}
               AND source_system IS NULL
               AND deleted_at IS NULL
            RETURNING {REVIEW_COLUMNS.replace('r.', '')}
            """,
            *args,
        )
    if not row:
        raise ProblemError(404, "Editable Review Not Found")
    return _review(row)


@router.delete("/reviews/{review_id}", status_code=204, summary="내 리뷰 삭제", description="로그인한 회원이 직접 작성한 리뷰를 논리 삭제합니다. 외부 수집 리뷰는 삭제할 수 없습니다.")
async def delete_review(review_id: UUID, claims: dict = Depends(require_user)):
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        changed = await conn.execute(
            """
            UPDATE reviews SET deleted_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND user_id = $2 AND source_system IS NULL AND deleted_at IS NULL
            """,
            review_id, subject_id(claims),
        )
    if changed == "UPDATE 0":
        raise ProblemError(404, "Editable Review Not Found")


@admin_router.get("", summary="관리자 리뷰 목록 조회", description="관리자가 영화·노출 상태·수집 출처로 리뷰를 필터링해 조회합니다.")
async def list_reviews(
    movie_id: int | None = None,
    status: str | None = None,
    source_system: str | None = None,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
):
    conditions, args = ["r.deleted_at IS NULL"], []
    for template, value in (("r.movie_id = ${}", movie_id), ("r.status = ${}", status), ("r.source_system = ${}", source_system)):
        if value is not None:
            args.append(value)
            conditions.append(template.format(len(args)))
    args.extend([size, (page - 1) * size])
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT {REVIEW_COLUMNS}, count(*) OVER() AS full_count
              FROM reviews r
             WHERE {' AND '.join(conditions)}
             ORDER BY r.created_at DESC, r.id DESC
             LIMIT ${len(args) - 1} OFFSET ${len(args)}
            """,
            *args,
        )
    total = int(rows[0]["full_count"]) if rows else 0
    return {"page": page, "size": size, "total": total, "items": [_review(row) for row in rows]}


@admin_router.patch("/{review_id}/status", summary="리뷰 노출 상태 변경", description="관리자가 리뷰를 ACTIVE 또는 HIDDEN 상태로 변경합니다. 변경 내역은 관리자 감사 로그에 기록됩니다.")
async def set_review_status(review_id: UUID, body: ReviewStatusUpdate, claims: dict = Depends(require_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            f"""
            UPDATE reviews SET status = $1, updated_at = NOW()
             WHERE id = $2 AND deleted_at IS NULL
            RETURNING {REVIEW_COLUMNS.replace('r.', '')}
            """,
            body.status, review_id,
        )
        if not row:
            raise ProblemError(404, "Review Not Found")
        await conn.execute(
            "INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, payload) VALUES ($1, $2, 'review', $3, $4::jsonb)",
            subject_id(claims), "SET_REVIEW_STATUS", str(review_id), f'{{"status":"{body.status}"}}',
        )
    return _review(row)
