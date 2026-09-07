from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from app.database import get_pool


class ChatRepository:
    async def load_context(
        self,
        *,
        session_id: str,
        user_id: UUID | None = None,
        limit: int = 10,
    ) -> dict[str, Any]:
        # 챗봇은 익명 세션만 사용한다. session_id는 대화 문맥을 복원하는 불투명 식별자다.
        session_uuid = UUID(session_id)
        pool = await get_pool()
        session = await pool.fetchrow(
            "SELECT id, user_id FROM chat_sessions WHERE id = $1",
            session_uuid,
        )
        if not session:
            return {"chat_history": [], "previous_movie_id": None}
        owner_id = session["user_id"]
        if owner_id is not None and owner_id != user_id:
            raise PermissionError("This chat session belongs to another authenticated user.")

        rows = await pool.fetch(
            """
            SELECT role::text AS role, content, sources
              FROM chat_messages
             WHERE session_id = $1
             ORDER BY created_at DESC, id DESC
             LIMIT $2
            """,
            session_uuid,
            limit,
        )
        rows = list(reversed(rows))
        # Router/생성기는 이전 사용자 질문을 문맥으로 받는다. 최신 영화 출처는
        # 후속 영화 지시어를 해석하기 위해 별도로 추적한다.
        chat_history = [
            {"role": "user", "content": row["content"]}
            for row in rows
            if row["role"] == "USER"
        ]
        previous_movie_id = None
        for row in reversed(rows):
            for source in row["sources"] or []:
                if source.get("type") == "movie" and source.get("movie_id") is not None:
                    previous_movie_id = int(source["movie_id"])
                    break
            if previous_movie_id is not None:
                break
        return {
            "chat_history": chat_history,
            "previous_movie_id": previous_movie_id,
        }

    async def load_user_preferences(self, *, user_id: UUID) -> dict[str, Any]:
        pool = await get_pool()
        row = await pool.fetchrow(
            """
            SELECT u.onboarding_status,
                   u.onboarding_movie_category_ids AS movie_category_ids,
                   COALESCE(
                       jsonb_agg(
                           jsonb_build_object(
                               'id', m.id,
                               'code', m.code,
                               'name', m.name,
                               'aliases', COALESCE(m.aliases, '{}'::text[]),
                               'type', m.type,
                               'description', m.description
                           ) ORDER BY m.sort_order, m.id
                       ) FILTER (WHERE m.id IS NOT NULL),
                       '[]'::jsonb
                   ) AS movie_categories
              FROM users u
              LEFT JOIN LATERAL unnest(u.onboarding_movie_category_ids) selected(id)
                ON TRUE
              LEFT JOIN movie_categories m
                ON m.id = selected.id
               AND m.is_active = TRUE
             WHERE u.id = $1
               AND u.status = 'ACTIVE'
               AND u.deleted_at IS NULL
             GROUP BY u.id
            """,
            user_id,
        )
        if not row:
            return {}
        return {
            "onboarding_status": row["onboarding_status"],
            "movie_category_ids": [int(value) for value in row["movie_category_ids"] or []],
            "movie_categories": list(row["movie_categories"] or []),
        }

    async def save_exchange(
        self,
        *,
        session_id: str,
        question: str,
        intent: str,
        answer: str,
        sources: list[dict[str, Any]],
        user_id: UUID | None = None,
    ) -> None:
        session_uuid = UUID(session_id)
        # asyncpg's jsonb codec delegates to json.dumps, which cannot encode UUID/date
        # values returned by PostgreSQL. Normalize all evidence metadata at this boundary.
        json_sources = json.loads(json.dumps(sources, default=str))
        pool = await get_pool()

        async with pool.acquire() as connection:
            async with connection.transaction():
                session = await connection.fetchrow(
                    "SELECT user_id FROM chat_sessions WHERE id = $1 FOR UPDATE",
                    session_uuid,
                )
                if session and session["user_id"] is not None and session["user_id"] != user_id:
                    raise PermissionError("This chat session belongs to another authenticated user.")
                if session:
                    await connection.execute(
                        """
                        UPDATE chat_sessions
                           SET user_id = COALESCE(user_id, $2),
                               updated_at = CURRENT_TIMESTAMP
                         WHERE id = $1
                        """,
                        session_uuid,
                        user_id,
                    )
                else:
                    await connection.execute(
                        """
                        INSERT INTO chat_sessions (id, user_id, title)
                        VALUES ($1, $2, left($3, 255))
                        """,
                        session_uuid,
                        user_id,
                        question,
                    )
                await connection.executemany(
                    """
                    INSERT INTO chat_messages (session_id, role, content, intent, sources)
                    VALUES ($1, $2::chat_role, $3, $4, $5::jsonb)
                    """,
                    [
                        (session_uuid, "USER", question, intent, []),
                        (session_uuid, "ASSISTANT", answer, intent, json_sources),
                    ],
                )


chat_repository = ChatRepository()
