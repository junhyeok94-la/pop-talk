-- Migration 009: WAS product features. Previous migrations are in this directory.
BEGIN;

DO $$
BEGIN
    IF current_schema() IS NULL OR current_schema() = 'public' THEN
        RAISE EXCEPTION
            'Set search_path to the application schema first (for example: dev, public or prd, public).';
    END IF;
END $$;

-- Batch-owned source fields must remain immutable from the administrator UI.
-- Editorial values are kept separately so a later KOFIC/KMDB sync cannot erase them.
CREATE TABLE IF NOT EXISTS movie_editorial (
    movie_id BIGINT PRIMARY KEY REFERENCES popcorn_movies(id) ON DELETE CASCADE,
    plot_override TEXT,
    is_removed BOOLEAN NOT NULL DEFAULT FALSE,
    removal_reason TEXT,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT movie_editorial_plot_check
        CHECK (plot_override IS NULL OR length(btrim(plot_override)) > 0),
    CONSTRAINT movie_editorial_removal_check
        CHECK (NOT is_removed OR (removal_reason IS NOT NULL AND length(btrim(removal_reason)) > 0))
);
COMMENT ON TABLE movie_editorial IS '배치 수집 원본과 분리해 운영자가 보정하는 영화 정보. 이후 수집 동기화에도 보정값을 보존한다.';
COMMENT ON COLUMN movie_editorial.movie_id IS '보정 대상 영화 ID(popcorn_movies.id). 영화당 한 행만 가진다.';
COMMENT ON COLUMN movie_editorial.plot_override IS '수집 원본 plot 대신 서비스와 챗봇에 사용할 운영자 보정 줄거리.';
COMMENT ON COLUMN movie_editorial.is_removed IS '관리자 단건 논리 삭제 여부. true이면 공개 조회에서 제외하고 배치 재발행도 차단한다.';
COMMENT ON COLUMN movie_editorial.removal_reason IS '논리 삭제 사유. is_removed=true일 때 필수.';
COMMENT ON COLUMN movie_editorial.updated_by IS '마지막 보정 또는 삭제 처리를 수행한 관리자 users.id.';
COMMENT ON COLUMN movie_editorial.created_at IS '운영 보정 레코드 생성 시각.';
COMMENT ON COLUMN movie_editorial.updated_at IS '운영 보정 레코드 최종 수정 시각.';

CREATE TABLE IF NOT EXISTS movie_category_links (
    movie_id BIGINT NOT NULL REFERENCES popcorn_movies(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES movie_categories(id) ON DELETE RESTRICT,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (movie_id, category_id)
);
COMMENT ON TABLE movie_category_links IS '영화와 Pop Talk 자체 운영 카테고리의 다대다 연결 정보.';
COMMENT ON COLUMN movie_category_links.movie_id IS '연결할 영화 ID(popcorn_movies.id).';
COMMENT ON COLUMN movie_category_links.category_id IS '연결할 활성 운영 카테고리 ID(movie_categories.id).';
COMMENT ON COLUMN movie_category_links.assigned_by IS '카테고리를 연결한 관리자 users.id.';
COMMENT ON COLUMN movie_category_links.created_at IS '카테고리 연결 시각.';

CREATE INDEX IF NOT EXISTS idx_movie_category_links_category
    ON movie_category_links (category_id, movie_id);

-- The existing onboarding table is the user preference profile. These fields are
-- deliberately normalized lists suitable for the chatbot's recommendation query;
-- survey_answers retains the versioned raw answer payload.
ALTER TABLE onboarding_profiles
    ADD COLUMN IF NOT EXISTS favorite_genres TEXT[] NOT NULL DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS favorite_keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS favorite_actors TEXT[] NOT NULL DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS favorite_directors TEXT[] NOT NULL DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS preferred_moods TEXT[] NOT NULL DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS avoid_keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS survey_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS survey_version SMALLINT NOT NULL DEFAULT 1;
COMMENT ON COLUMN onboarding_profiles.favorite_genres IS '온보딩에서 수집한 선호 장르 목록. 개인화 추천 검색 조건에 사용.';
COMMENT ON COLUMN onboarding_profiles.favorite_keywords IS '온보딩에서 수집한 선호 키워드 목록. 개인화 추천 검색 조건에 사용.';
COMMENT ON COLUMN onboarding_profiles.favorite_actors IS '온보딩에서 수집한 선호 배우 목록.';
COMMENT ON COLUMN onboarding_profiles.favorite_directors IS '온보딩에서 수집한 선호 감독 목록.';
COMMENT ON COLUMN onboarding_profiles.preferred_moods IS '온보딩에서 수집한 선호 분위기 목록.';
COMMENT ON COLUMN onboarding_profiles.avoid_keywords IS '추천 결과에서 제외할 키워드 목록.';
COMMENT ON COLUMN onboarding_profiles.survey_answers IS '프론트엔드 온보딩 설문의 원본 응답 JSON. 문항 변경 이력 보존용.';
COMMENT ON COLUMN onboarding_profiles.survey_version IS 'survey_answers를 해석할 설문 양식 버전.';

ALTER TABLE reviews
    DROP CONSTRAINT IF EXISTS reviews_half_star_increment_check;
ALTER TABLE reviews
    ADD CONSTRAINT reviews_half_star_increment_check
    CHECK (rating * 2 = trunc(rating * 2));
COMMENT ON CONSTRAINT reviews_half_star_increment_check ON reviews IS '서비스 리뷰 평점은 0.5점부터 5점까지 0.5점 단위만 허용한다.';

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(80) NOT NULL,
    target_type VARCHAR(80) NOT NULL,
    target_id VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE admin_audit_logs IS '관리자 영화·카테고리·리뷰 관리 행위의 감사 로그.';
COMMENT ON COLUMN admin_audit_logs.id IS '감사 로그 식별자.';
COMMENT ON COLUMN admin_audit_logs.actor_id IS '작업을 실행한 관리자 users.id. 계정 삭제 후에도 로그는 보존한다.';
COMMENT ON COLUMN admin_audit_logs.action IS '수행한 관리 작업 코드.';
COMMENT ON COLUMN admin_audit_logs.target_type IS '작업 대상 종류(예: movie, review, movie_category).';
COMMENT ON COLUMN admin_audit_logs.target_id IS '작업 대상의 식별자. 대상별 ID 형식 차이를 수용하기 위해 문자열로 저장.';
COMMENT ON COLUMN admin_audit_logs.payload IS '작업 당시 요청한 변경 값 JSON.';
COMMENT ON COLUMN admin_audit_logs.created_at IS '관리 작업 발생 시각.';
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target
    ON admin_audit_logs (target_type, target_id, created_at DESC);

-- A removed movie must stay hidden even if a later batch attempts to publish it.
CREATE OR REPLACE FUNCTION protect_removed_movie()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM movie_editorial
         WHERE movie_id = NEW.id AND is_removed = TRUE
    ) THEN
        NEW.service_status := 'HIDDEN';
        NEW.approval_status := 'REJECTED';
        NEW.rejection_reason := COALESCE(
            (SELECT removal_reason FROM movie_editorial WHERE movie_id = NEW.id),
            NEW.rejection_reason,
            'Removed by administrator'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_removed_movie ON popcorn_movies;
CREATE TRIGGER trg_protect_removed_movie
    BEFORE UPDATE ON popcorn_movies
FOR EACH ROW EXECUTE FUNCTION protect_removed_movie();
COMMENT ON FUNCTION protect_removed_movie() IS '논리 삭제 영화는 후속 배치 동기화가 실행돼도 HIDDEN/REJECTED 상태를 유지하도록 강제한다.';
COMMENT ON TRIGGER trg_protect_removed_movie ON popcorn_movies IS '논리 삭제한 영화의 배치 재발행을 방지한다.';

COMMIT;
