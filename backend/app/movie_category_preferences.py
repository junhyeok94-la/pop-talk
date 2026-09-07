from app.problems import ProblemError


async def validate_movie_categories(conn, category_ids: list[int]) -> None:
    rows = await conn.fetch(
        "SELECT id FROM movie_categories WHERE id = ANY($1::bigint[]) AND is_active = TRUE FOR KEY SHARE",
        category_ids,
    )
    valid_ids = {int(row["id"]) for row in rows}
    invalid_ids = [category_id for category_id in category_ids if category_id not in valid_ids]
    if invalid_ids:
        raise ProblemError(
            422,
            "Invalid Movie Category",
            f"Every movie category must exist and be active. invalid_ids={invalid_ids}",
        )


def user_preferences(row) -> dict:
    result = dict(row)
    result["user_id"] = str(result["user_id"])
    result["movie_category_ids"] = [
        int(category_id)
        for category_id in (result.pop("onboarding_movie_category_ids", []) or [])
    ]
    return result


async def fetch_user_preferences(conn, user_id) -> dict:
    row = await conn.fetchrow(
        """
        SELECT id AS user_id, onboarding_status, onboarding_movie_category_ids,
               to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at
          FROM users
         WHERE id = $1 AND deleted_at IS NULL
        """,
        user_id,
    )
    if not row:
        raise ProblemError(404, "Member Not Found")
    return user_preferences(row)
