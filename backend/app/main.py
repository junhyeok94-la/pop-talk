import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth import router as auth_router
from app.admin import router as admin_router
from app.catalog import router as catalog_router
from app.config import get_settings
from app.database import close_pool, get_pool
from app.members import router as members_router
from app.profiles import router as profiles_router
from app.public_catalog import router as public_catalog_router
from app.reviews import admin_router as admin_reviews_router, router as reviews_router
from app.problems import ProblemError, problem_handler, response, validation_handler

logger = logging.getLogger("pop_talk_was")


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await close_pool()


settings = get_settings()
OPENAPI_TAGS = [
    {"name": "health", "description": "서버 및 데이터베이스 연결 상태를 확인합니다."},
    {"name": "auth", "description": "회원가입·로그인과 JWT/리프레시 토큰 세션을 처리합니다."},
    {"name": "catalog", "description": "로그인 없이 모든 서비스 영화를 조회하는 프론트엔드용 영화 카탈로그입니다. 검수 완료 여부는 is_verified로 구분합니다."},
    {"name": "profile", "description": "로그인한 사용자의 온보딩 취향 정보를 저장·조회합니다."},
    {"name": "reviews", "description": "회원이 직접 작성한 리뷰를 관리하고 영화별 리뷰를 조회합니다."},
    {"name": "admin reviews", "description": "관리자 전용 리뷰 조회 및 노출 상태 관리 기능입니다."},
    {"name": "movies", "description": "관리자 전용 수집 원본·서비스 영화 조회 기능입니다."},
    {"name": "admin movies", "description": "관리자 전용 영화 편집·검수·삭제·카테고리 관리 기능입니다."},
    {"name": "members", "description": "관리자 전용 회원 및 온보딩 설문 조회 기능입니다."},
]
app = FastAPI(
    title="Pop Talk WAS API",
    description=(
        "Pop Talk 영화 추천 서비스의 WAS API입니다.  \\n"
        "`/catalog`은 공개 API이며, 회원·관리자 API는 `Authorization: Bearer {access_token}`이 필요합니다.  \\n"
        "관리자 API는 JWT의 역할(role)이 `ADMIN` 또는 `SUPER_ADMIN`인 계정만 호출할 수 있습니다."
    ),
    version=settings.app_version,
    openapi_tags=OPENAPI_TAGS,
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
app.add_exception_handler(ProblemError, problem_handler)
app.add_exception_handler(RequestValidationError, validation_handler)
app.include_router(auth_router)
app.include_router(catalog_router)
app.include_router(members_router)
app.include_router(admin_router)
app.include_router(profiles_router)
app.include_router(reviews_router)
app.include_router(admin_reviews_router)
app.include_router(public_catalog_router)


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled request error", exc_info=exc)
    return response(500, "Internal Server Error", "The request could not be processed.")


@app.get("/health", tags=["health"], summary="서버 상태 확인")
async def health() -> dict[str, str]:
    pool = await get_pool()
    await pool.fetchval("select 1")
    return {"status": "ok", "database": "connected"}
