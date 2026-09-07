-- 013: Switch registration onboarding preferences from display categories to movie categories.

BEGIN;

DO $$
BEGIN
    IF current_schema() IS NULL OR current_schema() = 'public' THEN
        RAISE EXCEPTION
            'Set search_path to the application schema first (for example: dev, public or prd, public).';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'users'
           AND column_name = 'onboarding_display_category_ids'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'users'
           AND column_name = 'onboarding_movie_category_ids'
    ) THEN
        ALTER TABLE users
            RENAME COLUMN onboarding_display_category_ids
            TO onboarding_movie_category_ids;
    END IF;
END $$;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS onboarding_movie_category_ids BIGINT[]
        NOT NULL DEFAULT '{}'::bigint[];

-- Existing display selections use a different ID namespace. If the deployed
-- display category schema exposes category_id, preserve the semantic choices by
-- mapping them to movie_categories.id. Otherwise reset them safely.
DO $$
BEGIN
    -- The old constraint name survives the column rename and marks that this is
    -- the first conversion run. Without this guard, rerunning the migration
    -- would incorrectly reinterpret movie category IDs as display category IDs.
    IF EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'users'::regclass
           AND conname = 'ck_users_onboarding_display_category_count'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'display_categories'
           AND column_name = 'category_id'
    ) THEN
        UPDATE users u
           SET onboarding_movie_category_ids = COALESCE((
               SELECT array_agg(DISTINCT d.category_id ORDER BY d.category_id)
                 FROM unnest(u.onboarding_movie_category_ids) AS selected(display_category_id)
                 JOIN display_categories d ON d.id = selected.display_category_id
                 JOIN movie_categories m ON m.id = d.category_id
                WHERE d.category_id IS NOT NULL
           ), '{}'::bigint[]);
    ELSIF EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'users'::regclass
           AND conname = 'ck_users_onboarding_display_category_count'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'display_categories'
           AND column_name = 'category_codes'
    ) THEN
        UPDATE users u
           SET onboarding_movie_category_ids = COALESCE((
               SELECT array_agg(DISTINCT m.id ORDER BY m.id)
                 FROM unnest(u.onboarding_movie_category_ids) AS selected(display_category_id)
                 JOIN display_categories d ON d.id = selected.display_category_id
                 CROSS JOIN LATERAL unnest(d.category_codes) AS mapped(category_code)
                 JOIN movie_categories m ON m.code = mapped.category_code
           ), '{}'::bigint[]);
    ELSIF EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'users'::regclass
           AND conname = 'ck_users_onboarding_display_category_count'
    ) THEN
        UPDATE users SET onboarding_movie_category_ids = '{}'::bigint[];
    END IF;
END $$;

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS ck_users_onboarding_display_category_count,
    DROP CONSTRAINT IF EXISTS ck_users_onboarding_display_category_no_null,
    DROP CONSTRAINT IF EXISTS ck_users_onboarding_movie_category_count,
    DROP CONSTRAINT IF EXISTS ck_users_onboarding_movie_category_no_null;

ALTER TABLE users
    ADD CONSTRAINT ck_users_onboarding_movie_category_count
        CHECK (cardinality(onboarding_movie_category_ids) <= 20),
    ADD CONSTRAINT ck_users_onboarding_movie_category_no_null
        CHECK (array_position(onboarding_movie_category_ids, NULL) IS NULL);

COMMENT ON COLUMN users.onboarding_movie_category_ids IS
    '회원가입 온보딩에서 복수 선택한 movie_categories.id 목록. API에서 활성 ID 존재 여부를 검증한다.';

COMMIT;
