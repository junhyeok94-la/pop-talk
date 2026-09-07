from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Popcorn Movie Agent API"
    app_version: str = "0.3.0"
    app_env: str = "local"
    database_url: str = (
        "postgresql+asyncpg://movie_app:movie_app_password@127.0.0.1:5432/movie_community"
    )
    database_schema: str = ""
    jwt_secret: str = ""
    clova_studio_host: str = "https://clovastudio.stream.ntruss.com"
    clova_studio_api_key: str = ""
    clova_studio_request_id: str = ""
    clova_studio_router_id: str = "rdtll2wj"
    clova_studio_router_version: int = 14
    clova_studio_chat_model: str = "HCX-007"
    # 비워 두면 생성 모델을 검수에도 사용한다. 운영에서는 가능한 한 다른 모델/배포 ID를
    # 지정해 생성 모델의 자기 검수 편향을 낮춘다.
    clova_studio_review_model: str = ""
    clova_studio_embedding_path: str = "/v1/api-tools/embedding/v2"
    youtube_api_host: str = "https://www.googleapis.com/youtube/v3"
    youtube_api_key: str = ""
    youtube_review_default_limit: int = Field(default=5, ge=1, le=10)
    chat_mock_mode: bool = True
    chat_review_pass_score: int = Field(default=85, ge=1, le=100)
    # 최초 생성 뒤 최대 두 번만 다시 실행한다(총 세 번의 초안). LangGraph의
    # 기본 재귀 제한 안에서 응답 시간과 외부 모델 호출 비용을 통제한다.
    chat_review_max_retries: int = Field(default=2, ge=0, le=2)
    catalog_release_year_from: int = 2020
    catalog_release_year_to: int = 2026
    cors_origins: str = "*"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
