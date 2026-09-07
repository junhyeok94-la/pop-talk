-- =============================================================================
-- 006 되돌리기 — reviews.movie_id를 uuid로 되돌린다
--
-- up이 만든 것을 정확히 되돌리고, movie_id를 원래 모습(uuid, NULL 허용, FK 없음)
-- 으로 복원합니다.
--
-- ⚠️ 되돌릴 곳이 없습니다. movie_id는 popcorn_movies의 bigint를 담고 있는데
--    uuid로 바꾸면 그 값을 표현할 방법이 없습니다. 그래서 데이터가 있으면
--    중단합니다 — 조용히 NULL이 되면 어느 영화의 감상평인지 영영 알 수 없습니다.
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_schema() IS NULL OR current_schema() = 'public' THEN
        RAISE EXCEPTION
            'Set search_path to the application schema first (for example: dev, public or prd, public).';
    END IF;
END $$;

DO $$
DECLARE
    n bigint;
BEGIN
    SELECT count(*) INTO n FROM reviews;
    IF n > 0 THEN
        RAISE EXCEPTION
            'reviews에 %건이 있습니다. bigint를 uuid로 되돌릴 방법이 없어 중단합니다.', n;
    END IF;
END $$;

-- 인덱스가 movie_id를 쥐고 있으므로 먼저 내립니다.
DROP INDEX IF EXISTS idx_reviews_movie_created;
DROP INDEX IF EXISTS uq_reviews_active_user_movie;

ALTER TABLE reviews
    DROP CONSTRAINT IF EXISTS reviews_movie_id_fkey;

-- 원래는 NULL을 허용했습니다.
ALTER TABLE reviews
    ALTER COLUMN movie_id DROP NOT NULL;

-- 비어 있으므로 USING 변환식이 필요 없습니다.
ALTER TABLE reviews
    ALTER COLUMN movie_id TYPE uuid USING NULL;

COMMENT ON COLUMN reviews.movie_id IS NULL;

-- up 이전에 있던 유니크 규칙만 되살립니다.
-- idx_reviews_movie_created는 up이 새로 만든 것이라 되돌리지 않습니다.
CREATE UNIQUE INDEX uq_reviews_active_user_movie
    ON reviews (user_id, movie_id) WHERE deleted_at IS NULL;

COMMIT;
