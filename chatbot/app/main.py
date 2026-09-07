from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.chat import router as chat_router
from app.config import get_settings
from app.database import close_pool, get_pool


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 풀은 첫 요청 때 지연 생성한다. 종료 시 닫아 진행 중인 DB 작업을
    # 안전하게 마무리한다.
    yield
    await close_pool()


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
# 이 서버는 챗봇 API만 노출한다. 영화 카탈로그 등 일반 도메인 API는
# AI 앱 서버가 아닌 WAS의 책임이다.
app.include_router(chat_router)


@app.get("/health")
async def health() -> dict[str, str]:
    pool = await get_pool()
    await pool.fetchval("SELECT 1")
    return {"status": "ok", "database": "connected"}
