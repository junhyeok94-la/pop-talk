from fastapi import APIRouter, Depends

from app.database import get_pool
from app.movie_category_preferences import (
    fetch_user_preferences,
    user_preferences,
    validate_movie_categories,
)
from app.problems import ProblemError
from app.schemas import OnboardingUpdate
from app.security import require_user, subject_id

router = APIRouter(prefix="/me", tags=["profile"], dependencies=[Depends(require_user)])

@router.get("/preferences", summary="내 취향 정보 조회", description="로그인한 사용자가 선택한 영화 카테고리와 온보딩 상태를 조회합니다.")
async def preferences(claims: dict = Depends(require_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await fetch_user_preferences(conn, subject_id(claims))


@router.put("/onboarding", summary="온보딩 취향 저장", description="활성 영화 카테고리 ID 목록으로 회원의 온보딩 취향을 전체 갱신합니다.")
async def save_onboarding(body: OnboardingUpdate, claims: dict = Depends(require_user)):
    user_id = subject_id(claims)
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        await validate_movie_categories(conn, body.movie_category_ids)
        row = await conn.fetchrow(
            """
            UPDATE users
               SET onboarding_movie_category_ids = $2::bigint[],
                   onboarding_status = 'COMPLETED',
                   updated_at = NOW()
             WHERE id = $1 AND deleted_at IS NULL
         RETURNING id AS user_id, onboarding_status, onboarding_movie_category_ids,
                   to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at
            """,
            user_id,
            body.movie_category_ids,
        )
        if not row:
            raise ProblemError(404, "Member Not Found")
        return user_preferences(row)
