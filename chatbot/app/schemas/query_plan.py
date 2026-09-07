from typing import Literal

from pydantic import BaseModel, Field


QueryIntent = Literal[
    "movie_info",
    "rating",
    "review_summary",
    "rating_and_review",
    "recommendation",
    "fallback",
]

ResourceType = Literal["none", "youtube_review_links", "release_schedule"]
RecommendationSort = Literal["relevance", "latest", "rating"]


class QueryPlan(BaseModel):
    """LLM이 자연어 질문에서 추출하는 실행 계획."""

    intent: QueryIntent
    movie_title: str = ""
    reference_movie_title: str = ""
    genres: list[str] = Field(default_factory=list)
    actors: list[str] = Field(default_factory=list)
    directors: list[str] = Field(default_factory=list)
    countries: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    avoid_keywords: list[str] = Field(default_factory=list)
    moods: list[str] = Field(default_factory=list)
    rating_sources: list[str] = Field(default_factory=list)
    review_sources: list[str] = Field(default_factory=list)
    min_rating: float = Field(default=0, ge=0, le=5)
    release_year_from: int = Field(default=0, ge=0, le=2100)
    release_year_to: int = Field(default=0, ge=0, le=2100)
    max_runtime_minutes: int = Field(default=0, ge=0, le=600)
    release_date_from: str = ""
    release_date_to: str = ""
    limit: int = Field(default=5, ge=1, le=10)
    sort_by: RecommendationSort = "relevance"
    resource_type: ResourceType = "none"
    exclude_spoilers: bool = True
    requires_vector_search: bool = False


QUERY_PLAN_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {
            "type": "string",
            "enum": [
                "movie_info",
                "rating",
                "review_summary",
                "rating_and_review",
                "recommendation",
                "fallback",
            ],
            "description": "Router가 결정한 질문 의도",
        },
        "movie_title": {"type": "string", "description": "질문의 대상 영화 제목. 없으면 빈 문자열"},
        "reference_movie_title": {
            "type": "string",
            "description": "유사 영화 추천의 기준 영화. 없으면 빈 문자열",
        },
        "genres": {"type": "array", "items": {"type": "string"}},
        "actors": {"type": "array", "items": {"type": "string"}},
        "directors": {"type": "array", "items": {"type": "string"}},
        "countries": {"type": "array", "items": {"type": "string"}},
        "keywords": {"type": "array", "items": {"type": "string"}},
        "avoid_keywords": {
            "type": "array",
            "items": {"type": "string"},
            "description": "사용자가 명시적으로 피하고 싶은 소재·표현. 긍정 조건은 넣지 않음",
        },
        "moods": {"type": "array", "items": {"type": "string"}},
        "rating_sources": {
            "type": "array",
            "items": {"type": "string"},
            "description": "요청에 명시된 평점 출처. pop_talk, imdb, rotten_tomatoes, watchapedia, naver 중 선택",
        },
        "review_sources": {
            "type": "array",
            "items": {"type": "string"},
            "description": "요청에 명시된 리뷰 출처. pop_talk, rotten_tomatoes, overseas_critics, naver 중 선택",
        },
        "min_rating": {"type": "number", "minimum": 0, "maximum": 5},
        "release_year_from": {"type": "integer", "minimum": 0, "maximum": 2100},
        "release_year_to": {"type": "integer", "minimum": 0, "maximum": 2100},
        "max_runtime_minutes": {
            "type": "integer",
            "minimum": 0,
            "maximum": 600,
            "description": "최대 상영시간(분). 질문에 제한이 없으면 0",
        },
        "release_date_from": {
            "type": "string",
            "description": "개봉일 조회 시작일 YYYY-MM-DD. 없으면 빈 문자열",
        },
        "release_date_to": {
            "type": "string",
            "description": "개봉일 조회 종료일 YYYY-MM-DD. 없으면 빈 문자열",
        },
        "limit": {"type": "integer", "minimum": 1, "maximum": 10},
        "sort_by": {
            "type": "string",
            "enum": ["relevance", "latest", "rating"],
        },
        "resource_type": {
            "type": "string",
            "enum": ["none", "youtube_review_links", "release_schedule"],
            "description": "영화 외부 리소스 요청 유형",
        },
        "exclude_spoilers": {"type": "boolean"},
        "requires_vector_search": {"type": "boolean"},
    },
    "required": [
        "intent",
        "movie_title",
        "reference_movie_title",
        "genres",
        "actors",
        "directors",
        "countries",
        "keywords",
        "avoid_keywords",
        "moods",
        "rating_sources",
        "review_sources",
        "min_rating",
        "release_year_from",
        "release_year_to",
        "max_runtime_minutes",
        "release_date_from",
        "release_date_to",
        "limit",
        "sort_by",
        "resource_type",
        "exclude_spoilers",
        "requires_vector_search",
    ],
}
