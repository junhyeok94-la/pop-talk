BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- Naver Cloud DB for PostgreSQL은 vector 타입을 cdb_admin 스키마에 제공할 수 있습니다.
-- 로컬에서는 public.vector 확장을 사용하며 애플리케이션 도메인은 현재 dev/prd
-- search_path의 첫 번째 스키마에 생성합니다.
DO $$
DECLARE
    target_schema TEXT := current_schema();
BEGIN
    IF target_schema IS NULL OR target_schema = 'public' THEN
        RAISE EXCEPTION
            'Set search_path to the application schema first (for example: dev, public or prd, public).';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE t.typname = 'vector'
           AND n.nspname = 'cdb_admin'
    ) THEN
        EXECUTE format(
            'CREATE DOMAIN %I.embedding_vector_1024 AS cdb_admin.vector(1024)',
            target_schema
        );
    ELSE
        EXECUTE 'CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public';
        EXECUTE format(
            'CREATE DOMAIN %I.embedding_vector_1024 AS public.vector(1024)',
            target_schema
        );
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TYPE movie_service_status AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN');
CREATE TYPE movie_approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE movie_media_type AS ENUM ('POSTER', 'STILL');
CREATE TYPE embedding_status AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'STALE');
CREATE TYPE embedding_job_operation AS ENUM ('UPSERT', 'DELETE');
CREATE TYPE job_status AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

CREATE TABLE popcorn_movies (
    id BIGSERIAL PRIMARY KEY,

    kofic_movie_cd VARCHAR(20) NOT NULL,
    kmdb_id VARCHAR(20),
    kmdb_matched BOOLEAN NOT NULL DEFAULT FALSE,

    title_ko TEXT NOT NULL CHECK (length(btrim(title_ko)) > 0),
    title_en TEXT,
    title_original TEXT,

    release_date DATE NOT NULL,
    production_year SMALLINT
        CHECK (production_year IS NULL OR production_year BETWEEN 1888 AND 2200),
    runtime_minutes SMALLINT
        CHECK (runtime_minutes IS NULL OR runtime_minutes > 0),
    movie_type VARCHAR(50),
    production_status VARCHAR(50),

    production_countries TEXT[] NOT NULL DEFAULT '{}',
    representative_country VARCHAR(100),
    genres TEXT[] NOT NULL DEFAULT '{}',
    representative_genre VARCHAR(100),

    directors TEXT[] NOT NULL DEFAULT '{}',
    director_names_en TEXT[] NOT NULL DEFAULT '{}',
    actors TEXT[] NOT NULL DEFAULT '{}',
    actor_roles TEXT[] NOT NULL DEFAULT '{}',
    production_companies TEXT[] NOT NULL DEFAULT '{}',

    viewing_grade VARCHAR(100),
    poster_url TEXT,
    plot TEXT,
    source_keywords TEXT[] NOT NULL DEFAULT '{}',

    service_status movie_service_status NOT NULL DEFAULT 'DRAFT',
    approval_status movie_approval_status NOT NULL DEFAULT 'PENDING',
    approved_by VARCHAR(100),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,

    source_system VARCHAR(30) NOT NULL DEFAULT 'KOFIC_KMDB',
    source_hash CHAR(64) NOT NULL,
    source_synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_popcorn_movies_kofic UNIQUE (kofic_movie_cd),
    CONSTRAINT ck_popcorn_movies_kmdb_match CHECK (
        kmdb_matched = FALSE OR (kmdb_id IS NOT NULL AND btrim(kmdb_id) <> '')
    ),
    CONSTRAINT ck_popcorn_movies_approval CHECK (
        approval_status <> 'APPROVED' OR approved_at IS NOT NULL
    ),
    CONSTRAINT ck_popcorn_movies_rejection CHECK (
        approval_status <> 'REJECTED'
        OR (rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '')
    )
);

COMMENT ON TABLE popcorn_movies IS 'KOFIC 영화코드를 기준으로 KOFIC와 KMDB 정제 데이터를 통합한 서비스 영화 마스터';
COMMENT ON COLUMN popcorn_movies.id IS '영화 고유 식별자 (PK)';
COMMENT ON COLUMN popcorn_movies.kofic_movie_cd IS 'KOFIC OpenAPI 영화 고유 코드이며 데이터 적재 UPSERT 기준';
COMMENT ON COLUMN popcorn_movies.kmdb_id IS 'KMDB 보강 데이터 식별자. 서로 다른 KOFIC 영화가 같은 KMDB ID에 매칭될 수 있어 비고유';
COMMENT ON COLUMN popcorn_movies.kmdb_matched IS 'KMDB 데이터 매칭 성공 여부';
COMMENT ON COLUMN popcorn_movies.title_ko IS '영화 한글 제목';
COMMENT ON COLUMN popcorn_movies.title_en IS '영화 영문 제목';
COMMENT ON COLUMN popcorn_movies.title_original IS '영화 원제';
COMMENT ON COLUMN popcorn_movies.release_date IS '개봉일';
COMMENT ON COLUMN popcorn_movies.production_year IS '제작 연도';
COMMENT ON COLUMN popcorn_movies.runtime_minutes IS '상영 시간 (분 단위)';
COMMENT ON COLUMN popcorn_movies.movie_type IS '영화 유형 (장편, 단편 등)';
COMMENT ON COLUMN popcorn_movies.production_status IS '제작 상태 (개봉, 개봉예정 등)';
COMMENT ON COLUMN popcorn_movies.production_countries IS '제작 국가 목록';
COMMENT ON COLUMN popcorn_movies.representative_country IS '대표 제작 국가';
COMMENT ON COLUMN popcorn_movies.genres IS '장르 목록';
COMMENT ON COLUMN popcorn_movies.representative_genre IS '대표 장르';
COMMENT ON COLUMN popcorn_movies.directors IS '감독 이름 목록';
COMMENT ON COLUMN popcorn_movies.director_names_en IS '감독 영문 이름 목록';
COMMENT ON COLUMN popcorn_movies.actors IS '배우 이름 목록';
COMMENT ON COLUMN popcorn_movies.actor_roles IS '배우 배역 목록';
COMMENT ON COLUMN popcorn_movies.production_companies IS '제작사/배급사 목록';
COMMENT ON COLUMN popcorn_movies.viewing_grade IS '관람 등급';
COMMENT ON COLUMN popcorn_movies.poster_url IS '대표 포스터 이미지 URL';
COMMENT ON COLUMN popcorn_movies.plot IS '영화 줄거리 상세 설명';
COMMENT ON COLUMN popcorn_movies.source_keywords IS '수집된 태그 및 키워드 목록';
COMMENT ON COLUMN popcorn_movies.service_status IS '서비스 노출 상태. 승인 상태와 별도로 DRAFT, PUBLISHED, HIDDEN 관리';
COMMENT ON COLUMN popcorn_movies.approval_status IS '관리자 또는 검증 배치의 승인 상태';
COMMENT ON COLUMN popcorn_movies.approved_by IS '승인 처리한 관리자';
COMMENT ON COLUMN popcorn_movies.approved_at IS '승인 일시';
COMMENT ON COLUMN popcorn_movies.rejection_reason IS '승인 거절 사유';
COMMENT ON COLUMN popcorn_movies.source_system IS '데이터 수집 원본 시스템 (KOFIC_KMDB)';
COMMENT ON COLUMN popcorn_movies.source_hash IS '정제된 원본 행 변경 감지를 위한 SHA-256';
COMMENT ON COLUMN popcorn_movies.source_synced_at IS '원본 동기화 일시';
COMMENT ON COLUMN popcorn_movies.created_at IS '레코드 생성 일시';
COMMENT ON COLUMN popcorn_movies.updated_at IS '레코드 수정 일시';

CREATE INDEX idx_popcorn_movies_kmdb_id
    ON popcorn_movies (kmdb_id)
    WHERE kmdb_id IS NOT NULL;
CREATE INDEX idx_popcorn_movies_title_ko ON popcorn_movies (title_ko);
CREATE INDEX idx_popcorn_movies_release_date ON popcorn_movies (release_date DESC);
CREATE INDEX idx_popcorn_movies_service_release
    ON popcorn_movies (service_status, approval_status, release_date DESC);
CREATE INDEX idx_popcorn_movies_genres ON popcorn_movies USING GIN (genres);
CREATE INDEX idx_popcorn_movies_countries ON popcorn_movies USING GIN (production_countries);
CREATE INDEX idx_popcorn_movies_directors ON popcorn_movies USING GIN (directors);
CREATE INDEX idx_popcorn_movies_actors ON popcorn_movies USING GIN (actors);
CREATE INDEX idx_popcorn_movies_source_keywords ON popcorn_movies USING GIN (source_keywords);

CREATE TABLE popcorn_movie_media (
    id BIGSERIAL PRIMARY KEY,
    movie_id BIGINT NOT NULL REFERENCES popcorn_movies(id) ON DELETE CASCADE,
    media_type movie_media_type NOT NULL,
    url TEXT NOT NULL CHECK (length(btrim(url)) > 0),
    display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    source_system VARCHAR(30) NOT NULL DEFAULT 'KMDB',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (movie_id, media_type, url)
);

COMMENT ON TABLE popcorn_movie_media IS 'movies_final.json의 전체 포스터와 스틸컷 URL 목록';
COMMENT ON COLUMN popcorn_movie_media.id IS '미디어 고유 식별자 (PK)';
COMMENT ON COLUMN popcorn_movie_media.movie_id IS '연관된 영화 ID (popcorn_movies.id FK)';
COMMENT ON COLUMN popcorn_movie_media.media_type IS '미디어 유형 (POSTER, STILL)';
COMMENT ON COLUMN popcorn_movie_media.url IS '미디어 이미지 URL';
COMMENT ON COLUMN popcorn_movie_media.display_order IS '미디어 노출 정렬 순서';
COMMENT ON COLUMN popcorn_movie_media.is_primary IS '대표 미디어 여부';
COMMENT ON COLUMN popcorn_movie_media.source_system IS '미디어 수집 출처';
COMMENT ON COLUMN popcorn_movie_media.created_at IS '레코드 생성 일시';

CREATE INDEX idx_popcorn_movie_media_movie_type
    ON popcorn_movie_media (movie_id, media_type, display_order);
CREATE UNIQUE INDEX uq_popcorn_movie_primary_poster
    ON popcorn_movie_media (movie_id)
    WHERE media_type = 'POSTER' AND is_primary = TRUE;

CREATE TABLE popcorn_movie_embeddings (
    id BIGSERIAL PRIMARY KEY,
    movie_id BIGINT NOT NULL REFERENCES popcorn_movies(id) ON DELETE CASCADE,
    document_type VARCHAR(30) NOT NULL DEFAULT 'PROFILE',
    chunk_no INTEGER NOT NULL DEFAULT 0 CHECK (chunk_no >= 0),
    embedding_model VARCHAR(100) NOT NULL DEFAULT 'bge-m3',
    status embedding_status NOT NULL DEFAULT 'PENDING',
    embedding_text TEXT NOT NULL,
    content_hash CHAR(64) NOT NULL,
    embedding embedding_vector_1024,
    attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT,
    embedded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (movie_id, document_type, chunk_no, embedding_model),
    CHECK (
        status <> 'READY'
        OR (embedding IS NOT NULL AND embedded_at IS NOT NULL)
    )
);

COMMENT ON TABLE popcorn_movie_embeddings IS '영화 메타정보와 줄거리의 RAG 검색용 1024차원 임베딩';
COMMENT ON COLUMN popcorn_movie_embeddings.id IS '임베딩 고유 식별자 (PK)';
COMMENT ON COLUMN popcorn_movie_embeddings.movie_id IS '연관된 영화 ID (popcorn_movies.id FK)';
COMMENT ON COLUMN popcorn_movie_embeddings.document_type IS '임베딩 문서 유형 (예: PROFILE)';
COMMENT ON COLUMN popcorn_movie_embeddings.chunk_no IS '문서 청크 번호';
COMMENT ON COLUMN popcorn_movie_embeddings.embedding_model IS '임베딩 모델명 (bge-m3 등)';
COMMENT ON COLUMN popcorn_movie_embeddings.status IS '임베딩 상태 (PENDING, PROCESSING, READY, FAILED, STALE)';
COMMENT ON COLUMN popcorn_movie_embeddings.embedding_text IS '임베딩 대상 원본 텍스트';
COMMENT ON COLUMN popcorn_movie_embeddings.content_hash IS '임베딩 텍스트 SHA-256 해시';
COMMENT ON COLUMN popcorn_movie_embeddings.embedding IS '1024차원 임베딩 벡터 데이터';
COMMENT ON COLUMN popcorn_movie_embeddings.attempts IS '처리 시도 횟수';
COMMENT ON COLUMN popcorn_movie_embeddings.last_error IS '최근 에러 메시지';
COMMENT ON COLUMN popcorn_movie_embeddings.embedded_at IS '임베딩 완료 일시';
COMMENT ON COLUMN popcorn_movie_embeddings.created_at IS '레코드 생성 일시';
COMMENT ON COLUMN popcorn_movie_embeddings.updated_at IS '레코드 수정 일시';

CREATE INDEX idx_movie_embeddings_movie_status
    ON popcorn_movie_embeddings (movie_id, status);

CREATE TABLE movie_embedding_jobs (
    id BIGSERIAL PRIMARY KEY,
    movie_id BIGINT NOT NULL REFERENCES popcorn_movies(id) ON DELETE CASCADE,
    embedding_model VARCHAR(100) NOT NULL DEFAULT 'bge-m3',
    operation embedding_job_operation NOT NULL DEFAULT 'UPSERT',
    status job_status NOT NULL DEFAULT 'PENDING',
    attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts SMALLINT NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    last_error TEXT,
    available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE movie_embedding_jobs IS '신규·변경·승인 영화의 임베딩 작업 큐';
COMMENT ON COLUMN movie_embedding_jobs.id IS '작업 큐 고유 식별자 (PK)';
COMMENT ON COLUMN movie_embedding_jobs.movie_id IS '대상 영화 ID (popcorn_movies.id FK)';
COMMENT ON COLUMN movie_embedding_jobs.embedding_model IS '대상 임베딩 모델명';
COMMENT ON COLUMN movie_embedding_jobs.operation IS '작업 종류 (UPSERT, DELETE)';
COMMENT ON COLUMN movie_embedding_jobs.status IS '작업 상태 (PENDING, PROCESSING, SUCCEEDED, FAILED)';
COMMENT ON COLUMN movie_embedding_jobs.attempts IS '현재 시도 횟수';
COMMENT ON COLUMN movie_embedding_jobs.max_attempts IS '최대 시도 가능 횟수';
COMMENT ON COLUMN movie_embedding_jobs.last_error IS '최근 에러 메시지';
COMMENT ON COLUMN movie_embedding_jobs.available_at IS '작업 실행 가능 일시';
COMMENT ON COLUMN movie_embedding_jobs.started_at IS '작업 구동 시작 일시';
COMMENT ON COLUMN movie_embedding_jobs.finished_at IS '작업 종료 일시';
COMMENT ON COLUMN movie_embedding_jobs.created_at IS '작업 등록 일시';

CREATE UNIQUE INDEX uq_movie_embedding_jobs_active
    ON movie_embedding_jobs (movie_id, embedding_model, operation)
    WHERE status IN ('PENDING', 'PROCESSING');
CREATE INDEX idx_movie_embedding_jobs_dispatch
    ON movie_embedding_jobs (status, available_at, id);

CREATE TABLE batch_runs (
    id BIGSERIAL PRIMARY KEY,
    job_name VARCHAR(100) NOT NULL,
    scheduled_for TIMESTAMPTZ NOT NULL,
    status job_status NOT NULL DEFAULT 'PENDING',
    source_file VARCHAR(500),
    source_hash CHAR(64),
    processed_count INTEGER NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
    inserted_count INTEGER NOT NULL DEFAULT 0 CHECK (inserted_count >= 0),
    updated_count INTEGER NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
    failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_error TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (job_name, scheduled_for)
);

COMMENT ON TABLE batch_runs IS 'APScheduler와 초기 데이터 적재 작업의 실행 이력 및 처리 건수';
COMMENT ON COLUMN batch_runs.id IS '배치 구동 고유 식별자 (PK)';
COMMENT ON COLUMN batch_runs.job_name IS '배치 작업 명칭';
COMMENT ON COLUMN batch_runs.scheduled_for IS '배치 예약 일시';
COMMENT ON COLUMN batch_runs.status IS '배치 상태 (PENDING, PROCESSING, SUCCEEDED, FAILED)';
COMMENT ON COLUMN batch_runs.source_file IS '배치 원본 파일 경로';
COMMENT ON COLUMN batch_runs.source_hash IS '원본 파일 SHA-256 해시';
COMMENT ON COLUMN batch_runs.processed_count IS '총 처리 건수';
COMMENT ON COLUMN batch_runs.inserted_count IS '신규 삽입 건수';
COMMENT ON COLUMN batch_runs.updated_count IS '수정 건수';
COMMENT ON COLUMN batch_runs.failed_count IS '실패 건수';
COMMENT ON COLUMN batch_runs.result IS '배치 수행 결과 상세 JSONB';
COMMENT ON COLUMN batch_runs.last_error IS '최근 에러 메시지';
COMMENT ON COLUMN batch_runs.started_at IS '배치 시작 일시';
COMMENT ON COLUMN batch_runs.finished_at IS '배치 종료 일시';
COMMENT ON COLUMN batch_runs.created_at IS '기록 생성 일시';

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION queue_movie_embedding()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.service_status <> 'PUBLISHED'
       OR NEW.approval_status <> 'APPROVED'
    THEN
        UPDATE popcorn_movie_embeddings
           SET status = 'STALE', updated_at = CURRENT_TIMESTAMP
         WHERE movie_id = NEW.id
           AND status = 'READY';
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT'
       OR OLD.title_ko IS DISTINCT FROM NEW.title_ko
       OR OLD.title_en IS DISTINCT FROM NEW.title_en
       OR OLD.title_original IS DISTINCT FROM NEW.title_original
       OR OLD.genres IS DISTINCT FROM NEW.genres
       OR OLD.production_countries IS DISTINCT FROM NEW.production_countries
       OR OLD.production_year IS DISTINCT FROM NEW.production_year
       OR OLD.directors IS DISTINCT FROM NEW.directors
       OR OLD.actors IS DISTINCT FROM NEW.actors
       OR OLD.viewing_grade IS DISTINCT FROM NEW.viewing_grade
       OR OLD.release_date IS DISTINCT FROM NEW.release_date
       OR OLD.runtime_minutes IS DISTINCT FROM NEW.runtime_minutes
       OR OLD.source_keywords IS DISTINCT FROM NEW.source_keywords
       OR OLD.plot IS DISTINCT FROM NEW.plot
       OR OLD.service_status IS DISTINCT FROM NEW.service_status
       OR OLD.approval_status IS DISTINCT FROM NEW.approval_status
    THEN
        UPDATE popcorn_movie_embeddings
           SET status = 'STALE', updated_at = CURRENT_TIMESTAMP
         WHERE movie_id = NEW.id
           AND status = 'READY';

        INSERT INTO movie_embedding_jobs (movie_id, operation)
        VALUES (NEW.id, 'UPSERT')
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 함수 내부의 미지정 테이블명이 호출 세션의 다른 dev/prd 스키마로
-- 해석되지 않도록 마이그레이션 실행 시점의 search_path를 함수에 고정합니다.
ALTER FUNCTION set_updated_at() SET search_path FROM CURRENT;
ALTER FUNCTION queue_movie_embedding() SET search_path FROM CURRENT;

CREATE TRIGGER trg_popcorn_movies_updated_at
BEFORE UPDATE ON popcorn_movies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_movie_embeddings_updated_at
BEFORE UPDATE ON popcorn_movie_embeddings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_queue_movie_embedding
AFTER INSERT OR UPDATE OF
    title_ko,
    title_en,
    title_original,
    genres,
    production_countries,
    production_year,
    directors,
    actors,
    viewing_grade,
    release_date,
    runtime_minutes,
    source_keywords,
    plot,
    service_status,
    approval_status
ON popcorn_movies
FOR EACH ROW EXECUTE FUNCTION queue_movie_embedding();

CREATE VIEW popcorn_movies_service AS
SELECT
    m.*,
    EXISTS (
        SELECT 1
          FROM popcorn_movie_embeddings e
         WHERE e.movie_id = m.id
           AND e.embedding_model = 'bge-m3'
           AND e.document_type = 'PROFILE'
           AND e.status = 'READY'
           AND e.embedding IS NOT NULL
    ) AS is_embedded,
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'type', media.media_type,
                    'url', media.url,
                    'order', media.display_order,
                    'primary', media.is_primary
                )
                ORDER BY media.media_type, media.display_order
            )
              FROM popcorn_movie_media media
             WHERE media.movie_id = m.id
        ),
        '[]'::jsonb
    ) AS media
FROM popcorn_movies m;

COMMENT ON VIEW popcorn_movies_service IS '실제 임베딩 완료 여부와 포스터·스틸컷을 결합한 영화 서비스 조회 뷰';

COMMIT;
