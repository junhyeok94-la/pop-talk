from __future__ import annotations

from uuid import uuid4

import pytest

from app.agents.graph import (
    NODE_02_CLASSIFY_INTENT,
    NODE_06_GENERATE_DRAFT,
    NODE_05_RETRIEVE_YOUTUBE_REVIEW_LINKS,
    NODE_05_RETRIEVE_RELEASE_SCHEDULE,
    NODE_08_FINALIZE_ANSWER,
    _normalize_review_for_available_movie_metadata,
    _evidence_units,
    _repair_missing_evidence_citations,
    _strip_internal_evidence_citations,
    _validate_evidence_citations,
    _extract_movie_title,
    _extract_max_runtime_minutes,
    _fallback_query_plan,
    _intent_from_router_domain,
    _normalize_query_plan,
    _with_trace,
    analyze_query,
    classify_intent,
    finalize_answer,
    generate_answer,
    movie_agent,
    next_after_review,
    review_draft,
    retrieve_youtube_review_links,
    retrieve_release_schedule,
    retrieve_reviews,
    query_rating,
    recommend_movies,
    route_by_intent,
    resolve_movie,
)
from app.schemas.answer_review import AnswerReview, AnswerReviewScores
from app.config import Settings
from app.schemas.query_plan import QueryPlan
from app.schemas.youtube import YouTubeVideo


pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("실미도 평점은 몇 점이야?", "rating"),
        ("실미도 리뷰 반응은 어때?", "review_summary"),
        ("실미도 평점과 리뷰를 알려줘", "rating_and_review"),
        ("실미도 감독은 누구야?", "movie_info"),
    ],
)
async def test_rule_based_intents(question: str, expected: str):
    result = await classify_intent({"question": question})
    assert result["intent"] == expected


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("실미도 감독은 누구야?", "실미도"),
        ('"빙우" 줄거리 알려줘', "빙우"),
        ("영화 카멜레온의 시 리뷰는 어때?", "카멜레온의 시"),
    ],
)
async def test_extract_movie_title(question: str, expected: str):
    assert _extract_movie_title(question) == expected


@pytest.mark.parametrize(
    ("domain", "question", "expected"),
    [
        ("영화 평점", "실미도 알려줘", "rating"),
        ("MOVIE_REVIEW", "실미도 알려줘", "review_summary"),
        ("평점 및 리뷰", "실미도 알려줘", "rating_and_review"),
        ("영화 정보", "실미도 알려줘", "movie_info"),
        ("챗봇 질문 의도 분류기", "실미도 평점 알려줘", "rating"),
        ("영화 추천", "오늘 볼 영화 추천해줘", "recommendation"),
        ("영화 정보", "폐쇄된 우주선 배경 영화 추천해줘", "recommendation"),
        ("영화 정보", "아내와 가볍게 볼 수 있는 한국 영화를 찾고 있어요", "recommendation"),
        ("영화 정보", "퇴근 후 힐링", "recommendation"),
        ("영화 평점 및 리뷰", "영화 '헤어질 결심'의 해외 평론가 반응이랑 관람평 모아줘", "review_summary"),
        ("영화 평점 및 리뷰", "기생충 IMDb 평점이랑 왓챠피디아 평균 점수 몇 점이야?", "rating"),
        ("영화 평점", "평점 9.0 이상 되는 SF 명작 영화 몇 개 뽑아줘", "recommendation"),
        ("영화 평점 및 리뷰", "마동석 나오는 최신 영화 뭐 있어? 그거 볼만해?", "recommendation"),
        ("영화 평점 및 리뷰", "기생충이랑 올드보이 중에 평가 더 좋은 영화가 뭐야?", "rating"),
    ],
)
async def test_router_domain_mapping(domain: str, question: str, expected: str):
    assert _intent_from_router_domain(domain, question) == expected


async def test_clova_router_uses_official_response_shape(monkeypatch):
    settings = Settings(
        chat_mock_mode=False,
        clova_studio_api_key="test-key",
        clova_studio_router_id="test-router",
    )
    monkeypatch.setattr("app.agents.graph.get_settings", lambda: settings)

    async def mock_route(self, query: str, chat_history=None):
        assert chat_history == [{"role": "user", "content": "앞 질문"}]
        return {
            "domain": {"result": "영화 리뷰", "called": True},
            "blockedContent": {"result": [], "called": False},
            "safety": {"result": [], "called": False},
        }

    monkeypatch.setattr("app.clients.clova_client.ClovaStudioClient.route", mock_route)
    result = await classify_intent(
        {
            "question": "실미도 사람들 반응 어때?",
            "chat_history": [{"role": "user", "content": "앞 질문"}],
        }
    )
    assert result == {
        "intent": "review_summary",
        "router_domain": "영화 리뷰",
        "intent_source": "clova_router",
    }


async def test_explicit_recommendation_overrides_router_movie_info(monkeypatch):
    settings = Settings(
        chat_mock_mode=False,
        clova_studio_api_key="test-key",
        clova_studio_router_id="test-router",
    )
    monkeypatch.setattr("app.agents.graph.get_settings", lambda: settings)

    async def mock_route(self, query: str, chat_history=None):
        return {
            "domain": {"result": "영화 정보", "called": True},
            "blockedContent": {"result": [], "called": False},
            "safety": {"result": [], "called": False},
        }

    monkeypatch.setattr("app.clients.clova_client.ClovaStudioClient.route", mock_route)
    result = await classify_intent({"question": "SF 스릴러 영화 추천해줘"})

    assert result["intent"] == "recommendation"
    assert result["router_domain"] == "영화 정보"


async def test_discovery_language_overrides_router_movie_info(monkeypatch):
    settings = Settings(
        chat_mock_mode=False,
        clova_studio_api_key="test-key",
        clova_studio_router_id="test-router",
    )
    monkeypatch.setattr("app.agents.graph.get_settings", lambda: settings)

    async def mock_route(self, query: str, chat_history=None):
        return {
            "domain": {"result": "영화 정보", "called": True},
            "blockedContent": {"result": [], "called": False},
            "safety": {"result": [], "called": False},
        }

    monkeypatch.setattr("app.clients.clova_client.ClovaStudioClient.route", mock_route)
    result = await classify_intent(
        {"question": "아내와 가볍게 볼 수 있는 한국 영화를 찾고 있어요"}
    )

    assert result["intent"] == "recommendation"
    assert result["router_domain"] == "영화 정보"


async def test_router_filter_blocks_processing(monkeypatch):
    settings = Settings(
        chat_mock_mode=False,
        clova_studio_api_key="test-key",
        clova_studio_router_id="test-router",
    )
    monkeypatch.setattr("app.agents.graph.get_settings", lambda: settings)

    async def mock_route(self, query: str, chat_history=None):
        return {
            "domain": {"result": "영화 정보", "called": True},
            "blockedContent": {"result": ["차단 규칙"], "called": True},
            "safety": {"result": [], "called": False},
        }

    monkeypatch.setattr("app.clients.clova_client.ClovaStudioClient.route", mock_route)
    result = await classify_intent({"question": "차단 대상 질문"})
    assert result["intent"] == "fallback"
    assert result["error"]


async def test_resolve_movie_finds_title_inside_complex_question(monkeypatch):
    movie = {"id": 10, "title": "터널"}

    async def no_direct_match(title: str):
        assert title == "하정우 나오는 터널"
        return None

    async def mentioned_match(question: str):
        assert question == "하정우 나오는 터널 평점 알려줘"
        return movie

    monkeypatch.setattr("app.agents.graph.movie_repository.find_by_title", no_direct_match)
    monkeypatch.setattr(
        "app.agents.graph.movie_repository.find_mentioned_in_question",
        mentioned_match,
    )
    result = await resolve_movie({"question": "하정우 나오는 터널 평점 알려줘"})
    assert result["movie"] == movie
    assert result["movie_query"] == "터널"


async def test_resolve_movie_reuses_previous_movie_for_follow_up(monkeypatch):
    movie = {"id": 10, "title": "터널"}

    async def no_match(_: str):
        return None

    async def by_id(movie_id: int):
        assert movie_id == 10
        return movie

    monkeypatch.setattr("app.agents.graph.movie_repository.find_by_title", no_match)
    monkeypatch.setattr("app.agents.graph.movie_repository.find_mentioned_in_question", no_match)
    monkeypatch.setattr("app.agents.graph.movie_repository.find_by_id", by_id)
    result = await resolve_movie(
        {"question": "그 영화 평점은?", "previous_movie_id": 10}
    )
    assert result["movie"] == movie


async def test_fallback_query_plan_extracts_recommendation_filters():
    plan = _fallback_query_plan(
        {
            "question": "비 오는 날 보기 좋은 한국 스릴러 영화 3편 추천해줘",
            "intent": "recommendation",
            "exclude_spoilers": True,
        }
    )
    assert plan.intent == "recommendation"
    assert plan.genres == ["스릴러"]
    assert plan.countries == ["한국"]
    assert plan.limit == 3
    assert plan.requires_vector_search is True


async def test_fallback_query_plan_extracts_runtime_and_avoidance_filters():
    plan = _fallback_query_plan(
        {
            "question": (
                "아내와 가볍게 볼 수 있는 한국 영화를 찾고 있어요. "
                "2시간 안쪽이고, 잔인한 장면은 없으면 좋겠어요."
            ),
            "intent": "recommendation",
        }
    )

    assert plan.countries == ["한국"]
    assert plan.max_runtime_minutes == 120
    assert "잔인" in plan.avoid_keywords
    assert "폭력" in plan.avoid_keywords


async def test_fallback_query_plan_normalizes_sources_rating_and_actor():
    rating_plan = _fallback_query_plan(
        {
            "question": "기생충 IMDb 평점이랑 왓챠피디아 평균 점수 몇 점이야?",
            "intent": "rating",
        }
    )
    actor_plan = _fallback_query_plan(
        {
            "question": "마동석 나오는 최신 영화 뭐 있어?",
            "intent": "recommendation",
        }
    )

    assert rating_plan.rating_sources == ["imdb", "watchapedia"]
    assert rating_plan.review_sources == []
    assert actor_plan.actors == ["마동석"]
    assert actor_plan.sort_by == "latest"


async def test_llm_query_plan_keeps_deterministic_explicit_constraints(monkeypatch):
    settings = Settings(chat_mock_mode=False, clova_studio_api_key="test-key")
    monkeypatch.setattr("app.agents.graph.get_settings", lambda: settings)

    async def mock_analyze(self, *args, **kwargs):
        return QueryPlan(intent="recommendation", moods=["가볍게"])

    monkeypatch.setattr(
        "app.agents.graph.ClovaStudioClient.analyze_query",
        mock_analyze,
    )
    result = await analyze_query(
        {
            "question": (
                "아내와 가볍게 볼 수 있는 한국 영화를 찾고 있어요. "
                "2시간 안쪽이고, 잔인한 장면은 없으면 좋겠어요."
            ),
            "intent": "recommendation",
        }
    )
    plan = QueryPlan.model_validate(result["query_plan"])

    assert plan.countries == ["한국"]
    assert plan.max_runtime_minutes == 120
    assert "잔인" in plan.avoid_keywords
    assert "살인" in plan.avoid_keywords


async def test_full_graph_handles_discovery_recommendation_without_title_fallback(monkeypatch):
    settings = Settings(chat_mock_mode=True, clova_studio_api_key="")
    monkeypatch.setattr("app.agents.graph.get_settings", lambda: settings)
    captured: dict = {}

    async def mock_recommend_movies(**kwargs):
        captured.update(kwargs)
        return [
            {
                "id": 101,
                "title": "가벼운 하루",
                "production_year": 2025,
                "production_countries": ["한국"],
                "runtime_minutes": 98,
                "age_rating": "12세이상관람가",
                "genres": ["코미디"],
                "synopsis": "부부가 함께 보내는 평범한 하루를 그린 이야기",
                "popcorn_category": [],
                "average_score": 0,
                "rating_count": 0,
                "distance": None,
            }
        ]

    monkeypatch.setattr(
        "app.agents.graph.movie_repository.recommend_movies",
        mock_recommend_movies,
    )
    result = await movie_agent.ainvoke(
        {
            "question": (
                "아내와 가볍게 볼 수 있는 한국 영화를 찾고 있어요. "
                "2시간 안쪽이고, 잔인한 장면은 없으면 좋겠어요."
            ),
            "exclude_spoilers": True,
            "chat_history": [],
            "sources": [],
            "retrieved_reviews": [],
            "review_feedback": "",
            "retry_count": 0,
            "review_history": [],
            "trace": [],
        }
    )

    assert result["intent"] == "recommendation"
    assert result["finalization_reason"] == "review_passed"
    assert "가벼운 하루" in result["answer"]
    assert captured["countries"] == ["한국"]
    assert captured["max_runtime_minutes"] == 120
    assert "잔인" in captured["avoid_keywords"]


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("2시간 안쪽 영화", 120),
        ("1.5시간 이내 영화", 90),
        ("100분 이하 영화", 100),
        ("상영시간은 상관없어", 0),
    ],
)
async def test_extract_max_runtime_minutes(question: str, expected: int):
    assert _extract_max_runtime_minutes(question) == expected


async def test_fallback_query_plan_detects_youtube_review_link_request():
    plan = _fallback_query_plan(
        {
            "question": "실미도 유튜브 리뷰 링크 3개 줘",
            "intent": "movie_info",
        }
    )
    assert plan.movie_title == "실미도"
    assert plan.resource_type == "youtube_review_links"
    assert plan.limit == 3


async def test_youtube_resource_routes_to_dedicated_retrieval_node():
    plan = QueryPlan(intent="movie_info", resource_type="youtube_review_links")
    assert route_by_intent({"query_plan": plan.model_dump()}) == NODE_05_RETRIEVE_YOUTUBE_REVIEW_LINKS


async def test_retrieve_youtube_review_links_normalizes_sources(monkeypatch):
    async def mock_search(self, movie_title: str, *, limit: int | None = None):
        assert movie_title == "실미도"
        assert limit == 3
        return [
            YouTubeVideo(
                video_id="abc123",
                video_url="https://www.youtube.com/watch?v=abc123",
                title="실미도 리뷰",
                channel_name="영화 채널",
                view_count=100,
            )
        ]

    monkeypatch.setattr(
        "app.agents.graph.YouTubeClient.search_movie_review_links",
        mock_search,
    )
    result = await retrieve_youtube_review_links(
        {
            "movie": {"id": 10, "title": "실미도"},
            "query_plan": QueryPlan(
                intent="movie_info",
                resource_type="youtube_review_links",
                limit=3,
            ).model_dump(),
        }
    )
    assert result["youtube_videos"][0]["video_id"] == "abc123"
    assert result["sources"][-1] == {
        "type": "youtube_video",
        "movie_id": 10,
        "video_id": "abc123",
        "url": "https://www.youtube.com/watch?v=abc123",
    }


async def test_query_plan_normalizes_country_aliases():
    plan = QueryPlan(intent="recommendation", countries=["한국", "south korea"])
    normalized = _normalize_query_plan(plan)
    assert normalized.countries == ["한국"]


async def test_query_plan_normalizes_catalog_genre_aliases_and_year_bounds():
    plan = QueryPlan(
        intent="recommendation",
        genres=["로맨스", "Science Fiction"],
    )
    normalized = _normalize_query_plan(plan)

    assert normalized.genres == ["멜로/로맨스", "SF"]
    assert normalized.release_year_from == 2020
    assert normalized.release_year_to == 2026


async def test_naver_rating_source_queries_only_collected_naver_data(monkeypatch):
    async def mock_query(movie_id: int, *, source_system: str | None):
        assert movie_id == 1618
        assert source_system == "naver_movie"
        return {"average_score": None, "rating_count": 0, "source_system": source_system}

    monkeypatch.setattr(
        "app.agents.graph.movie_repository.get_rating_stats",
        mock_query,
    )
    result = await query_rating(
        {
            "question": "범죄도시 4 네이버 평점 알려줘",
            "movie": {"id": 1618, "title": "범죄도시4"},
            "query_plan": QueryPlan(
                intent="rating",
                movie_title="범죄도시 4",
                rating_sources=["naver"],
            ).model_dump(),
        }
    )

    assert result["rating_stats"] == {
        "average_score": None,
        "rating_count": 0,
        "source_system": "naver_movie",
    }
    assert result["source_data_status"]["source"] == "naver"
    assert result["source_data_status"]["available"] is False


async def test_external_review_source_is_not_replaced_with_internal_reviews(monkeypatch):
    async def must_not_query(**_: object):
        raise AssertionError("외부 리뷰 요청에 내부 리뷰를 조회하면 안 됩니다")

    monkeypatch.setattr(
        "app.agents.graph.movie_repository.search_reviews",
        must_not_query,
    )
    result = await retrieve_reviews(
        {
            "question": "헤어질 결심 해외 평론가 반응 알려줘",
            "movie": {"id": 1, "title": "헤어질 결심"},
            "query_plan": QueryPlan(
                intent="review_summary",
                movie_title="헤어질 결심",
                review_sources=["overseas_critics"],
            ).model_dump(),
        }
    )

    assert result["retrieved_reviews"] == []
    assert result["review_search_mode"] == "unsupported_external_source"


async def test_release_schedule_routes_and_queries_catalog(monkeypatch):
    plan = _fallback_query_plan(
        {
            "question": "이번 주 극장에서 개봉하는 신작 영화 목록이랑 시놉시스 보여줘",
            "intent": "movie_info",
        }
    )
    assert plan.resource_type == "release_schedule"
    assert route_by_intent({"query_plan": plan.model_dump()}) == NODE_05_RETRIEVE_RELEASE_SCHEDULE

    async def mock_list_releases(**kwargs):
        assert kwargs["release_date_from"] <= kwargs["release_date_to"]
        assert kwargs["limit"] == 5
        return [{"id": 7, "title": "신작", "release_date": kwargs["release_date_from"]}]

    monkeypatch.setattr(
        "app.agents.graph.movie_repository.list_releases",
        mock_list_releases,
    )
    result = await retrieve_release_schedule({"query_plan": plan.model_dump()})
    assert result["release_movies"][0]["title"] == "신작"


async def test_full_graph_handles_release_schedule_without_title_resolution(monkeypatch):
    monkeypatch.setattr(
        "app.agents.graph.get_settings",
        lambda: Settings(chat_mock_mode=True, clova_studio_api_key=""),
    )

    async def mock_list_releases(**kwargs):
        return [
            {
                "id": 7,
                "title": "이번 주 신작",
                "release_date": kwargs["release_date_from"],
                "synopsis": "새로운 이야기",
            }
        ]

    monkeypatch.setattr(
        "app.agents.graph.movie_repository.list_releases",
        mock_list_releases,
    )
    result = await movie_agent.ainvoke(
        {
            "question": "이번 주 극장에서 개봉하는 신작 영화 목록이랑 시놉시스 보여줘",
            "exclude_spoilers": True,
            "chat_history": [],
            "sources": [],
            "retrieved_reviews": [],
            "review_feedback": "",
            "retry_count": 0,
            "review_history": [],
            "trace": [],
        }
    )

    assert result["finalization_reason"] == "review_passed"
    assert "이번 주 신작" in result["answer"]
    assert not any(trace["node"] == "step_04_resolve_movie" for trace in result["trace"])


async def test_full_graph_reports_missing_collected_naver_rating_without_fallback(monkeypatch):
    monkeypatch.setattr(
        "app.agents.graph.get_settings",
        lambda: Settings(chat_mock_mode=True, clova_studio_api_key=""),
    )

    async def find_by_title(_: str):
        return {"id": 1618, "title": "범죄도시4"}

    async def naver_has_no_data(movie_id: int, *, source_system: str | None):
        assert movie_id == 1618
        assert source_system == "naver_movie"
        return {"average_score": None, "rating_count": 0, "source_system": source_system}

    monkeypatch.setattr("app.agents.graph.movie_repository.find_by_title", find_by_title)
    monkeypatch.setattr("app.agents.graph.movie_repository.get_rating_stats", naver_has_no_data)
    result = await movie_agent.ainvoke(
        {
            "question": "범죄도시 4 현재 네이버 관람객 평점 수치만 알려줘",
            "exclude_spoilers": True,
            "chat_history": [],
            "sources": [],
            "retrieved_reviews": [],
            "review_feedback": "",
            "retry_count": 0,
            "review_history": [],
            "trace": [],
        }
    )

    assert result["finalization_reason"] == "review_passed"
    assert "네이버" in result["answer"]
    assert "수집된" in result["answer"]
    assert "데이터가 없습니다" in result["answer"]
    assert result["generator_source"] == "deterministic_source_data"


async def test_full_graph_returns_collected_naver_rating_when_available(monkeypatch):
    monkeypatch.setattr(
        "app.agents.graph.get_settings",
        lambda: Settings(chat_mock_mode=True, clova_studio_api_key=""),
    )

    async def find_by_title(_: str):
        return {"id": 1003, "title": "헤레틱"}

    async def naver_has_data(movie_id: int, *, source_system: str | None):
        assert movie_id == 1003
        assert source_system == "naver_movie"
        return {"average_score": 3.8, "rating_count": 299, "source_system": source_system}

    monkeypatch.setattr("app.agents.graph.movie_repository.find_by_title", find_by_title)
    monkeypatch.setattr("app.agents.graph.movie_repository.get_rating_stats", naver_has_data)
    result = await movie_agent.ainvoke(
        {
            "question": "헤레틱 네이버 관람객 평점 알려줘",
            "exclude_spoilers": True,
            "chat_history": [],
            "sources": [],
            "retrieved_reviews": [],
            "review_feedback": "",
            "retry_count": 0,
            "review_history": [],
            "trace": [],
        }
    )

    assert result["finalization_reason"] == "review_passed"
    assert "3.8/5점" in result["answer"]
    assert "299건" in result["answer"]
    assert "실시간" in result["answer"]
    assert result["generator_source"] == "deterministic_source_data"


@pytest.mark.parametrize(
    ("question", "with_reviews"),
    [
        ("헤레틱 네이버 관람평을 스포일러 없이 요약해줘", True),
        ("범죄도시4 네이버 관람평을 스포일러 없이 요약해줘", False),
    ],
)
async def test_full_graph_handles_collected_naver_reviews_deterministically(
    monkeypatch,
    question: str,
    with_reviews: bool,
):
    monkeypatch.setattr(
        "app.agents.graph.get_settings",
        lambda: Settings(chat_mock_mode=True, clova_studio_api_key=""),
    )

    async def find_by_title(_: str):
        return {"id": 1003 if with_reviews else 1618, "title": "헤레틱" if with_reviews else "범죄도시4"}

    async def search_reviews(**kwargs):
        assert kwargs["source_system"] == "naver_movie"
        if not with_reviews:
            return []
        return [
            {
                "review_id": uuid4(),
                "content": "배우들의 연기와 긴장감 있는 전개가 인상적이었습니다.",
                "rating": 4.5,
                "contains_spoiler": False,
            },
            {
                "review_id": uuid4(),
                "content": "후반부 전개는 다소 아쉬웠지만 생각할 거리를 줍니다.",
                "rating": 3.0,
                "contains_spoiler": False,
            },
        ]

    async def rating_stats(movie_id: int, *, source_system: str | None):
        return {
            "average_score": 3.8 if with_reviews else None,
            "rating_count": 2 if with_reviews else 0,
            "source_system": source_system,
        }

    monkeypatch.setattr("app.agents.graph.movie_repository.find_by_title", find_by_title)
    monkeypatch.setattr("app.agents.graph.movie_repository.search_reviews", search_reviews)
    monkeypatch.setattr("app.agents.graph.movie_repository.get_rating_stats", rating_stats)
    result = await movie_agent.ainvoke(
        {
            "question": question,
            "exclude_spoilers": True,
            "chat_history": [],
            "sources": [],
            "retrieved_reviews": [],
            "review_feedback": "",
            "retry_count": 0,
            "review_history": [],
            "trace": [],
        }
    )

    assert result["finalization_reason"] == "review_passed"
    assert result["generator_source"] == "deterministic_source_data"
    assert result["retry_count"] == 0
    if with_reviews:
        assert "대표 의견" in result["answer"]
        assert "배우들의 연기" in result["answer"]
        assert all(isinstance(source.get("review_id"), str) for source in result["sources"] if source["type"] == "review")
    else:
        assert "관람평 데이터가 없습니다" in result["answer"]


async def test_full_graph_combines_collected_naver_rating_and_reviews(monkeypatch):
    monkeypatch.setattr(
        "app.agents.graph.get_settings",
        lambda: Settings(chat_mock_mode=True, clova_studio_api_key=""),
    )

    async def find_by_title(_: str):
        return {"id": 1003, "title": "헤레틱"}

    async def rating(movie_id: int, *, source_system: str | None):
        assert movie_id == 1003
        assert source_system == "naver_movie"
        return {"average_score": 3.82, "rating_count": 299, "source_system": source_system}

    async def reviews(**kwargs):
        assert kwargs["source_system"] == "naver_movie"
        return [{"review_id": uuid4(), "content": "종교적 소재를 흥미롭게 풀었습니다.", "rating": 4.0, "contains_spoiler": False}]

    monkeypatch.setattr("app.agents.graph.movie_repository.find_by_title", find_by_title)
    monkeypatch.setattr("app.agents.graph.movie_repository.get_rating_stats", rating)
    monkeypatch.setattr("app.agents.graph.movie_repository.search_reviews", reviews)
    result = await movie_agent.ainvoke(
        {
            "question": "헤레틱 네이버 평점과 관람평을 스포일러 없이 같이 알려줘",
            "exclude_spoilers": True,
            "chat_history": [],
            "sources": [],
            "retrieved_reviews": [],
            "review_feedback": "",
            "retry_count": 0,
            "review_history": [],
            "trace": [],
        }
    )

    assert result["finalization_reason"] == "review_passed"
    assert "3.82/5점" in result["answer"]
    assert "299건" in result["answer"]
    assert "종교적 소재" in result["answer"]


async def test_full_graph_returns_youtube_review_links(monkeypatch):
    monkeypatch.setattr(
        "app.agents.graph.get_settings",
        lambda: Settings(chat_mock_mode=True, clova_studio_api_key="", youtube_api_key="test-key"),
    )

    async def find_by_title(_: str):
        return {"id": 1003, "title": "헤레틱"}

    async def search(self, movie_title: str, *, limit: int | None = None):
        assert movie_title == "헤레틱"
        assert limit == 3
        return [
            YouTubeVideo(
                video_id=f"video{index}",
                video_url=f"https://www.youtube.com/watch?v=video{index}",
                title=f"헤레틱 리뷰 {index}",
                channel_name="영화 리뷰 채널",
                view_count=1000 * index,
            )
            for index in range(1, 4)
        ]

    monkeypatch.setattr("app.agents.graph.movie_repository.find_by_title", find_by_title)
    monkeypatch.setattr("app.agents.graph.YouTubeClient.search_movie_review_links", search)
    result = await movie_agent.ainvoke(
        {
            "question": "헤레틱 유튜브 리뷰 링크 3개 추천해줘",
            "exclude_spoilers": True,
            "chat_history": [],
            "sources": [],
            "retrieved_reviews": [],
            "review_feedback": "",
            "retry_count": 0,
            "review_history": [],
            "trace": [],
        }
    )

    assert result["finalization_reason"] == "review_passed"
    assert result["answer"].count("https://www.youtube.com/watch?v=") == 3
    assert len([source for source in result["sources"] if source["type"] == "youtube_video"]) == 3


async def test_recommendation_query_plan_always_requires_vector_search():
    plan = QueryPlan(intent="recommendation", requires_vector_search=False, countries=[""])

    normalized = _normalize_query_plan(plan)

    assert normalized.requires_vector_search is True
    assert normalized.countries == []


async def test_recommendations_apply_authenticated_user_movie_categories(monkeypatch):
    captured: dict[str, object] = {}

    async def mock_recommend(**kwargs):
        captured.update(kwargs)
        return [
            {
                "id": 7,
                "title": "취향 영화",
                "production_year": 2025,
            }
        ]

    monkeypatch.setattr(
        "app.agents.graph.get_settings",
        lambda: Settings(chat_mock_mode=True, clova_studio_api_key=""),
    )
    monkeypatch.setattr(
        "app.agents.graph.movie_repository.recommend_movies",
        mock_recommend,
    )
    result = await recommend_movies(
        {
            "question": "내 취향에 맞는 영화 추천해줘",
            "query_plan": QueryPlan(intent="recommendation").model_dump(),
            "user_preferences": {
                "movie_category_ids": [3, 7],
                "movie_categories": [
                    {"id": 3, "name": "가족과 함께"},
                    {"id": 7, "name": "기분 전환"},
                ],
            },
        }
    )

    assert "preferred_movie_category_ids" not in captured
    assert result["personalization_applied"] is True
    assert result["recommendations"][0]["matched_constraints"]["personalized_preferences"] == [
        "가족과 함께",
        "기분 전환",
    ]


async def test_recommendation_embedding_includes_authenticated_user_preferences(monkeypatch):
    captured: dict[str, object] = {}

    async def mock_embed(self, text: str):
        captured["embedding_text"] = text
        return [0.1, 0.2]

    async def mock_recommend(**kwargs):
        captured.update(kwargs)
        return [{"id": 11, "title": "파묘", "production_year": 2024}]

    monkeypatch.setattr(
        "app.agents.graph.get_settings",
        lambda: Settings(chat_mock_mode=False, clova_studio_api_key="test-key"),
    )
    monkeypatch.setattr(
        "app.agents.graph.ClovaStudioClient.embed",
        mock_embed,
    )
    monkeypatch.setattr(
        "app.agents.graph.movie_repository.recommend_movies",
        mock_recommend,
    )

    result = await recommend_movies(
        {
            "question": "영화 추천해줘",
            "query_plan": QueryPlan(
                intent="recommendation",
                requires_vector_search=True,
            ).model_dump(),
            "user_preferences": {
                "movie_category_ids": [11],
                "movie_categories": [
                    {
                        "id": 11,
                        "code": "OCCULT",
                        "name": "오컬트",
                        "aliases": ["악령", "귀신", "퇴마", "구마", "주술", "무속"],
                    }
                ],
            },
        }
    )

    assert captured["embedding_text"] == (
        "선호하는 영화 유형:\n"
        "- 악령, 귀신, 퇴마, 구마, 주술, 무속"
    )
    assert captured["query_embedding"] == [0.1, 0.2]
    assert result["personalization_applied"] is True


async def test_generic_personalized_recommendation_includes_one_serendipity_movie(
    monkeypatch,
):
    async def mock_embed(self, text: str):
        return [0.1, 0.2]

    async def mock_recommend(**kwargs):
        return [
            {"id": index, "title": f"취향 영화 {index}", "production_year": 2024}
            for index in range(1, 6)
        ]

    captured: dict[str, object] = {}

    async def mock_serendipity(**kwargs):
        captured.update(kwargs)
        return {
            "id": 99,
            "title": "의외의 영화",
            "production_year": 2023,
            "average_score": 4.8,
            "rating_count": 120,
        }

    monkeypatch.setattr(
        "app.agents.graph.get_settings",
        lambda: Settings(chat_mock_mode=False, clova_studio_api_key="test-key"),
    )
    monkeypatch.setattr("app.agents.graph.ClovaStudioClient.embed", mock_embed)
    monkeypatch.setattr(
        "app.agents.graph.movie_repository.recommend_movies", mock_recommend
    )
    monkeypatch.setattr(
        "app.agents.graph.movie_repository.find_serendipity_movie", mock_serendipity
    )

    result = await recommend_movies(
        {
            "question": "영화 추천해줘",
            "query_plan": QueryPlan(
                intent="recommendation",
                requires_vector_search=True,
                release_year_from=2020,
                release_year_to=2026,
                limit=5,
            ).model_dump(),
            "user_preferences": {
                "movie_category_ids": [16],
                "movie_categories": [
                    {
                        "id": 16,
                        "code": "OCCULT",
                        "name": "오컬트",
                        "aliases": ["귀신", "퇴마", "악령"],
                    }
                ],
            },
        }
    )

    assert [movie["id"] for movie in result["recommendations"]] == [1, 2, 3, 4, 99]
    surprise = result["recommendations"][-1]
    assert surprise["recommendation_role"] == "serendipity"
    assert surprise["matched_constraints"]["personalized_preferences"] == []
    assert "리뷰 30건 이상" in surprise["matched_constraints"]["serendipity"]
    assert captured == {
        "preference_embedding": [0.1, 0.2],
        "exclude_movie_ids": [1, 2, 3, 4, 5],
        "min_rating": 4.5,
        "min_review_count": 30,
    }


async def test_generate_answer_uses_chat_completions_prompt(monkeypatch):
    settings = Settings(
        chat_mock_mode=False,
        clova_studio_api_key="test-key",
        clova_studio_chat_model="HCX-007",
    )
    monkeypatch.setattr("app.agents.graph.get_settings", lambda: settings)

    async def mock_generate(
        self,
        query: str,
        context: str,
        system_prompt: str,
        chat_history=None,
    ) -> str:
        assert query == "실미도 평점은 어때?"
        assert "자연스러운 대화체" in system_prompt
        assert '"rating_stats"' in context
        assert "system_instruction" not in context
        assert chat_history == [{"role": "user", "content": "실미도 알려줘"}]
        assert "등록된 평점 수를 명시하세요" in system_prompt
        return "평점은 4점대라 꽤 좋은 편이에요."

    monkeypatch.setattr(
        "app.clients.clova_client.ClovaStudioClient.generate",
        mock_generate,
    )
    result = await generate_answer(
        {
            "question": "실미도 평점은 어때?",
            "intent": "rating",
            "rating_stats": {"average_rating": 4.1, "rating_count": 20},
            "chat_history": [{"role": "user", "content": "실미도 알려줘"}],
            "review_feedback": "등록된 평점 수를 명시하세요.",
        }
    )
    assert result["draft_answer"] == "평점은 4점대라 꽤 좋은 편이에요.\n\n근거: [R1]"


async def test_generate_answer_falls_back_with_fixed_rating_scale(monkeypatch):
    settings = Settings(
        chat_mock_mode=False,
        clova_studio_api_key="test-key",
        clova_studio_chat_model="HCX-007",
    )
    monkeypatch.setattr("app.agents.graph.get_settings", lambda: settings)

    async def mock_generate(self, **kwargs):
        raise RuntimeError("429 Too Many Requests")

    monkeypatch.setattr(
        "app.clients.clova_client.ClovaStudioClient.generate",
        mock_generate,
    )
    result = await generate_answer(
        {
            "question": "연인과 볼 영화 추천해줘",
            "intent": "recommendation",
            "recommendations": [
                {
                    "id": 86,
                    "title": "사랑의 네 가지 온도",
                    "production_year": 2024,
                    "average_score": 4.8,
                    "rating_count": 4,
                },
                {
                    "id": 2987,
                    "title": "리디밍 러브",
                    "production_year": 2022,
                    "average_score": None,
                    "rating_count": 0,
                },
            ],
        }
    )

    assert result["generator_source"] == "clova_fallback_local_rule"
    assert result["generator_model"] is None
    assert "평균 4.8/5점 (리뷰 4건, 표본 적음)" in result["draft_answer"]
    assert "4.8/4" not in result["draft_answer"]
    assert "리디밍 러브" in result["draft_answer"]


async def test_answer_review_retries_intent_classification_with_feedback(monkeypatch):
    settings = Settings(
        chat_mock_mode=False,
        clova_studio_api_key="test-key",
        clova_studio_chat_model="HCX-007",
    )
    monkeypatch.setattr("app.agents.graph.get_settings", lambda: settings)

    async def mock_review(self, **kwargs):
        assert kwargs["query"] == "실미도 평점은 어때?"
        assert kwargs["draft_answer"] == "실미도의 줄거리를 알려드릴게요."
        return AnswerReview(
            scores=AnswerReviewScores(
                intent_alignment=10,
                factual_grounding=30,
                completeness=10,
                spoiler_safety=15,
                clarity=10,
            ),
            failure_types=["intent_mismatch"],
            recommended_retry_stage="classify_intent",
            feedback="평점 질문인데 줄거리로 답했습니다. 질문 의도를 평점으로 다시 분류하세요.",
        )

    monkeypatch.setattr(
        "app.clients.clova_client.ClovaStudioClient.review_answer",
        mock_review,
    )
    state = {
        "question": "실미도 평점은 어때?",
        "draft_answer": "실미도의 줄거리를 알려드릴게요.",
        "sources": [{"type": "movie", "movie_id": 1}],
        "retry_count": 0,
        "exclude_spoilers": True,
    }
    result = await review_draft(state)
    assert result["answer_review"]["total_score"] == 75
    assert result["answer_review"]["passed"] is False
    assert result["retry_allowed"] is True
    assert result["retry_count"] == 1
    assert next_after_review({**state, **result}) == NODE_02_CLASSIFY_INTENT
    assert "평점 질문" in result["review_feedback"]


async def test_answer_review_finalizes_after_retry_limit(monkeypatch):
    settings = Settings(chat_mock_mode=True, chat_review_max_retries=2)
    monkeypatch.setattr("app.agents.graph.get_settings", lambda: settings)
    state = {
        "question": "실미도 평점은 어때?",
        "draft_answer": "",
        "sources": [],
        "retry_count": 2,
        "exclude_spoilers": True,
    }
    result = await review_draft(state)
    assert result["answer_review"]["passed"] is False
    assert result["retry_allowed"] is False
    assert result["retry_count"] == 2
    assert next_after_review({**state, **result}) == NODE_08_FINALIZE_ANSWER


async def test_grounded_review_soft_failure_is_not_fatal(monkeypatch):
    settings = Settings(
        chat_mock_mode=False,
        clova_studio_api_key="test-key",
        chat_review_pass_score=85,
    )
    monkeypatch.setattr("app.agents.graph.get_settings", lambda: settings)

    async def mock_review(self, **kwargs):
        return AnswerReview(
            scores=AnswerReviewScores(
                intent_alignment=25,
                factual_grounding=30,
                completeness=15,
                spoiler_safety=15,
                clarity=10,
            ),
            failure_types=["unsupported_claim"],
            recommended_retry_stage="generate",
            feedback="표현을 더 간결하게 다듬는 것이 좋습니다.",
        )

    monkeypatch.setattr(
        "app.clients.clova_client.ClovaStudioClient.review_answer",
        mock_review,
    )
    state = {
        "question": "오디세이 리뷰 궁금해",
        "intent": "review_summary",
        "movie": {"id": 45, "title": "오디세이"},
        "rating_stats": {"average_score": 3.3, "rating_count": 6},
        "retrieved_reviews": [
            {
                "review_id": uuid4(),
                "content": "몰입감이 좋았습니다.",
                "rating": 5.0,
                "contains_spoiler": False,
            }
        ],
        "draft_answer": "평균 평점은 3.3/5점입니다. [R1] 좋은 반응입니다. [V1]",
        "sources": [{"type": "review", "movie_id": 45}],
        "retry_count": 0,
        "exclude_spoilers": True,
    }

    result = await review_draft(state)

    assert result["evidence_validation"]["passed"] is True
    assert result["answer_review"]["total_score"] == 95
    assert result["answer_review"]["failure_types"] == []
    assert result["answer_review"]["passed"] is True
    assert result["answer_review"]["review_policy"] == (
        "grounded_review_soft_failures_downgraded"
    )
    assert result["answer_review"]["model_failure_types"] == ["unsupported_claim"]
    assert result["retry_allowed"] is False


async def test_grounded_review_insufficient_evidence_misclassification_is_not_fatal(
    monkeypatch,
):
    settings = Settings(
        chat_mock_mode=False,
        clova_studio_api_key="test-key",
        chat_review_pass_score=85,
    )
    monkeypatch.setattr("app.agents.graph.get_settings", lambda: settings)

    async def mock_review(self, **kwargs):
        return AnswerReview(
            scores=AnswerReviewScores(
                intent_alignment=25,
                factual_grounding=30,
                completeness=10,
                spoiler_safety=15,
                clarity=10,
            ),
            failure_types=["insufficient_evidence"],
            recommended_retry_stage="retrieve",
            feedback=(
                "필요한 정보가 충분히 수집되었지만 더 많은 리뷰를 검색하는 것이 좋습니다."
            ),
        )

    monkeypatch.setattr(
        "app.clients.clova_client.ClovaStudioClient.review_answer",
        mock_review,
    )
    state = {
        "question": "오디세이 리뷰 궁금해",
        "intent": "review_summary",
        "movie": {"id": 45, "title": "오디세이"},
        "rating_stats": {"average_score": 4.7, "rating_count": 301},
        "retrieved_reviews": [
            {
                "review_id": uuid4(),
                "content": "시대를 뛰어넘는 명작입니다.",
                "rating": 5.0,
                "contains_spoiler": False,
            }
        ],
        "draft_answer": "평균은 4.7/5점입니다. [R1] 호평이 있습니다. [V1]",
        "sources": [{"type": "review", "movie_id": 45}],
        "retry_count": 0,
        "exclude_spoilers": True,
    }

    result = await review_draft(state)

    assert result["evidence_validation"]["passed"] is True
    assert result["answer_review"]["total_score"] == 90
    assert result["answer_review"]["model_failure_types"] == [
        "insufficient_evidence"
    ]
    assert result["answer_review"]["failure_types"] == []
    assert result["answer_review"]["passed"] is True
    assert result["answer_review"]["review_policy"] == (
        "grounded_review_soft_failures_downgraded"
    )
    assert result["retry_allowed"] is False


async def test_review_average_must_match_database_aggregate():
    state = {
        "intent": "review_summary",
        "rating_stats": {"average_score": 3.3, "rating_count": 6},
        "retrieved_reviews": [
            {"review_id": uuid4(), "content": "좋아요", "rating": 5.0}
        ],
    }

    invalid = _validate_evidence_citations(
        state,
        "Pop Talk 평점: 평균 2.83/5점 [R1] [V1]",
    )
    valid = _validate_evidence_citations(
        state,
        "Pop Talk 평점: 평균 3.3/5점 [R1] [V1]",
    )

    assert invalid["passed"] is False
    assert invalid["invalid_average_ratings"] == [
        {"claimed": 2.83, "expected": 3.3}
    ]
    assert valid["passed"] is True


async def test_grounded_review_retry_reuses_same_evidence():
    state = {
        "intent": "review_summary",
        "retrieved_reviews": [{"review_id": uuid4(), "rating": 5.0}],
        "answer_review": {
            "passed": False,
            "failure_types": ["intent_mismatch"],
            "recommended_retry_stage": "classify_intent",
        },
        "retry_allowed": True,
    }

    assert next_after_review(state) == NODE_06_GENERATE_DRAFT


async def test_finalize_answer_replaces_failed_draft_with_safe_response():
    result = await finalize_answer(
        {
            "draft_answer": "근거 없는 답변입니다.",
            "answer_review": {"passed": False},
        }
    )

    assert result["finalization_reason"] == "review_failed_safe_response"
    assert "정확하게 답변하기 어렵습니다" in result["answer"]
    assert "근거 없는 답변" not in result["answer"]


async def test_finalize_answer_keeps_grounded_reviews_after_retry_limit():
    result = await finalize_answer(
        {
            "intent": "review_summary",
            "movie": {"id": 45, "title": "오디세이"},
            "rating_stats": {"average_score": 3.3, "rating_count": 6},
            "retrieved_reviews": [
                {"review_id": uuid4(), "content": "아쉬웠어요", "rating": 2.0},
                {"review_id": uuid4(), "content": "최고였어요", "rating": 5.0},
            ],
            "answer_review": {"passed": False},
        }
    )

    assert result["finalization_reason"] == "review_failed_grounded_reviews"
    assert "전체 수집 리뷰 6건의 평균은 3.3/5점" in result["answer"]
    assert result["answer"].index("5.0점") < result["answer"].index("2.0점")
    assert "정확하게 답변하기 어렵습니다" not in result["answer"]


async def test_finalize_answer_hides_internal_evidence_ids():
    result = await finalize_answer(
        {
            "draft_answer": "영화 호프의 감독은 나홍진입니다. [M1]\n\n근거: [M1]",
            "answer_review": {"passed": True},
        }
    )

    assert result["answer"] == "영화 호프의 감독은 나홍진입니다."
    assert result["finalization_reason"] == "review_passed"


async def test_finalize_answer_returns_grounded_personalized_recommendations_after_review_failure():
    result = await finalize_answer(
        {
            "intent": "recommendation",
            "personalization_applied": True,
            "recommendations": [
                {"id": 1, "title": "첫 번째 영화", "production_year": 2024},
                {"id": 2, "title": "두 번째 영화", "production_year": None},
            ],
            "answer_review": {
                "passed": False,
                "failure_types": ["unsupported_claim"],
            },
        }
    )

    assert result["finalization_reason"] == "review_failed_grounded_recommendations"
    assert result["answer"] == (
        "저장한 온보딩 취향을 후보 검색에 반영한 추천입니다.\n"
        "1. **첫 번째 영화** (2024)\n"
        "2. **두 번째 영화**"
    )


async def test_strip_internal_evidence_ids_keeps_answer_text():
    answer = "감독은 나홍진이고 [M1], 장르는 SF입니다 [M1].\n\n근거: [M1]"

    assert _strip_internal_evidence_citations(answer) == (
        "감독은 나홍진이고, 장르는 SF입니다."
    )


async def test_evidence_validation_requires_real_citations_and_urls():
    state = {
        "movie": {"id": 1, "title": "실미도", "director": "강우석"},
        "youtube_videos": [
            {
                "video_id": "abc123",
                "video_url": "https://www.youtube.com/watch?v=abc123",
                "title": "실미도 리뷰",
            }
        ],
    }

    uncited = _validate_evidence_citations(state, "실미도는 강우석 감독의 영화입니다.")
    unknown = _validate_evidence_citations(state, "실미도 정보입니다. [X9]")
    valid = _validate_evidence_citations(
        state,
        "실미도 정보입니다. [M1]\nhttps://www.youtube.com/watch?v=abc123 [Y1]",
    )

    assert uncited["failure_types"] == ["unsupported_claim"]
    assert unknown["failure_types"] == ["source_mismatch"]
    assert valid["passed"] is True


async def test_recommendation_rating_evidence_separates_scale_from_review_count():
    units = _evidence_units(
        {
            "recommendations": [
                {
                    "id": 86,
                    "title": "사랑의 네 가지 온도",
                    "average_score": 4.8,
                    "rating_count": 4,
                    "distance": 0.23,
                },
                {
                    "id": 2987,
                    "title": "리디밍 러브",
                    "average_score": 0,
                    "rating_count": 0,
                },
            ]
        }
    )

    first = units[0]["data"]
    assert first["pop_talk_rating"] == {
        "score": 4.8,
        "scale": 5,
        "review_count": 4,
        "sample_notice": "리뷰 표본이 적음",
    }
    assert "average_score" not in first
    assert "rating_count" not in first
    assert "distance" not in first
    assert "pop_talk_rating" not in units[1]["data"]


async def test_evidence_validation_rejects_review_count_as_rating_scale():
    state = {
        "recommendations": [
            {
                "id": 86,
                "title": "사랑의 네 가지 온도",
                "average_score": 4.8,
                "rating_count": 4,
            }
        ]
    }

    invalid = _validate_evidence_citations(
        state,
        "**평점**: 4.8 / 4 (Pop Talk 기준) [C1]",
    )
    valid = _validate_evidence_citations(
        state,
        "**평점**: 평균 4.8/5점 (리뷰 4건, 표본 적음) [C1]",
    )

    assert invalid["passed"] is False
    assert invalid["failure_types"] == ["unsupported_claim"]
    assert invalid["invalid_rating_scales"] == [{"score": 4.8, "scale": 4.0}]
    assert valid["passed"] is True


async def test_missing_citations_are_repaired_with_known_evidence_only():
    state = {"movie": {"id": 64, "title": "호프", "genres": ["드라마"]}}

    repaired = _repair_missing_evidence_citations(
        state,
        "**호프**는 드라마 영화입니다.",
    )
    existing = _repair_missing_evidence_citations(state, "호프 정보입니다. [M1]")
    no_data = _repair_missing_evidence_citations({}, "검색 결과가 없습니다.")

    assert repaired.endswith("근거: [M1]")
    assert existing == "호프 정보입니다. [M1]"
    assert no_data == "검색 결과가 없습니다."


async def test_movie_info_does_not_require_optional_plot_metadata():
    review = AnswerReview(
        scores=AnswerReviewScores(
            intent_alignment=25,
            factual_grounding=30,
            completeness=15,
            spoiler_safety=15,
            clarity=10,
        ),
        failure_types=["insufficient_evidence"],
        recommended_retry_stage="retrieve",
        feedback="줄거리가 없어 근거가 부족합니다.",
    )

    normalized = _normalize_review_for_available_movie_metadata(
        {
            "intent": "movie_info",
            "movie": {
                "id": 64,
                "title": "호프",
                "director": ["나홍진"],
                "actors": ["황정민"],
                "genres": ["스릴러"],
                "synopsis": None,
            },
        },
        review,
    )

    assert normalized.failure_types == []
    assert normalized.recommended_retry_stage == "generate"
    assert "추가 생성이나 검색을 요구하지 않습니다" in normalized.feedback
    assert "줄거리 부재" in normalized.feedback


async def test_movie_evidence_preserves_unmatched_kmdb_state():
    units = _evidence_units(
        {
            "movie": {
                "id": 64,
                "title": "호프",
                "kmdb_matched": False,
                "director": ["나홍진"],
                "synopsis": None,
            }
        }
    )

    assert units[0]["data"]["kmdb_matched"] is False
    assert "synopsis" not in units[0]["data"]


async def test_review_search_uses_query_plan_keywords_without_embeddings(monkeypatch):
    async def mock_search(**kwargs):
        assert kwargs == {
            "movie_id": 1,
            "exclude_spoilers": True,
            "keywords": ["연기"],
            "limit": 6,
            "source_system": None,
        }
        return []

    async def mock_rating_stats(*args, **kwargs):
        return {"average_score": None, "rating_count": 0, "source_system": None}

    monkeypatch.setattr(
        "app.agents.graph.movie_repository.search_reviews",
        mock_search,
    )
    monkeypatch.setattr(
        "app.agents.graph.movie_repository.get_rating_stats",
        mock_rating_stats,
    )

    result = await retrieve_reviews(
        {
            "question": "실미도 반응은 어때?",
            "movie": {"id": 1, "title": "실미도"},
            "exclude_spoilers": True,
            "query_plan": QueryPlan(
                intent="review_summary",
                keywords=["연기"],
            ).model_dump(),
        }
    )
    assert result["review_search_mode"] == "representative_sql"


async def test_retrieved_reviews_are_sorted_by_rating_descending(monkeypatch):
    async def mock_search(**kwargs):
        return [
            {"review_id": uuid4(), "content": "보통", "rating": 3.5},
            {"review_id": uuid4(), "content": "최고", "rating": 5.0},
            {"review_id": uuid4(), "content": "점수 없음", "rating": None},
            {"review_id": uuid4(), "content": "좋음", "rating": 4.5},
            {"review_id": uuid4(), "content": "아쉬움", "rating": 2.0},
        ]

    async def mock_rating_stats(*args, **kwargs):
        return {"average_score": 3.8, "rating_count": 5, "source_system": None}

    monkeypatch.setattr(
        "app.agents.graph.movie_repository.search_reviews",
        mock_search,
    )
    monkeypatch.setattr(
        "app.agents.graph.movie_repository.get_rating_stats",
        mock_rating_stats,
    )
    result = await retrieve_reviews(
        {
            "question": "오디세이 리뷰 궁금해",
            "movie": {"id": 1, "title": "오디세이"},
            "exclude_spoilers": True,
            "query_plan": QueryPlan(intent="review_summary").model_dump(),
        }
    )

    assert [review["rating"] for review in result["retrieved_reviews"]] == [
        5.0,
        4.5,
        3.5,
        2.0,
        None,
    ]


async def test_traced_node_records_timing_and_safe_details():
    async def node(_: dict) -> dict:
        return {
            "intent": "rating",
            "router_domain": "영화 평점",
            "intent_source": "clova_router",
        }

    result = await _with_trace(NODE_02_CLASSIFY_INTENT, node)({"question": "실미도 평점"})
    assert result["intent"] == "rating"
    assert result["trace"][0]["node"] == NODE_02_CLASSIFY_INTENT
    assert result["trace"][0]["status"] == "completed"
    assert result["trace"][0]["elapsed_ms"] >= 0
    assert result["trace"][0]["details"] == {
        "intent": "rating",
        "router_domain": "영화 평점",
        "classification": "clova_router",
    }


async def test_generate_trace_exposes_draft_only_outside_production(monkeypatch):
    async def node(_: dict) -> dict:
        return {
            "draft_answer": "호프는 드라마 영화입니다. [M1]",
            "generator_source": "chat_completions",
            "generator_model": "HCX-007",
        }

    monkeypatch.setattr(
        "app.agents.graph.get_settings",
        lambda: Settings(app_env="development", chat_mock_mode=False),
    )
    development = await _with_trace(NODE_06_GENERATE_DRAFT, node)({})
    assert development["trace"][0]["details"]["draft_answer"] == (
        "호프는 드라마 영화입니다. [M1]"
    )

    monkeypatch.setattr(
        "app.agents.graph.get_settings",
        lambda: Settings(app_env="production", chat_mock_mode=False),
    )
    production = await _with_trace(NODE_06_GENERATE_DRAFT, node)({})
    assert "draft_answer" not in production["trace"][0]["details"]
