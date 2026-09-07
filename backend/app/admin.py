import json

import asyncpg
from fastapi import APIRouter, Depends, Query

from app.database import get_pool
from app.problems import ProblemError
from app.schemas import (
    MovieApprovalUpdate,
    MovieCategoryCreate,
    MovieCategoryUpdate,
    MovieEditorialUpdate,
    MovieRemovalRequest,
    MovieServiceStatusUpdate,
)
from app.security import require_admin, subject_id

router = APIRouter(tags=["admin movies"], dependencies=[Depends(require_admin)])


def _movie(row) -> dict:
    result = dict(row)
    result["id"] = int(result["id"])
    result["category_ids"] = [int(category_id) for category_id in result["category_ids"]]
    return result


async def _movie_detail(conn, movie_id: int):
    row = await conn.fetchrow(
        """
        SELECT m.id, m.kofic_movie_cd, m.title_ko, m.title_en, m.title_original,
               COALESCE(e.plot_override, m.plot) AS plot,
               e.plot_override, COALESCE(e.is_removed, FALSE) AS is_removed,
               e.removal_reason, m.service_status, m.approval_status,
               m.rejection_reason, m.updated_at,
               COALESCE(
                   ARRAY(SELECT l.category_id FROM movie_category_links l
                         WHERE l.movie_id = m.id ORDER BY l.category_id),
                   '{}'::bigint[]
               ) AS category_ids
          FROM popcorn_movies m
          LEFT JOIN movie_editorial e ON e.movie_id = m.id
         WHERE m.id = $1
        """,
        movie_id,
    )
    if not row:
        raise ProblemError(404, "Movie Not Found", f"id={movie_id}")
    return _movie(row)


async def _audit(conn, actor_id, action: str, target_type: str, target_id: int, payload: dict) -> None:
    await conn.execute(
        """
        INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, payload)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        """,
        actor_id, action, target_type, str(target_id), json.dumps(payload, ensure_ascii=False),
    )


@router.patch("/movies/{movie_id}", summary="영화 운영 정보 수정", description="관리자가 영화 줄거리 보정값과 Pop Talk 자체 카테고리를 수정합니다. 데이터베이스 트리거가 변경된 정보를 임베딩 작업 대기열에 자동 등록합니다.")
async def update_movie_editorial(
    movie_id: int,
    body: MovieEditorialUpdate,
    claims: dict = Depends(require_admin),
):
    actor_id = subject_id(claims)
    changes = body.model_dump(exclude_unset=True)
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        await _movie_detail(conn, movie_id)
        if "plot_override" in changes:
            await conn.execute(
                """
                INSERT INTO movie_editorial (movie_id, plot_override, updated_by)
                VALUES ($1, $2, $3)
                ON CONFLICT (movie_id) DO UPDATE SET
                    plot_override = EXCLUDED.plot_override,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = NOW()
                """,
                movie_id, changes["plot_override"], actor_id,
            )
        if "category_ids" in changes:
            category_ids = sorted(set(changes["category_ids"] or []))
            if category_ids:
                valid_ids = await conn.fetch(
                    "SELECT id FROM movie_categories WHERE id = ANY($1::bigint[]) AND is_active = TRUE",
                    category_ids,
                )
                if {int(row["id"]) for row in valid_ids} != set(category_ids):
                    raise ProblemError(422, "Invalid Movie Category", "Every category must exist and be active.")
            await conn.execute("DELETE FROM movie_category_links WHERE movie_id = $1", movie_id)
            if category_ids:
                await conn.executemany(
                    """
                    INSERT INTO movie_category_links (movie_id, category_id, assigned_by)
                    VALUES ($1, $2, $3)
                    """,
                    [(movie_id, category_id, actor_id) for category_id in category_ids],
                )
        await _audit(conn, actor_id, "UPDATE_MOVIE_EDITORIAL", "movie", movie_id, changes)
        return await _movie_detail(conn, movie_id)


@router.put("/movies/{movie_id}/approval", summary="영화 검수 상태 변경", description="관리자가 영화의 검수 상태를 PENDING, APPROVED, REJECTED 중 하나로 변경합니다. REJECTED는 사유가 필수입니다.")
async def set_movie_approval(movie_id: int, body: MovieApprovalUpdate, claims: dict = Depends(require_admin)):
    actor_id = subject_id(claims)
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        detail = await _movie_detail(conn, movie_id)
        if detail["is_removed"] and body.status != "REJECTED":
            raise ProblemError(409, "Removed Movie", "Restore the movie before changing its approval status.")
        reason = body.reason.strip() if body.reason else None
        row = await conn.fetchrow(
            """
            UPDATE popcorn_movies
               SET approval_status = $1::movie_approval_status,
                   rejection_reason = CASE WHEN $1 = 'REJECTED' THEN $2 ELSE NULL END,
                   approved_by = CASE WHEN $1 = 'APPROVED' THEN $3 ELSE approved_by END,
                   approved_at = CASE WHEN $1 = 'APPROVED' THEN NOW() ELSE approved_at END,
                   service_status = CASE WHEN $1 = 'REJECTED' THEN 'HIDDEN'::movie_service_status ELSE service_status END,
                   updated_at = NOW()
             WHERE id = $4
            RETURNING id
            """,
            body.status, reason, str(actor_id), movie_id,
        )
        if not row:
            raise ProblemError(404, "Movie Not Found")
        await _audit(conn, actor_id, "SET_MOVIE_APPROVAL", "movie", movie_id, {"status": body.status, "reason": reason})
        return await _movie_detail(conn, movie_id)


@router.put("/movies/{movie_id}/service-status", summary="영화 서비스 노출 상태 변경", description="관리자가 서비스 노출 상태를 변경합니다. PUBLISHED는 검수 완료(APPROVED) 영화에만 설정할 수 있습니다.")
async def set_movie_service_status(movie_id: int, body: MovieServiceStatusUpdate, claims: dict = Depends(require_admin)):
    actor_id = subject_id(claims)
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        detail = await _movie_detail(conn, movie_id)
        if detail["is_removed"] and body.status != "HIDDEN":
            raise ProblemError(409, "Removed Movie", "Restore the movie before publishing it.")
        if body.status == "PUBLISHED" and detail["approval_status"] != "APPROVED":
            raise ProblemError(409, "Movie Not Approved", "Only approved movies may be published.")
        await conn.execute(
            "UPDATE popcorn_movies SET service_status = $1::movie_service_status, updated_at = NOW() WHERE id = $2",
            body.status, movie_id,
        )
        await _audit(conn, actor_id, "SET_MOVIE_SERVICE_STATUS", "movie", movie_id, {"status": body.status})
        return await _movie_detail(conn, movie_id)


@router.delete("/movies/{movie_id}", summary="영화 단건 논리 삭제", description="관리자가 잘못된 영화 한 건을 서비스에서 숨깁니다. 원본 데이터는 보존되며 복구 API로 되돌릴 수 있습니다.")
async def remove_movie(movie_id: int, body: MovieRemovalRequest, claims: dict = Depends(require_admin)):
    """Single-item logical removal. The source record and associated evidence stay recoverable."""
    actor_id = subject_id(claims)
    reason = body.reason.strip()
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        await _movie_detail(conn, movie_id)
        await conn.execute(
            """
            INSERT INTO movie_editorial (movie_id, is_removed, removal_reason, updated_by)
            VALUES ($1, TRUE, $2, $3)
            ON CONFLICT (movie_id) DO UPDATE SET
                is_removed = TRUE, removal_reason = EXCLUDED.removal_reason,
                updated_by = EXCLUDED.updated_by, updated_at = NOW()
            """,
            movie_id, reason, actor_id,
        )
        await conn.execute(
            """
            UPDATE popcorn_movies
               SET service_status = 'HIDDEN', approval_status = 'REJECTED',
                   rejection_reason = $1, updated_at = NOW()
             WHERE id = $2
            """,
            reason, movie_id,
        )
        await _audit(conn, actor_id, "REMOVE_MOVIE", "movie", movie_id, {"reason": reason})
        return await _movie_detail(conn, movie_id)


@router.post("/movies/{movie_id}/restore", summary="논리 삭제 영화 복구", description="논리 삭제한 영화를 DRAFT·PENDING 상태로 복구합니다. 공개하려면 다시 검수와 발행을 해야 합니다.")
async def restore_movie(movie_id: int, claims: dict = Depends(require_admin)):
    actor_id = subject_id(claims)
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        await _movie_detail(conn, movie_id)
        await conn.execute(
            "UPDATE movie_editorial SET is_removed = FALSE, removal_reason = NULL, updated_by = $1, updated_at = NOW() WHERE movie_id = $2",
            actor_id, movie_id,
        )
        await conn.execute(
            """
            UPDATE popcorn_movies
               SET service_status = 'DRAFT', approval_status = 'PENDING', rejection_reason = NULL, updated_at = NOW()
             WHERE id = $1
            """,
            movie_id,
        )
        await _audit(conn, actor_id, "RESTORE_MOVIE", "movie", movie_id, {})
        return await _movie_detail(conn, movie_id)


@router.get("/movie-categories", summary="영화 운영 카테고리 목록 조회", description="관리자가 Pop Talk 자체 영화 카테고리를 조회합니다. active_only=true이면 활성 카테고리만 반환합니다.")
async def list_movie_categories(active_only: bool = False):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, code, name, type, description, sort_order, is_active, created_at, updated_at FROM movie_categories "
            "WHERE ($1::boolean = FALSE OR is_active = TRUE) ORDER BY type, sort_order, id",
            active_only,
        )
    return {"items": [{**dict(row), "id": int(row["id"])} for row in rows]}


@router.post("/movie-categories", status_code=201, summary="영화 운영 카테고리 생성", description="관리자가 장르·분위기·테마·등급 유형의 자체 카테고리를 생성합니다. code는 대문자 영문·숫자·밑줄만 사용할 수 있습니다.")
async def create_movie_category(body: MovieCategoryCreate, claims: dict = Depends(require_admin)):
    actor_id = subject_id(claims)
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO movie_categories (code, name, type, description, sort_order, created_by, updated_by)
                VALUES ($1, $2, $3, $4, $5, $6, $6)
                RETURNING id, code, name, type, description, sort_order, is_active, created_at, updated_at
                """,
                body.code, body.name.strip(), body.type, body.description, body.sort_order, str(actor_id),
            )
        except asyncpg.UniqueViolationError as exc:
            raise ProblemError(409, "Movie Category Already Exists") from exc
        await _audit(conn, actor_id, "CREATE_MOVIE_CATEGORY", "movie_category", int(row["id"]), body.model_dump())
    return {**dict(row), "id": int(row["id"])}


@router.patch("/movie-categories/{category_id}", summary="영화 운영 카테고리 수정", description="관리자가 카테고리 이름, 설명, 노출 순서, 활성 여부를 부분 수정합니다.")
async def update_movie_category(category_id: int, body: MovieCategoryUpdate, claims: dict = Depends(require_admin)):
    actor_id = subject_id(claims)
    values = body.model_dump(exclude_unset=True)
    updates, args = [], []
    for column in ("name", "description", "sort_order", "is_active"):
        if column in values:
            args.append(values[column].strip() if column == "name" and values[column] else values[column])
            updates.append(f"{column} = ${len(args)}")
    args.extend([str(actor_id), category_id])
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            f"""
            UPDATE movie_categories SET {', '.join(updates)}, updated_by = ${len(args) - 1}, updated_at = NOW()
             WHERE id = ${len(args)}
            RETURNING id, code, name, type, description, sort_order, is_active, created_at, updated_at
            """,
            *args,
        )
        if not row:
            raise ProblemError(404, "Movie Category Not Found")
        await _audit(conn, actor_id, "UPDATE_MOVIE_CATEGORY", "movie_category", category_id, values)
    return {**dict(row), "id": int(row["id"])}


@router.delete("/movie-categories/{category_id}", status_code=204, summary="영화 운영 카테고리 삭제", description="어느 영화에도 연결되지 않은 카테고리만 삭제합니다. 연결된 카테고리는 먼저 영화에서 해제해야 합니다.")
async def delete_movie_category(category_id: int, claims: dict = Depends(require_admin)):
    actor_id = subject_id(claims)
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        linked = await conn.fetchval("SELECT 1 FROM movie_category_links WHERE category_id = $1", category_id)
        if linked:
            raise ProblemError(409, "Movie Category In Use", "Unassign the category before deleting it.")
        changed = await conn.execute("DELETE FROM movie_categories WHERE id = $1", category_id)
        if changed == "DELETE 0":
            raise ProblemError(404, "Movie Category Not Found")
        await _audit(conn, actor_id, "DELETE_MOVIE_CATEGORY", "movie_category", category_id, {})
