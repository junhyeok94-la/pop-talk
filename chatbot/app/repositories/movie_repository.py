from __future__ import annotations

from datetime import date
from typing import Any

from app.database import get_pool


MOVIE_SELECT = """
    SELECT
        id,
        kmdb_id,
        kmdb_matched,
        kofic_movie_cd,
        title_ko AS title,
        title_en,
        title_original AS original_title,
        plot AS synopsis,
        directors AS director,
        actors,
        genres,
        production_countries,
        production_year,
        release_date,
        runtime_minutes,
        viewing_grade AS age_rating,
        service_status::text AS service_status,
        COALESCE(
            (
                SELECT jsonb_agg(jsonb_build_object('name', keyword))
                  FROM unnest(source_keywords) keyword
            ),
            '[]'::jsonb
        ) AS popcorn_category,
        is_embedded
    FROM popcorn_movies_service
"""


class MovieRepository:
    async def find_by_id(self, movie_id: int) -> dict[str, Any] | None:
        pool = await get_pool()
        row = await pool.fetchrow(
            MOVIE_SELECT + " WHERE id = $1 AND service_status = 'PUBLISHED'",
            movie_id,
        )
        return dict(row) if row else None

    async def find_by_title(self, title: str) -> dict[str, Any] | None:
        query = (
            MOVIE_SELECT
            + """
            WHERE service_status = 'PUBLISHED'
              AND (
                  regexp_replace(lower(title_ko), '[[:space:][:punct:]]', '', 'g') =
                      regexp_replace(lower($1), '[[:space:][:punct:]]', '', 'g')
                  OR regexp_replace(lower(COALESCE(title_en, '')), '[[:space:][:punct:]]', '', 'g') =
                      regexp_replace(lower($1), '[[:space:][:punct:]]', '', 'g')
                  OR regexp_replace(lower(COALESCE(title_original, '')), '[[:space:][:punct:]]', '', 'g') =
                      regexp_replace(lower($1), '[[:space:][:punct:]]', '', 'g')
              )
            ORDER BY
                (lower(title_ko) = lower($1)) DESC,
                release_date DESC NULLS LAST
            LIMIT 1
            """
        )
        pool = await get_pool()
        row = await pool.fetchrow(query, title)
        return dict(row) if row else None

    async def find_mentioned_in_question(self, question: str) -> dict[str, Any] | None:
        """Find the longest published Korean title explicitly contained in a question."""
        pool = await get_pool()
        row = await pool.fetchrow(
            MOVIE_SELECT
            + """
            WHERE service_status = 'PUBLISHED'
              AND length(trim(title_ko)) >= 2
              AND position(
                  regexp_replace(lower(title_ko), '[[:space:][:punct:]]', '', 'g')
                  in regexp_replace(lower($1), '[[:space:][:punct:]]', '', 'g')
              ) > 0
            ORDER BY length(title_ko) DESC, release_date DESC NULLS LAST
            LIMIT 1
            """,
            question,
        )
        return dict(row) if row else None

    async def list_releases(
        self,
        *,
        release_date_from: date,
        release_date_to: date,
        limit: int,
    ) -> list[dict[str, Any]]:
        pool = await get_pool()
        rows = await pool.fetch(
            MOVIE_SELECT
            + """
            WHERE service_status = 'PUBLISHED'
              AND release_date >= $1
              AND release_date <= $2
            ORDER BY release_date, title_ko
            LIMIT $3
            """,
            release_date_from,
            release_date_to,
            limit,
        )
        return [dict(row) for row in rows]

    async def get_rating_stats(
        self,
        movie_id: int,
        *,
        source_system: str | None = None,
    ) -> dict[str, Any]:
        pool = await get_pool()
        row = await pool.fetchrow(
            """
            SELECT ROUND(AVG(rating), 1) AS average_score, COUNT(*) AS rating_count
              FROM reviews
             WHERE movie_id = $1
               AND source_system IS NOT DISTINCT FROM $2::text
               AND status = 'ACTIVE'
               AND deleted_at IS NULL
            """,
            movie_id,
            source_system,
        )
        assert row is not None
        return {
            "average_score": float(row["average_score"]) if row["average_score"] else None,
            "rating_count": int(row["rating_count"]),
            "source_system": source_system,
        }

    async def search_reviews(
        self,
        movie_id: int,
        exclude_spoilers: bool,
        keywords: list[str],
        limit: int = 10,
        source_system: str | None = None,
    ) -> list[dict[str, Any]]:
        pool = await get_pool()
        rows = await pool.fetch(
            """
            WITH eligible_reviews AS (
                SELECT r.id AS review_id, r.movie_id, r.content, r.rating,
                       r.contains_spoiler, r.created_at,
                       EXISTS (
                           SELECT 1
                             FROM unnest($4::text[]) keyword
                            WHERE r.content ILIKE '%' || keyword || '%'
                       ) AS keyword_match,
                       CASE
                           WHEN r.rating >= 4 THEN 'positive'
                           WHEN r.rating <= 2.5 THEN 'negative'
                           ELSE 'neutral'
                       END AS rating_band
                 FROM reviews r
                 WHERE r.movie_id = $1
                   AND r.source_system IS NOT DISTINCT FROM $3::text
                   AND r.status = 'ACTIVE'
                   AND r.deleted_at IS NULL
                   AND r.content IS NOT NULL
                   AND btrim(r.content) <> ''
                   AND ($2 = FALSE OR r.contains_spoiler = FALSE)
            ), ranked_reviews AS (
                SELECT *,
                       row_number() OVER (
                           PARTITION BY rating_band
                           ORDER BY keyword_match DESC, created_at DESC, review_id DESC
                       ) AS band_rank
                  FROM eligible_reviews
            )
            SELECT review_id, movie_id, content, rating, contains_spoiler, created_at
              FROM ranked_reviews
             ORDER BY
                   CASE WHEN band_rank = 1 THEN 0 ELSE 1 END,
                   keyword_match DESC,
                   created_at DESC,
                   review_id DESC
             LIMIT $5
            """,
            movie_id,
            exclude_spoilers,
            source_system,
            keywords,
            limit,
        )
        return [dict(row) for row in rows]

    async def recommend_movies(
        self,
        *,
        genres: list[str],
        actors: list[str],
        directors: list[str],
        countries: list[str],
        keywords: list[str],
        avoid_keywords: list[str],
        release_year_from: int,
        release_year_to: int,
        max_runtime_minutes: int,
        min_rating: float,
        limit: int,
        sort_by: str = "relevance",
        query_embedding: list[float] | None = None,
        exclude_movie_id: int | None = None,
    ) -> list[dict[str, Any]]:
        """메타데이터 필터와 선택적 vector 유사도를 결합해 추천 후보를 조회합니다."""
        vector_literal = (
            "[" + ",".join(str(value) for value in query_embedding) + "]"
            if query_embedding
            else None
        )
        # 분위기·상황 같은 자연어 키워드는 질의 임베딩에 이미 반영된다.
        # 초기 데이터의 source_keywords가 비어 있거나 표현이 다르다는 이유로
        # 의미상 가까운 후보를 제거하지 않도록 vector 검색에서는 하드 필터를 끈다.
        effective_keywords = [] if vector_literal else keywords
        vector_join = """
            JOIN popcorn_movie_embeddings e
              ON e.movie_id = s.id
             AND e.embedding_model = 'bge-m3'
             AND e.document_type = 'PROFILE'
             AND e.status = 'READY'
             AND e.embedding IS NOT NULL
        """ if vector_literal else ""
        distance_select = (
            """,
                (
                    e.embedding::cdb_admin.vector
                    OPERATOR(cdb_admin.<=>)
                    $13::cdb_admin.vector
                ) AS distance
            """
            if vector_literal
            else ", NULL::double precision AS distance"
        )
        distance_order = "distance ASC, " if vector_literal else ""
        if sort_by == "latest":
            order_by = (
                "s.release_date DESC NULLS LAST, "
                f"{distance_order}COALESCE(r.average_score, 0) DESC"
            )
        elif sort_by == "rating":
            order_by = (
                "COALESCE(r.average_score, 0) DESC, "
                f"{distance_order}s.release_date DESC NULLS LAST"
            )
        else:
            order_by = (
                f"{distance_order}COALESCE(r.average_score, 0) DESC, "
                "s.release_date DESC NULLS LAST"
            )
        rating_join = """
          LEFT JOIN LATERAL (
                SELECT ROUND(AVG(rating), 1) AS average_score, COUNT(*) AS rating_count
                  FROM reviews
                 WHERE movie_id = s.id
                   AND status = 'ACTIVE'
                   AND deleted_at IS NULL
          ) r ON TRUE
        """
        sql = f"""
            SELECT
                s.id,
                s.title_ko AS title,
                s.title_en,
                s.plot AS synopsis,
                s.directors AS director,
                s.actors,
                s.genres,
                s.production_countries,
                s.production_year,
                s.release_date,
                s.runtime_minutes,
                s.viewing_grade AS age_rating,
                COALESCE(
                    (
                        SELECT jsonb_agg(jsonb_build_object('name', keyword))
                          FROM unnest(s.source_keywords) keyword
                    ),
                    '[]'::jsonb
                ) AS popcorn_category,
                COALESCE(r.average_score, 0) AS average_score,
                COALESCE(r.rating_count, 0) AS rating_count
                {distance_select}
              FROM popcorn_movies_service s
              {vector_join}
              {rating_join}
             WHERE s.service_status = 'PUBLISHED'
               AND ($1::text[] = '{{}}' OR s.genres && $1)
               AND ($2::text[] = '{{}}' OR EXISTS (
                    SELECT 1
                      FROM unnest($2::text[]) term
                     WHERE EXISTS (
                         SELECT 1 FROM unnest(s.actors) actor
                          WHERE actor ILIKE '%' || term || '%'
                     )
               ))
               AND ($3::text[] = '{{}}' OR EXISTS (
                    SELECT 1
                      FROM unnest($3::text[]) term
                     WHERE EXISTS (
                         SELECT 1 FROM unnest(s.directors) director
                          WHERE director ILIKE '%' || term || '%'
                     )
               ))
               AND ($4::text[] = '{{}}' OR s.production_countries && $4)
               AND ($5::text[] = '{{}}' OR s.source_keywords && $5)
               AND ($6::text[] = '{{}}' OR NOT EXISTS (
                    SELECT 1
                      FROM unnest($6::text[]) term
                     WHERE COALESCE(array_to_string(s.genres, ' '), '') ILIKE '%' || term || '%'
                        OR COALESCE(array_to_string(s.source_keywords, ' '), '') ILIKE '%' || term || '%'
                        OR COALESCE(s.plot, '') ILIKE '%' || term || '%'
               ))
               AND ($7 = 0 OR s.production_year >= $7)
               AND ($8 = 0 OR s.production_year <= $8)
               AND ($9 = 0 OR (s.runtime_minutes IS NOT NULL AND s.runtime_minutes <= $9))
               AND ($10 = 0 OR COALESCE(r.average_score, 0) >= $10)
               AND ($11::bigint IS NULL OR s.id <> $11)
             ORDER BY {order_by}
             LIMIT $12
        """
        params: list[Any] = [
            genres,
            actors,
            directors,
            countries,
            effective_keywords,
            avoid_keywords,
            release_year_from,
            release_year_to,
            max_runtime_minutes,
            min_rating,
            exclude_movie_id,
            limit,
        ]
        if vector_literal:
            params.append(vector_literal)
        pool = await get_pool()
        rows = await pool.fetch(sql, *params)
        return [dict(row) for row in rows]

    async def find_serendipity_movie(
        self,
        *,
        preference_embedding: list[float],
        exclude_movie_ids: list[int],
        min_rating: float = 4.5,
        min_review_count: int = 30,
    ) -> dict[str, Any] | None:
        """Return a well-reviewed movie semantically distant from saved preferences."""
        if not preference_embedding:
            return None
        vector_literal = "[" + ",".join(str(value) for value in preference_embedding) + "]"
        pool = await get_pool()
        rows = await pool.fetch(
            """
            SELECT
                s.id,
                s.title_ko AS title,
                s.title_en,
                s.plot AS synopsis,
                s.directors AS director,
                s.actors,
                s.genres,
                s.production_countries,
                s.production_year,
                s.release_date,
                s.runtime_minutes,
                s.viewing_grade AS age_rating,
                COALESCE(
                    (
                        SELECT jsonb_agg(jsonb_build_object('name', keyword))
                          FROM unnest(s.source_keywords) keyword
                    ),
                    '[]'::jsonb
                ) AS popcorn_category,
                r.average_score,
                r.rating_count,
                (
                    e.embedding::cdb_admin.vector
                    OPERATOR(cdb_admin.<=>)
                    $1::cdb_admin.vector
                ) AS distance
              FROM popcorn_movies_service s
              JOIN popcorn_movie_embeddings e
                ON e.movie_id = s.id
               AND e.embedding_model = 'bge-m3'
               AND e.document_type = 'PROFILE'
               AND e.status = 'READY'
               AND e.embedding IS NOT NULL
              JOIN LATERAL (
                    SELECT ROUND(AVG(rating), 1) AS average_score,
                           COUNT(*) AS rating_count
                      FROM reviews
                     WHERE movie_id = s.id
                       AND status = 'ACTIVE'
                       AND deleted_at IS NULL
              ) r ON TRUE
             WHERE s.service_status = 'PUBLISHED'
               AND NOT (s.id = ANY($2::bigint[]))
               AND r.average_score >= $3
               AND r.rating_count >= $4
             ORDER BY distance DESC, r.average_score DESC, r.rating_count DESC,
                      s.release_date DESC NULLS LAST
             LIMIT 1
            """,
            vector_literal,
            exclude_movie_ids,
            min_rating,
            min_review_count,
        )
        return dict(rows[0]) if rows else None

movie_repository = MovieRepository()
