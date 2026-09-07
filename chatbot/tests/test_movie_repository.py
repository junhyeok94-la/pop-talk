import pytest

from app.repositories import movie_repository as repository_module
from app.repositories.movie_repository import MovieRepository


class CapturingPool:
    def __init__(self) -> None:
        self.queries: list[str] = []
        self.query_args: list[tuple] = []

    async def fetchrow(self, query: str, *args):
        self.queries.append(query)
        self.query_args.append(args)
        return {"average_score": 4.2, "rating_count": 7}

    async def fetch(self, query: str, *args):
        self.queries.append(query)
        self.query_args.append(args)
        return []


@pytest.mark.asyncio
async def test_title_lookup_uses_normalized_exact_match_not_substring(monkeypatch) -> None:
    pool = CapturingPool()

    async def fake_get_pool():
        return pool

    monkeypatch.setattr(repository_module, "get_pool", fake_get_pool)
    await MovieRepository().find_by_title("기생충")

    query = pool.queries[0]
    assert "regexp_replace(lower(title_ko)" in query
    assert " =" in query
    assert "ILIKE" not in query
    assert pool.query_args[0] == ("기생충",)


@pytest.mark.asyncio
async def test_rating_stats_aggregate_active_non_deleted_reviews(monkeypatch) -> None:
    pool = CapturingPool()

    async def fake_get_pool():
        return pool

    monkeypatch.setattr(repository_module, "get_pool", fake_get_pool)

    assert await MovieRepository().get_rating_stats(1) == {
        "average_score": 4.2,
        "rating_count": 7,
        "source_system": None,
    }
    assert "FROM reviews" in pool.queries[0]
    assert "AVG(rating)" in pool.queries[0]
    assert "status = 'ACTIVE'" in pool.queries[0]
    assert "deleted_at IS NULL" in pool.queries[0]
    assert "source_system IS NOT DISTINCT FROM $2::text" in pool.queries[0]
    assert pool.query_args[0] == (1, None)
    assert "ratings" not in pool.queries[0]


@pytest.mark.asyncio
async def test_review_selection_uses_keywords_and_rating_bands_without_embeddings(monkeypatch) -> None:
    pool = CapturingPool()

    async def fake_get_pool():
        return pool

    monkeypatch.setattr(repository_module, "get_pool", fake_get_pool)
    await MovieRepository().search_reviews(
        movie_id=1,
        exclude_spoilers=True,
        keywords=["연기", "음악"],
        limit=6,
    )

    query = pool.queries[0]
    assert "unnest($4::text[])" in query
    assert "source_system IS NOT DISTINCT FROM $3::text" in query
    assert "rating_band" in query
    assert "row_number() OVER" in query
    assert "review_embeddings" not in query
    assert "FROM ratings" not in query
    assert pool.query_args[0] == (1, True, None, ["연기", "음악"], 6)


@pytest.mark.asyncio
async def test_naver_rating_and_reviews_are_filtered_to_collected_source(monkeypatch) -> None:
    pool = CapturingPool()

    async def fake_get_pool():
        return pool

    monkeypatch.setattr(repository_module, "get_pool", fake_get_pool)
    await MovieRepository().get_rating_stats(1003, source_system="naver_movie")
    await MovieRepository().search_reviews(
        movie_id=1003,
        exclude_spoilers=True,
        keywords=[],
        limit=6,
        source_system="naver_movie",
    )

    assert pool.query_args[0] == (1003, "naver_movie")
    assert pool.query_args[1] == (1003, True, "naver_movie", [], 6)


@pytest.mark.asyncio
async def test_movie_vector_search_uses_review_ratings_for_sorting(monkeypatch) -> None:
    pool = CapturingPool()

    async def fake_get_pool():
        return pool

    monkeypatch.setattr(repository_module, "get_pool", fake_get_pool)
    await MovieRepository().recommend_movies(
        genres=[],
        actors=[],
        directors=[],
        countries=[],
        keywords=["비 오는 날"],
        avoid_keywords=["잔혹", "폭력"],
        release_year_from=0,
        release_year_to=0,
        max_runtime_minutes=120,
        min_rating=0,
        limit=3,
        query_embedding=[0.1, 0.2],
    )

    query = pool.queries[0]
    assert "::cdb_admin.vector" in query
    assert "OPERATOR(cdb_admin.<=>)" in query
    assert "FROM reviews" in query
    assert "AVG(rating)" in query
    assert "ratings" not in query
    assert pool.query_args[0][4] == []
    assert pool.query_args[0][5] == ["잔혹", "폭력"]
    assert pool.query_args[0][8] == 120
    assert "s.runtime_minutes <= $9" in query
    assert "unnest($6::text[])" in query
    assert "movie_category_links" not in query
    assert "$13::cdb_admin.vector" in query


@pytest.mark.asyncio
async def test_recommendations_do_not_depend_on_unused_category_links(monkeypatch) -> None:
    pool = CapturingPool()

    async def fake_get_pool():
        return pool

    monkeypatch.setattr(repository_module, "get_pool", fake_get_pool)
    await MovieRepository().recommend_movies(
        genres=[],
        actors=[],
        directors=[],
        countries=[],
        keywords=[],
        avoid_keywords=[],
        release_year_from=2020,
        release_year_to=2026,
        max_runtime_minutes=0,
        min_rating=0,
        limit=5,
    )

    assert "movie_category_links" not in pool.queries[0]
    assert "personalization_match_count" not in pool.queries[0]
    assert len(pool.query_args[0]) == 12


@pytest.mark.asyncio
async def test_serendipity_requires_review_quality_and_maximizes_preference_distance(
    monkeypatch,
) -> None:
    pool = CapturingPool()

    async def fake_get_pool():
        return pool

    monkeypatch.setattr(repository_module, "get_pool", fake_get_pool)
    result = await MovieRepository().find_serendipity_movie(
        preference_embedding=[0.1, 0.2],
        exclude_movie_ids=[10, 11],
        min_rating=4.5,
        min_review_count=30,
    )

    assert result is None
    query = pool.queries[0]
    assert "OPERATOR(cdb_admin.<=>)" in query
    assert "r.average_score >= $3" in query
    assert "r.rating_count >= $4" in query
    assert "ORDER BY distance DESC" in query
    assert "status = 'ACTIVE'" in query
    assert "deleted_at IS NULL" in query
    assert pool.query_args[0] == ("[0.1,0.2]", [10, 11], 4.5, 30)
