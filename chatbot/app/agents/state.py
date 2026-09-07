from __future__ import annotations

import operator
from typing import Annotated, Any, Literal, TypedDict


Intent = Literal[
    "movie_info",
    "rating",
    "review_summary",
    "rating_and_review",
    "recommendation",
    "fallback",
]


class AgentState(TypedDict, total=False):
    session_id: str
    question: str
    exclude_spoilers: bool
    chat_history: list[dict[str, str]]
    previous_movie_id: int | None
    user_id: str | None
    user_preferences: dict[str, Any]
    router_domain: str | None
    intent_source: str
    query_plan: dict[str, Any]
    query_plan_source: str
    movie_query: str
    movie: dict[str, Any] | None
    intent: Intent
    rating_stats: dict[str, Any]
    retrieved_reviews: list[dict[str, Any]]
    review_search_mode: str
    recommendations: list[dict[str, Any]]
    recommendation_mode: str
    personalization_applied: bool
    release_movies: list[dict[str, Any]]
    capability_notice: dict[str, Any]
    source_data_status: dict[str, Any]
    youtube_videos: list[dict[str, Any]]
    youtube_search_error: str | None
    sources: list[dict[str, Any]]
    draft_answer: str
    generator_source: str
    generator_model: str | None
    answer: str
    answer_review: dict[str, Any]
    evidence_validation: dict[str, Any]
    finalization_reason: str
    review_feedback: str
    retry_count: int
    retry_allowed: bool
    review_history: Annotated[list[dict[str, Any]], operator.add]
    error: str | None
    trace: Annotated[list[dict[str, Any]], operator.add]
