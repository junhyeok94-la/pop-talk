-- =============================================================================
-- 006 — reviews.movie_id를 popcorn_movies(bigint)에 잇는다
--
-- reviews.movie_id는 uuid였고 dev.movies(uuid)를 가리키고 있었습니다.
-- 그 테이블이 정리되면서 이 컬럼이 갈 곳을 잃었습니다 — 타입만 uuid로 남고
-- FK도 없어, 어떤 영화의 감상평인지 DB가 보장하지 못하는 상태였습니다.
--
-- 영화 원장은 popcorn_movies(bigint) 하나로 모였습니다. apps/api도 두 모듈
-- 모두 popcorn_movies를 읽습니다(movies 모듈조차 popcorn_movies_service를 봅니다).
-- 감상평도 같은 곳을 가리키게 맞춥니다.
--
-- 지금이 가장 싼 시점입니다. reviews가 0건이라 옮길 데이터가 없습니다.
-- 감상평이 쌓인 뒤에는 uuid ↔ bigint 매핑 표를 만들어야 해서 훨씬 비쌉니다.
--
-- ⚠️ reviews에 데이터가 있으면 이 마이그레이션은 실패합니다. 일부러 그렇게
--    했습니다 — uuid를 bigint로 옮길 방법이 없는데 조용히 지워지면 안 됩니다.
--
-- 적용 —
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--        -c "SET search_path TO dev, public" -f migrations/006_reviews_movie_id_bigint.up.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF current_schema() IS NULL OR current_schema() = 'public' THEN
        RAISE EXCEPTION
            'Set search_path to the application schema first (for example: dev, public or prd, public).';
    END IF;
END $$;

-- 데이터가 있으면 멈춥니다. 손으로 옮길 계획을 세운 뒤 다시 실행하세요.
DO $$
DECLARE
    n bigint;
BEGIN
    SELECT count(*) INTO n FROM reviews;
    IF n > 0 THEN
        RAISE EXCEPTION
            'reviews에 %건이 있습니다. uuid를 bigint로 옮길 방법이 없어 중단합니다. '
            '데이터 이관 계획을 먼저 세우세요.', n;
    END IF;
END $$;

-- 유니크 인덱스가 movie_id를 쓰고 있어 컬럼을 바꾸기 전에 내립니다.
-- "삭제되지 않은 감상평은 회원·영화당 하나"라는 규칙으로, 아래에서 다시 만듭니다.
DROP INDEX IF EXISTS uq_reviews_active_user_movie;

-- 비어 있으므로 USING 변환식이 필요 없습니다.
ALTER TABLE reviews
    ALTER COLUMN movie_id TYPE BIGINT USING NULL;

ALTER TABLE reviews
    ALTER COLUMN movie_id SET NOT NULL;

-- 이제 DB가 "실재하는 영화인지"를 보장합니다.
-- 영화가 지워지면 그 감상평도 함께 사라집니다. 남겨두면 어느 영화의 것인지
-- 알 수 없는 행이 됩니다.
ALTER TABLE reviews
    ADD CONSTRAINT reviews_movie_id_fkey
    FOREIGN KEY (movie_id) REFERENCES popcorn_movies(id) ON DELETE CASCADE;

COMMENT ON COLUMN reviews.movie_id IS '감상평 대상 영화 (popcorn_movies.id)';

-- 원래 있던 규칙을 그대로 되살립니다.
CREATE UNIQUE INDEX uq_reviews_active_user_movie
    ON reviews (user_id, movie_id) WHERE deleted_at IS NULL;

-- 영화별 감상평 조회(평균 점수·목록)가 타는 경로입니다. 전에는 없었습니다.
CREATE INDEX idx_reviews_movie_created
    ON reviews (movie_id, created_at DESC) WHERE deleted_at IS NULL;

COMMIT;


-- =============================================================================
-- 남은 것
-- =============================================================================
--   · 팝콘점수(pop_talk_score)는 dev.movies에만 있던 컬럼이라 함께 사라졌습니다.
--     admin 목록·상세가 그 값을 쓰고 있어 별도 결정이 필요합니다 — 보류 중.
-- =============================================================================
