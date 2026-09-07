import httpx
import pytest

from app.clients.youtube import YouTubeClient
from app.config import Settings


pytestmark = pytest.mark.asyncio


async def test_search_movie_review_links_combines_search_and_video_details():
    requested_paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested_paths.append(request.url.path)
        if request.url.path == "/youtube/v3/search":
            assert request.url.params["q"] == "실미도 영화 리뷰"
            assert request.url.params["type"] == "video"
            return httpx.Response(
                200,
                json={"items": [{"id": {"videoId": "first"}}, {"id": {"videoId": "second"}}]},
            )
        assert request.url.path == "/youtube/v3/videos"
        assert request.url.params["id"] == "first,second"
        return httpx.Response(
            200,
            json={
                "items": [
                    {
                        "id": "second",
                        "snippet": {
                            "title": "두 번째 &amp; 리뷰",
                            "channelTitle": "영화 채널",
                            "publishedAt": "2026-08-01T00:00:00Z",
                            "thumbnails": {"default": {"url": "https://image/second"}},
                        },
                        "statistics": {"viewCount": "20"},
                    },
                    {
                        "id": "first",
                        "snippet": {
                            "title": "첫 번째 리뷰",
                            "thumbnails": {"high": {"url": "https://image/first"}},
                        },
                        "statistics": {"viewCount": "10"},
                    },
                ]
            },
        )

    client = YouTubeClient(
        Settings(youtube_api_key="test-key"),
        transport=httpx.MockTransport(handler),
    )
    videos = await client.search_movie_review_links("실미도", limit=2)

    assert requested_paths == ["/youtube/v3/search", "/youtube/v3/videos"]
    assert [video.video_id for video in videos] == ["first", "second"]
    assert videos[1].title == "두 번째 & 리뷰"
    assert videos[0].video_url == "https://www.youtube.com/watch?v=first"
    assert videos[0].view_count == 10
