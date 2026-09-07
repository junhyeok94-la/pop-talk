from __future__ import annotations

import html
from collections.abc import Mapping
from typing import Any

import httpx

from app.config import Settings
from app.schemas.youtube import YouTubeVideo


class YouTubeClient:
    """영화 관련 YouTube 검색 결과를 검증 가능한 링크 목록으로 정규화한다."""

    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.settings = settings
        self.transport = transport

    @property
    def configured(self) -> bool:
        return bool(self.settings.youtube_api_key)

    async def search_movie_review_links(
        self,
        movie_title: str,
        *,
        limit: int | None = None,
    ) -> list[YouTubeVideo]:
        """영화명 기반으로 리뷰 영상을 검색하고 상세 정보와 URL을 반환한다.

        Search API는 관련 영상 ID와 정렬 순서를, Videos API는 채널·조회수 등의
        표시 정보를 제공한다. 두 응답을 결합해 생성기와 검수기가 같은 링크를 본다.
        """
        if not self.configured:
            raise RuntimeError("YOUTUBE_API_KEY가 설정되지 않았습니다.")

        max_results = limit or self.settings.youtube_review_default_limit
        max_results = max(1, min(max_results, 10))
        search_params = {
            "key": self.settings.youtube_api_key,
            "part": "snippet",
            "q": f"{movie_title} 영화 리뷰",
            "type": "video",
            "maxResults": max_results,
            "order": "relevance",
        }
        async with httpx.AsyncClient(
            base_url=self.settings.youtube_api_host,
            timeout=15.0,
            transport=self.transport,
        ) as client:
            search_response = await client.get("search", params=search_params)
            search_response.raise_for_status()
            search_items = self._items(search_response.json())
            video_ids = [
                str(item.get("id", {}).get("videoId"))
                for item in search_items
                if isinstance(item.get("id"), Mapping) and item["id"].get("videoId")
            ]
            if not video_ids:
                return []

            videos_response = await client.get(
                "videos",
                params={
                    "key": self.settings.youtube_api_key,
                    "part": "snippet,statistics",
                    "id": ",".join(video_ids),
                },
            )
            videos_response.raise_for_status()

        videos_by_id = {
            str(item.get("id")): self._to_video(item)
            for item in self._items(videos_response.json())
            if item.get("id")
        }
        # Search API의 관련도 순서를 유지한다. Videos API의 반환 순서에 의존하지 않는다.
        return [videos_by_id[video_id] for video_id in video_ids if video_id in videos_by_id]

    @staticmethod
    def _items(data: Any) -> list[dict[str, Any]]:
        if not isinstance(data, dict):
            raise ValueError("YouTube API 응답 형식이 올바르지 않습니다.")
        items = data.get("items", [])
        if not isinstance(items, list):
            raise ValueError("YouTube API 응답의 items가 배열이 아닙니다.")
        return [item for item in items if isinstance(item, dict)]

    @staticmethod
    def _to_video(item: dict[str, Any]) -> YouTubeVideo:
        snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
        statistics = item.get("statistics") if isinstance(item.get("statistics"), dict) else {}
        thumbnails = snippet.get("thumbnails") if isinstance(snippet.get("thumbnails"), dict) else {}
        thumbnail = next(
            (
                thumbnails[size].get("url")
                for size in ("high", "medium", "default")
                if isinstance(thumbnails.get(size), dict) and thumbnails[size].get("url")
            ),
            None,
        )
        video_id = str(item["id"])
        return YouTubeVideo(
            video_id=video_id,
            video_url=f"https://www.youtube.com/watch?v={video_id}",
            title=html.unescape(str(snippet.get("title") or "제목 없음")),
            channel_name=html.unescape(str(snippet.get("channelTitle") or "")),
            published_at=str(snippet["publishedAt"]) if snippet.get("publishedAt") else None,
            thumbnail_url=str(thumbnail) if thumbnail else None,
            view_count=int(statistics.get("viewCount") or 0),
        )
