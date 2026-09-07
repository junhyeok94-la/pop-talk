-- Migration 010: data dictionary comments and curated embedding queue triggers.
BEGIN;

DO $$
BEGIN
    IF current_schema() IS NULL OR current_schema() = 'public' THEN
        RAISE EXCEPTION
            'Set search_path to the application schema first (for example: dev, public or prd, public).';
    END IF;
END $$;

-- 009 may already be applied to an existing environment. Repeat the data dictionary comments here so
-- existing environments receive them without re-running the feature migration.
COMMENT ON TABLE movie_editorial IS '배치 수집 원본과 분리해 운영자가 보정하는 영화 정보. 이후 수집 동기화에도 보정값을 보존한다.';
COMMENT ON COLUMN movie_editorial.movie_id IS '보정 대상 영화 ID(popcorn_movies.id). 영화당 한 행만 가진다.';
COMMENT ON COLUMN movie_editorial.plot_override IS '수집 원본 plot 대신 서비스와 챗봇에 사용할 운영자 보정 줄거리.';
COMMENT ON COLUMN movie_editorial.is_removed IS '관리자 단건 논리 삭제 여부. true이면 공개 조회에서 제외하고 배치 재발행도 차단한다.';
COMMENT ON COLUMN movie_editorial.removal_reason IS '논리 삭제 사유. is_removed=true일 때 필수.';
COMMENT ON COLUMN movie_editorial.updated_by IS '마지막 보정 또는 삭제 처리를 수행한 관리자 users.id.';
COMMENT ON COLUMN movie_editorial.created_at IS '운영 보정 레코드 생성 시각.';
COMMENT ON COLUMN movie_editorial.updated_at IS '운영 보정 레코드 최종 수정 시각.';

COMMENT ON TABLE movie_category_links IS '영화와 Pop Talk 자체 운영 카테고리의 다대다 연결 정보.';
COMMENT ON COLUMN movie_category_links.movie_id IS '연결할 영화 ID(popcorn_movies.id).';
COMMENT ON COLUMN movie_category_links.category_id IS '연결할 활성 운영 카테고리 ID(movie_categories.id).';
COMMENT ON COLUMN movie_category_links.assigned_by IS '카테고리를 연결한 관리자 users.id.';
COMMENT ON COLUMN movie_category_links.created_at IS '카테고리 연결 시각.';

COMMENT ON COLUMN onboarding_profiles.favorite_genres IS '온보딩에서 수집한 선호 장르 목록. 개인화 추천 검색 조건에 사용.';
COMMENT ON COLUMN onboarding_profiles.favorite_keywords IS '온보딩에서 수집한 선호 키워드 목록. 개인화 추천 검색 조건에 사용.';
COMMENT ON COLUMN onboarding_profiles.favorite_actors IS '온보딩에서 수집한 선호 배우 목록.';
COMMENT ON COLUMN onboarding_profiles.favorite_directors IS '온보딩에서 수집한 선호 감독 목록.';
COMMENT ON COLUMN onboarding_profiles.preferred_moods IS '온보딩에서 수집한 선호 분위기 목록.';
COMMENT ON COLUMN onboarding_profiles.avoid_keywords IS '추천 결과에서 제외할 키워드 목록.';
COMMENT ON COLUMN onboarding_profiles.survey_answers IS '프론트엔드 온보딩 설문의 원본 응답 JSON. 문항 변경 이력 보존용.';
COMMENT ON COLUMN onboarding_profiles.survey_version IS 'survey_answers를 해석할 설문 양식 버전.';

COMMENT ON CONSTRAINT reviews_half_star_increment_check ON reviews IS '서비스 리뷰 평점은 0.5점부터 5점까지 0.5점 단위만 허용한다.';

COMMENT ON TABLE admin_audit_logs IS '관리자 영화·카테고리·리뷰 관리 행위의 감사 로그.';
COMMENT ON COLUMN admin_audit_logs.id IS '감사 로그 식별자.';
COMMENT ON COLUMN admin_audit_logs.actor_id IS '작업을 실행한 관리자 users.id. 계정 삭제 후에도 로그는 보존한다.';
COMMENT ON COLUMN admin_audit_logs.action IS '수행한 관리 작업 코드.';
COMMENT ON COLUMN admin_audit_logs.target_type IS '작업 대상 종류(예: movie, review, movie_category).';
COMMENT ON COLUMN admin_audit_logs.target_id IS '작업 대상의 식별자. 대상별 ID 형식 차이를 수용하기 위해 문자열로 저장.';
COMMENT ON COLUMN admin_audit_logs.payload IS '작업 당시 요청한 변경 값 JSON.';
COMMENT ON COLUMN admin_audit_logs.created_at IS '관리 작업 발생 시각.';

COMMENT ON FUNCTION protect_removed_movie() IS '논리 삭제 영화는 후속 배치 동기화가 실행돼도 HIDDEN/REJECTED 상태를 유지하도록 강제한다.';
COMMENT ON TRIGGER trg_protect_removed_movie ON popcorn_movies IS '논리 삭제한 영화의 배치 재발행을 방지한다.';

-- The batch trigger queues changes to popcorn_movies. Curated plot/category edits
-- live in separate tables, so they need their own enqueue trigger.
CREATE OR REPLACE FUNCTION queue_curated_movie_embedding()
RETURNS TRIGGER AS $$
DECLARE
    target_movie_id BIGINT;
    is_embeddable BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_movie_id := OLD.movie_id;
    ELSE
        target_movie_id := NEW.movie_id;
    END IF;

    SELECT m.service_status = 'PUBLISHED'
           AND m.approval_status = 'APPROVED'
           AND COALESCE(e.is_removed, FALSE) = FALSE
      INTO is_embeddable
      FROM popcorn_movies m
      LEFT JOIN movie_editorial e ON e.movie_id = m.id
     WHERE m.id = target_movie_id;

    IF COALESCE(is_embeddable, FALSE) THEN
        UPDATE popcorn_movie_embeddings
           SET status = 'STALE', updated_at = CURRENT_TIMESTAMP
         WHERE movie_id = target_movie_id
           AND status = 'READY';

        INSERT INTO movie_embedding_jobs (movie_id, operation)
        VALUES (target_movie_id, 'UPSERT')
        ON CONFLICT DO NOTHING;
    ELSE
        UPDATE popcorn_movie_embeddings
           SET status = 'STALE', updated_at = CURRENT_TIMESTAMP
         WHERE movie_id = target_movie_id
           AND status = 'READY';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
ALTER FUNCTION queue_curated_movie_embedding() SET search_path FROM CURRENT;
COMMENT ON FUNCTION queue_curated_movie_embedding() IS '운영 줄거리·자체 카테고리 변경 시 공개·승인 영화의 임베딩 재생성 작업을 큐에 등록한다.';

DROP TRIGGER IF EXISTS trg_queue_editorial_movie_embedding ON movie_editorial;
CREATE TRIGGER trg_queue_editorial_movie_embedding
AFTER INSERT OR UPDATE OR DELETE ON movie_editorial
FOR EACH ROW EXECUTE FUNCTION queue_curated_movie_embedding();
COMMENT ON TRIGGER trg_queue_editorial_movie_embedding ON movie_editorial IS '운영 줄거리 또는 논리 삭제 정보 변경을 임베딩 큐에 반영한다.';

DROP TRIGGER IF EXISTS trg_queue_category_link_movie_embedding ON movie_category_links;
CREATE TRIGGER trg_queue_category_link_movie_embedding
AFTER INSERT OR UPDATE OR DELETE ON movie_category_links
FOR EACH ROW EXECUTE FUNCTION queue_curated_movie_embedding();
COMMENT ON TRIGGER trg_queue_category_link_movie_embedding ON movie_category_links IS '영화 자체 카테고리 연결 변경을 임베딩 큐에 반영한다.';

COMMIT;
