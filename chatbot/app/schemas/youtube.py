from __future__ import annotations

from pydantic import BaseModel, Field


class YouTubeVideo(BaseModel):
    """YouTube Data API 응답을 챗봇이 사용할 공통 영상 형식으로 정규화한다."""

    video_id: str
    video_url: str
    title: str
    channel_name: str = ""
    published_at: str | None = None
    thumbnail_url: str | None = None
    view_count: int = Field(default=0, ge=0)
