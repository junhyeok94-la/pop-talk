-- 011: Persist the display categories selected during registration onboarding.

BEGIN;

DO $$
BEGIN
    IF current_schema() IS NULL OR current_schema() = 'public' THEN
        RAISE EXCEPTION
            'Set search_path to the application schema first (for example: dev, public or prd, public).';
    END IF;
END $$;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS onboarding_display_category_ids BIGINT[]
        NOT NULL DEFAULT '{}'::bigint[];

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS ck_users_onboarding_display_category_count;
ALTER TABLE users
    ADD CONSTRAINT ck_users_onboarding_display_category_count
    CHECK (cardinality(onboarding_display_category_ids) <= 20);

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS ck_users_onboarding_display_category_no_null;
ALTER TABLE users
    ADD CONSTRAINT ck_users_onboarding_display_category_no_null
    CHECK (array_position(onboarding_display_category_ids, NULL) IS NULL);

COMMENT ON COLUMN users.onboarding_display_category_ids IS
    '회원가입 온보딩에서 복수 선택한 display_categories.id 목록. API에서 활성 ID 존재 여부를 검증한다.';

COMMIT;
