-- =============================================================================
-- 005 되돌리기 — 카테고리 도메인
--
-- 순서가 중요합니다. 뷰 → 연결 → 문구·분류 순으로 지웁니다.
-- movie_display_category_links가 display_categories를 ON DELETE RESTRICT로
-- 참조하므로, 연결을 먼저 지우지 않으면 문구가 지워지지 않습니다.
--
-- ⚠️ 관리자가 붙여둔 분류·문구와 영화 연결이 모두 사라집니다.
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_schema() IS NULL OR current_schema() = 'public' THEN
        RAISE EXCEPTION
            'Set search_path to the application schema first (for example: dev, public or prd, public).';
    END IF;
END $$;

-- 뷰가 테이블을 붙들고 있으므로 먼저 지웁니다.
-- movie_categories_service는 이전 판의 뷰입니다. 남아 있으면 같이 정리합니다.
DROP VIEW IF EXISTS display_categories_service;
DROP VIEW IF EXISTS movie_categories_service;

-- 참조하는 쪽(연결)을 전부 먼저 지웁니다. 하나라도 남으면 아래 DROP이 FK에
-- 걸려 실패합니다. movie_category_links도 이전 판의 것입니다.
DROP TABLE IF EXISTS movie_display_category_links;
DROP TABLE IF EXISTS movie_category_links;

-- 참조받던 쪽.
DROP TABLE IF EXISTS display_categories;
DROP TABLE IF EXISTS movie_categories;

COMMIT;
