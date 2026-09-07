from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Pop Talk WAS API"
    app_version: str = "0.1.0"
    app_env: str = "local"
    port: int = 3200
    database_url: str = ""
    database_schema: str = ""
    jwt_secret: str = ""
    access_token_ttl_seconds: int = Field(default=900, ge=60)
    refresh_token_ttl_days: int = Field(default=14, ge=1)
    cors_origins: str = "http://localhost:3000,http://localhost:3100"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [value.strip() for value in self.cors_origins.split(",") if value.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
