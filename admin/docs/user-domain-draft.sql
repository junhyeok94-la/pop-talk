-- =============================================================================
-- ⚠️ 실행하지 마세요 — 실제 DB와 다릅니다 (2026-08-10 확인)
--
-- 이 파일은 2026-08-09에 admin 화면 요구사항에서 역산해 쓴 초안입니다.
-- 그 뒤 DB 담당자가 회원 도메인을 직접 설계해 실제 DB(dev·prd)에 반영했고,
-- 구조가 이 초안과 다릅니다. 지금은 참고 자료로만 두십시오.
--
-- 실제 DB와 다른 곳 —
--
--   | 항목        | 이 초안                    | 실제 DB                       |
--   |------------|---------------------------|------------------------------|
--   | users.id   | bigserial (정수)           | uuid                          |
--   | 관리자      | users.role로 구분           | role 컬럼 없음. 관리자 테이블도 없음 |
--   | 감상평 점수  | popcorn_score integer      | reviews.rating numeric        |
--   | 감상평 신고  | member_review_reports 테이블 | 없음 (기능 자체가 빠짐)         |
--   | 영화 참조    | popcorn_movies (bigint)    | movies (uuid) — 별도 테이블     |
--   | 취향 설문    | member_surveys (Q1~Q6)     | onboarding_profiles (문항 없음) |
--   | 취향 갱신    | member_preference_updates  | 대응 테이블 없음                |
--
-- 실제 DB에 있는 회원 도메인 테이블 (전부 0행, 2026-08-10 기준) —
--   users · onboarding_profiles · reviews · user_favorites · watch_history
--   recommendation_runs · recommendation_items · recommendation_feedback · movies
--
-- 이 테이블들을 만든 마이그레이션 파일은 어느 저장소에도 없습니다.
-- pop_talk_batch/migrations는 004까지이고, apps/api는 아직 커밋 전으로 보입니다.
-- 담당자에게 확인이 필요합니다.
--
-- 남겨두는 이유 — admin 화면이 무엇을 필요로 하는지가 여기 정리돼 있습니다.
-- 특히 아래 "열린 질문"은 실제 스키마에서도 아직 답이 나오지 않은 것들입니다.
-- =============================================================================

-- =============================================================================
-- 팝콘톡 사용자 도메인 초안 (참고용)
--
-- 2026-08-09 변경 — 회원(members)과 관리자(admins)를 users 하나로 합치고
-- role 컬럼으로 가릅니다. 백엔드 담당자 요청에 따른 것입니다.
--
-- 작성 근거: pop_talk_batch/migrations의 001~004가 쓰는 규약을 그대로 따랐습니다.
--   · 스키마를 하드코딩하지 않고 search_path의 첫 스키마에 만듭니다 (dev / prd 공용)
--   · BEGIN ... COMMIT으로 감싸고, 스키마가 public이면 즉시 실패시킵니다
--   · 테이블·컬럼 설명은 COMMENT ON으로 남깁니다
--   · bigserial PK, 제약 이름 pkey / uq_* / ck_* / idx_*
--   · timestamptz + created_at/updated_at + trg_*_updated_at 트리거
--   · 다중값은 _text 배열 DEFAULT '{}'::text[] NOT NULL, 조회는 GIN
--   · 상태는 * enum, DEFAULT 명시
--   · 무결성은 애플리케이션이 아니라 DB CHECK로 (ck_popcorn_movies_rejection 방식)
--   · 화면이 쓰기 쉬운 조회는 뷰로 (popcorn_movies_service 방식)
--
-- admin 화면이 실제로 보여주는 것에서 역산했습니다.
--   회원 목록   : 이름·이메일·가입일·상태·감상평 수·신고 수·상태 수정자/일시
--   회원 상세   : 계정 / 취향 설문(Q1~Q6) / 감상평(작성 수·평균 점수·최근 목록)
--                 / 취향 갱신 이력(근거 감상평 + 무엇이 어떻게 바뀌었는지)
--
-- 확정이 필요한 것은 파일 끝 "열린 질문"에 모아두었습니다.
-- =============================================================================



BEGIN;

-- 001~004와 같은 가드입니다. search_path를 지정하지 않고 실행하면
-- public에 테이블이 생겨버리므로 먼저 막습니다.
DO $$
BEGIN
    IF current_schema() IS NULL OR current_schema() = 'public' THEN
        RAISE EXCEPTION
            'Set search_path to the application schema first (for example: dev, public or prd, public).';
    END IF;
END $$;

-- ── enum ─────────────────────────────────────────────────────────────────────

-- 회원과 관리자를 한 테이블에 두므로 상태·역할도 한 축으로 둡니다.
-- WITHDRAWN은 실제로는 회원만 쓰지만, 관리자 퇴사 처리에 그대로 쓸 수도 있어 막지 않습니다.
CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'WITHDRAWN');
CREATE TYPE user_role AS ENUM ('MEMBER', 'ADMIN', 'SUPER_ADMIN');

CREATE TYPE review_status AS ENUM ('NORMAL', 'HIDDEN', 'DELETED');


-- 배치가 취향을 어느 방향으로 움직였는지.
CREATE TYPE preference_change_type AS ENUM ('ADD', 'STRENGTHEN', 'WEAKEN', 'REMOVE');

-- 취향 항목의 축. 설문 문항과 1:1로 맞춥니다.
CREATE TYPE preference_field AS ENUM (
    'GENRE',        -- Q1 좋아하는 장르
    'WATCH_WITH',   -- Q3 관람 상황
    'RATING_LIMIT', -- Q3 관람 등급
    'PERSON',       -- Q4 배우·감독
    'TOPIC',        -- Q5 관심 소재
    'AVOID'         -- Q6 피하고 싶은 요소
);


-- ── 사용자 (회원 + 관리자) ───────────────────────────────────────────────────
-- 서비스를 쓰는 사람과 운영하는 사람을 한 테이블에 두고 role로 가릅니다.
--
--   role = 'MEMBER'                앱 사용자
--   role = 'ADMIN' | 'SUPER_ADMIN' 백오피스 운영자
--
-- ⚠️ 회원을 조회하는 모든 쿼리에 role = 'MEMBER' 조건이 필요합니다.
--    빠뜨리면 회원 목록에 운영자가 섞이고 대시보드 회원 수가 틀어집니다.
--    이 조건을 매번 손으로 쓰지 않도록 아래 members_service /
--    admins_service 뷰를 만들어 두었습니다. 조회는 뷰를 쓰세요.

CREATE TABLE users (
    id bigserial NOT NULL,

    -- 로그인 수단. 소셜만 쓸지 이메일 가입도 받을지에 따라 달라집니다(열린 질문 1).
    email varchar(320) NOT NULL,
    -- 화면에 보이는 이름. 회원 화면에서는 '닉네임', 관리자 화면에서는 '관리자명'입니다.
    nickname varchar(50) NOT NULL,

    role "user_role" DEFAULT 'MEMBER'::user_role NOT NULL,
    status "user_status" DEFAULT 'ACTIVE'::user_status NOT NULL,

    -- 관리자 로그인용. 이번 개발 범위가 아니라 당분간 비어 있습니다(열린 질문 7).
    -- 회원이 소셜 로그인만 쓴다면 회원 행에서는 계속 NULL입니다.
    password_hash varchar(255) NULL,

    -- 연속 로그인 실패. 서버가 2대라 프로세스 메모리에 둘 수 없어 여기 둡니다.
    failed_login_count integer DEFAULT 0 NOT NULL,
    locked_until timestamptz NULL,

    -- 상태를 바꾼 관리자와 시각. popcorn_movies.approved_by가 varchar인 것과 맞췄습니다.
    status_updated_by varchar(100) NULL,
    status_updated_at timestamptz NULL,
    -- 정지·탈퇴 사유. 반려 사유와 같은 이유로 상태가 붙으면 필수입니다.
    status_reason text NULL,

    joined_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
    withdrawn_at timestamptz NULL,
    last_login_at timestamptz NULL,

    created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_nickname UNIQUE (nickname),
    CONSTRAINT users_email_check CHECK (length(btrim(email)) > 0 AND email LIKE '%@%'),
    CONSTRAINT users_nickname_check CHECK (length(btrim(nickname)) > 0),
    CONSTRAINT ck_users_failed_login_count CHECK (failed_login_count >= 0),
    -- 상태를 바꿨으면 누가 언제 바꿨는지가 남아야 합니다.
    CONSTRAINT ck_users_status_audit CHECK (
        (status = 'ACTIVE'::user_status)
        OR (status_updated_by IS NOT NULL AND status_updated_at IS NOT NULL)
    ),
    -- 정지에는 사유가 필요합니다. 반려 사유를 필수로 둔 것과 같은 이유입니다.
    CONSTRAINT ck_users_suspend_reason CHECK (
        (status <> 'SUSPENDED'::user_status)
        OR (status_reason IS NOT NULL AND btrim(status_reason) <> '')
    ),
    CONSTRAINT ck_users_withdrawn_at CHECK (
        (status <> 'WITHDRAWN'::user_status) OR (withdrawn_at IS NOT NULL)
    )
);

-- 회원 목록은 항상 role로 먼저 거르므로 role을 선두에 둡니다.
CREATE INDEX idx_users_role_status_joined ON users USING btree (role, status, joined_at DESC);
CREATE INDEX idx_users_role_joined ON users USING btree (role, joined_at DESC);

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE
    ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 온보딩 설문 ──────────────────────────────────────────────────────────────
-- 기획 문서 "온보딩 설문 & 추천 카테고리 설계" 기준.
-- Q1~Q3은 필수, Q4~Q6은 건너뛸 수 있습니다. 회원당 1건이라 별도 테이블로 두되
-- members와 1:1입니다(재응답을 허용하면 열린 질문 3 참고).

CREATE TABLE member_surveys (
    id bigserial NOT NULL,
    user_id int8 NOT NULL,

    -- Q1 좋아하는 장르 (필수, 복수)
    genres _text DEFAULT '{}'::text[] NOT NULL,
    -- Q2 인상 깊게 본 영화 (필수, 1~3편). 자유 입력이라 텍스트로 받고,
    --    KMDB 검색으로 고른 경우 movie_id를 함께 남깁니다.
    favorite_movie_titles _text DEFAULT '{}'::text[] NOT NULL,
    favorite_movie_ids _int8 DEFAULT '{}'::bigint[] NOT NULL,
    -- Q3 관람 상황 (필수, 복수) / 관람 등급 (필수, 단일)
    watch_with _text DEFAULT '{}'::text[] NOT NULL,
    rating_limit varchar(50) NOT NULL,
    -- Q4 좋아하는 배우·감독 (선택)
    people _text DEFAULT '{}'::text[] NOT NULL,
    -- Q5 관심 소재 (선택, 복수)
    topics _text DEFAULT '{}'::text[] NOT NULL,
    -- Q6 피하고 싶은 요소 (선택, 복수)
    avoid _text DEFAULT '{}'::text[] NOT NULL,

    -- 선택 파트(Q4~Q6)를 건너뛰었는지. 건너뛴 회원은 인기작 기반 콜드스타트로 진입합니다.
    skipped_optional bool DEFAULT false NOT NULL,

    answered_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT member_surveys_pkey PRIMARY KEY (id),
    CONSTRAINT uq_member_surveys_user UNIQUE (user_id),
    CONSTRAINT member_surveys_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

    -- 필수 문항은 비어 있을 수 없습니다.
    CONSTRAINT ck_member_surveys_genres CHECK (cardinality(genres) > 0),
    CONSTRAINT ck_member_surveys_favorites CHECK (
        cardinality(favorite_movie_titles) BETWEEN 1 AND 3
    ),
    CONSTRAINT ck_member_surveys_watch_with CHECK (cardinality(watch_with) > 0),
    CONSTRAINT ck_member_surveys_rating_limit CHECK (length(btrim(rating_limit)) > 0),
    -- 건너뛰었다면 선택 문항이 비어 있어야 앞뒤가 맞습니다.
    CONSTRAINT ck_member_surveys_skipped CHECK (
        (skipped_optional = false)
        OR (cardinality(people) = 0 AND cardinality(topics) = 0 AND cardinality(avoid) = 0)
    )
);

-- 추천 엔진이 "이 장르를 고른 회원"을 찾을 때 씁니다.
CREATE INDEX idx_member_surveys_genres ON member_surveys USING gin (genres);
CREATE INDEX idx_member_surveys_topics ON member_surveys USING gin (topics);
CREATE INDEX idx_member_surveys_avoid ON member_surveys USING gin (avoid);

CREATE TRIGGER trg_member_surveys_updated_at BEFORE UPDATE
    ON member_surveys FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 감상평 ───────────────────────────────────────────────────────────────────

CREATE TABLE member_reviews (
    id bigserial NOT NULL,
    user_id int8 NOT NULL,
    movie_id int8 NOT NULL,

    -- 팝콘점수. popcorn_movies에 추가 예정인 점수와 같은 척도(0~100)로 맞췄습니다.
    popcorn_score int2 NOT NULL,
    content text NOT NULL,

    status "review_status" DEFAULT 'NORMAL'::review_status NOT NULL,
    status_updated_by varchar(100) NULL,
    status_updated_at timestamptz NULL,

    -- 취향 갱신 배치가 이 감상평을 이미 반영했는지. 배치가 매일 미처리분만 집습니다.
    preference_applied_at timestamptz NULL,

    created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT member_reviews_pkey PRIMARY KEY (id),
    -- 한 회원이 같은 영화에 감상평을 두 번 쓰지 않습니다(수정은 UPDATE).
    CONSTRAINT uq_member_reviews_member_movie UNIQUE (user_id, movie_id),
    CONSTRAINT member_reviews_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT member_reviews_movie_id_fkey
        FOREIGN KEY (movie_id) REFERENCES popcorn_movies(id) ON DELETE CASCADE,
    CONSTRAINT member_reviews_score_check CHECK (popcorn_score BETWEEN 0 AND 100),
    CONSTRAINT member_reviews_content_check CHECK (length(btrim(content)) > 0),
    CONSTRAINT ck_member_reviews_status_audit CHECK (
        (status = 'NORMAL'::review_status)
        OR (status_updated_by IS NOT NULL AND status_updated_at IS NOT NULL)
    )
);

CREATE INDEX idx_member_reviews_member ON member_reviews USING btree (user_id, created_at DESC);
CREATE INDEX idx_member_reviews_movie ON member_reviews USING btree (movie_id, created_at DESC);
CREATE INDEX idx_member_reviews_status ON member_reviews USING btree (status, created_at DESC);
-- 배치가 매일 집어가는 조건. 미반영 + 정상 감상평만 본다.
CREATE INDEX idx_member_reviews_pending_preference ON member_reviews
    USING btree (created_at)
    WHERE (preference_applied_at IS NULL AND status = 'NORMAL'::review_status);

CREATE TRIGGER trg_member_reviews_updated_at BEFORE UPDATE
    ON member_reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 감상평 신고 ──────────────────────────────────────────────────────────────
-- admin이 신고 수를 두 곳(감상평 목록·회원 목록)에서 보여줍니다.
-- 단순 카운트 컬럼으로 두면 누가 왜 신고했는지 알 수 없어 별도 테이블로 둡니다.

CREATE TABLE member_review_reports (
    id bigserial NOT NULL,
    review_id int8 NOT NULL,
    -- 신고한 회원. 탈퇴해도 신고 이력은 남겨야 하므로 SET NULL.
    reporter_id int8 NULL,
    reason varchar(50) NOT NULL,
    detail text NULL,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT member_review_reports_pkey PRIMARY KEY (id),
    -- 같은 사람이 같은 감상평을 여러 번 신고하지 못하게 합니다.
    CONSTRAINT uq_member_review_reports_once UNIQUE (review_id, reporter_id),
    CONSTRAINT member_review_reports_review_id_fkey
        FOREIGN KEY (review_id) REFERENCES member_reviews(id) ON DELETE CASCADE,
    CONSTRAINT member_review_reports_reporter_id_fkey
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT member_review_reports_reason_check CHECK (length(btrim(reason)) > 0)
);

CREATE INDEX idx_member_review_reports_review ON member_review_reports USING btree (review_id);


-- ── 취향 갱신 이력 ───────────────────────────────────────────────────────────
-- 매일 03:00 배치가 전날 감상평을 근거로 취향을 갱신합니다.
-- admin 회원 상세의 "취향 갱신" 탭이 이 테이블을 그대로 보여줍니다.
-- 관리자는 "무엇을 근거로 취향이 바뀌었는지"를 추적할 수 있어야 합니다.

CREATE TABLE member_preference_updates (
    id bigserial NOT NULL,
    user_id int8 NOT NULL,
    -- 갱신 근거가 된 감상평. 감상평이 지워져도 이력은 남깁니다.
    source_review_id int8 NULL,
    -- 어느 배치 실행에서 나온 변경인지. batch_runs와 이어 실패 시 추적합니다.
    batch_run_id int8 NULL,

    field "preference_field" NOT NULL,
    change_type "preference_change_type" NOT NULL,
    value varchar(100) NOT NULL,
    -- 가중치를 쓴다면 변경 전후. 안 쓰면 NULL로 두면 됩니다(열린 질문 2).
    weight_before numeric(5, 4) NULL,
    weight_after numeric(5, 4) NULL,

    created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT member_preference_updates_pkey PRIMARY KEY (id),
    CONSTRAINT member_preference_updates_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT member_preference_updates_source_review_id_fkey
        FOREIGN KEY (source_review_id) REFERENCES member_reviews(id) ON DELETE SET NULL,
    CONSTRAINT member_preference_updates_batch_run_id_fkey
        FOREIGN KEY (batch_run_id) REFERENCES batch_runs(id) ON DELETE SET NULL,
    CONSTRAINT member_preference_updates_value_check CHECK (length(btrim(value)) > 0)
);

CREATE INDEX idx_member_preference_updates_user ON member_preference_updates
    USING btree (user_id, created_at DESC);
CREATE INDEX idx_member_preference_updates_batch ON member_preference_updates
    USING btree (batch_run_id);


-- ── 현재 취향 ────────────────────────────────────────────────────────────────
-- 설문(초기값) + 배치 갱신(누적)이 합쳐진 "지금 이 회원의 취향".
-- 추천 엔진이 매번 이력을 되감지 않도록 현재값을 따로 둡니다.
-- popcorn_movie_embeddings가 원장과 별도인 것과 같은 이유입니다.

CREATE TABLE member_preferences (
    id bigserial NOT NULL,
    user_id int8 NOT NULL,
    field "preference_field" NOT NULL,
    value varchar(100) NOT NULL,
    -- 0~1. 설문에서 고른 항목은 초기 가중치, 배치가 오르내립니다.
    weight numeric(5, 4) DEFAULT 0.5000 NOT NULL,
    -- 설문에서 왔는지 배치에서 왔는지.
    origin varchar(20) DEFAULT 'SURVEY'::character varying NOT NULL,

    created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT member_preferences_pkey PRIMARY KEY (id),
    CONSTRAINT uq_member_preferences_item UNIQUE (user_id, field, value),
    CONSTRAINT member_preferences_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT member_preferences_weight_check CHECK (weight >= 0 AND weight <= 1),
    CONSTRAINT member_preferences_origin_check CHECK (origin IN ('SURVEY', 'BATCH'))
);

CREATE INDEX idx_member_preferences_member ON member_preferences
    USING btree (user_id, field);
-- 추천 엔진이 "이 값을 높게 가진 회원"을 찾을 때.
CREATE INDEX idx_member_preferences_value ON member_preferences
    USING btree (field, value, weight DESC);

CREATE TRIGGER trg_member_preferences_updated_at BEFORE UPDATE
    ON member_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 조회용 뷰 ────────────────────────────────────────────────────────────────
-- popcorn_movies_service와 같은 역할입니다. admin 목록이 매번 집계 조인을 하지
-- 않도록 회원당 파생값을 미리 붙입니다.
--
-- 한 테이블을 role로 가르게 되면서 뷰의 역할이 하나 더 생겼습니다.
-- 회원 조회에 role = 'MEMBER'를 매번 손으로 붙이면 언젠가 한 곳이 빠집니다.
-- 뷰가 그 조건을 안에 품고 있으므로, 조회는 테이블이 아니라 뷰를 쓰세요.
--
--   회원 목록·상세  → members_service
--   관리자 목록     → admins_service

CREATE OR REPLACE VIEW members_service AS
SELECT
    m.id,
    m.email,
    m.nickname,
    m.role,
    m.status,
    m.status_updated_by,
    m.status_updated_at,
    m.status_reason,
    m.joined_at,
    m.withdrawn_at,
    m.last_login_at,
    m.created_at,
    m.updated_at,

    -- 감상평 수·평균 점수. 삭제된 감상평은 빼고 셉니다.
    COALESCE(r.review_count, 0)::int AS review_count,
    r.avg_popcorn_score,
    r.last_review_at,

    -- 이 회원이 쓴 감상평이 받은 신고의 총합.
    COALESCE(rp.report_count, 0)::int AS report_count,

    -- 설문 응답 여부. 안 한 회원은 콜드스타트 대상입니다.
    (s.user_id IS NOT NULL) AS has_survey,
    s.skipped_optional,

    -- 배치가 취향을 몇 번 갱신했는지.
    COALESCE(pu.preference_update_count, 0)::int AS preference_update_count,
    pu.last_preference_update_at
FROM users m
LEFT JOIN (
    SELECT user_id,
           count(*) AS review_count,
           round(avg(popcorn_score), 1) AS avg_popcorn_score,
           max(created_at) AS last_review_at
      FROM member_reviews
     WHERE status <> 'DELETED'::review_status
     GROUP BY user_id
) r ON r.user_id = m.id
LEFT JOIN (
    SELECT rv.user_id, count(*) AS report_count
      FROM member_review_reports rr
      JOIN member_reviews rv ON rv.id = rr.review_id
     GROUP BY rv.user_id
) rp ON rp.user_id = m.id
LEFT JOIN member_surveys s ON s.user_id = m.id
LEFT JOIN (
    SELECT user_id,
           count(*) AS preference_update_count,
           max(created_at) AS last_preference_update_at
      FROM member_preference_updates
     GROUP BY user_id
) pu ON pu.user_id = m.id
-- 이 한 줄이 회원 목록에 운영자가 섞이는 것을 막습니다.
WHERE m.role = 'MEMBER'::user_role;


-- 관리자 목록. 회원 쪽 집계(감상평·설문·취향)는 붙이지 않습니다.
CREATE OR REPLACE VIEW admins_service AS
SELECT
    u.id,
    u.email,
    u.nickname,
    u.role,
    u.status,
    u.status_updated_by,
    u.status_updated_at,
    u.status_reason,
    u.joined_at,
    u.last_login_at,
    u.created_at,
    u.updated_at,

    -- 이 관리자가 처리한 영화 건수. approved_by가 varchar라 email로 잇습니다.
    -- 감사 컬럼을 FK로 바꾸지 않은 이유는 popcorn_movies가 이미 그 형태이기 때문입니다.
    COALESCE(v.approved_count, 0)::int AS approved_count,
    v.last_approved_at
FROM users u
LEFT JOIN (
    SELECT approved_by,
           count(*) AS approved_count,
           max(approved_at) AS last_approved_at
      FROM popcorn_movies
     WHERE approved_by IS NOT NULL
     GROUP BY approved_by
) v ON v.approved_by = u.email
WHERE u.role <> 'MEMBER'::user_role;


-- ── 리프레시 토큰 (로그인은 이번 개발 범위 아님) ────────────────────────────────────────────────────────────
-- 백엔드가 popcorn-backend-1 / -2 두 대이고 내부 로드밸런서가 요청을 번갈아 보냅니다.
-- 토큰을 프로세스 메모리에 두면 1번에서 발급한 것을 2번이 몰라 로그인이 끊깁니다.
-- ACG 8개 어디에도 6379가 없어 Redis가 없으므로, 공유 저장소는 이 DB뿐입니다.
--
-- 토큰 원문을 저장하지 않습니다. DB가 유출되면 그대로 남의 세션이 되기 때문에
-- sha256 해시만 남기고, 검증할 때 같은 방식으로 해시해 비교합니다.
-- dev 스키마에 pgcrypto가 있으므로 digest(token, 'sha256')을 그대로 쓸 수 있습니다.
CREATE TABLE user_refresh_tokens (
    id bigserial NOT NULL,
    user_id bigint NOT NULL,

    -- sha256 원문 32바이트. 토큰 자체는 어디에도 남기지 않습니다.
    token_hash bytea NOT NULL,

    issued_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamptz NOT NULL,

    -- 회전(rotation) 흔적. 갱신하면 옛 토큰을 폐기하고 새 토큰의 id를 여기 적습니다.
    -- 이미 폐기된 토큰이 다시 들어오면 탈취로 보고 그 계정의 토큰을 전부 폐기합니다.
    revoked_at timestamptz NULL,
    replaced_by bigint NULL,

    -- 어디서 쓰던 세션인지. 이상 징후를 볼 때만 씁니다.
    user_agent varchar(500) NULL,
    ip inet NULL,

    created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT user_refresh_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT uq_user_refresh_tokens_hash UNIQUE (token_hash),
    CONSTRAINT fk_user_refresh_tokens_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_refresh_tokens_replaced_by FOREIGN KEY (replaced_by)
        REFERENCES user_refresh_tokens(id) ON DELETE SET NULL,
    CONSTRAINT ck_user_refresh_tokens_expiry CHECK (expires_at > issued_at)
);

-- 로그인 검증에서 가장 자주 타는 경로입니다.
CREATE INDEX idx_user_refresh_tokens_user ON user_refresh_tokens
    USING btree (user_id, revoked_at, expires_at DESC);
-- 만료분 정리용. 배치나 cron이 주기적으로 지웁니다.
CREATE INDEX idx_user_refresh_tokens_expires ON user_refresh_tokens
    USING btree (expires_at);


COMMIT;

-- =============================================================================
-- 열린 질문 — DB 담당자 확인 필요
-- =============================================================================
--
-- 1. 로그인 수단
--    소셜 로그인만 쓰나요? 그렇다면 provider(kakao/apple/…)와 provider_user_id가
--    필요하고, email은 nullable이 되어야 합니다. 지금 초안은 이메일 유일성을
--    전제로 두었습니다.
--
-- 2. 취향에 가중치를 쓰나요?
--    member_preferences.weight와 preference_updates의 weight_before/after는
--    "강화/약화"를 수치로 남기려고 넣었습니다. 추천 엔진이 가중치 없이
--    유무만 본다면 세 컬럼을 빼고 change_type만 남기면 됩니다.
--
-- 3. 설문을 다시 받나요?
--    지금은 회원당 1건(uq_member_surveys_user)입니다. 재응답 이력을 남겨야
--    한다면 유니크를 풀고 (user_id, answered_at) 정렬로 최신을 쓰거나,
--    member_survey_history를 따로 두는 편이 낫습니다.
--
-- 4. 회원 취향도 임베딩으로 가나요?
--    영화가 bge-m3 벡터를 쓰는데, 회원 취향도 벡터로 만들어 유사도로 매칭한다면
--    member_preferences 대신(또는 함께) member_embeddings가 필요합니다.
--    그 경우 popcorn_movie_embeddings와 같은 모양으로 두면 됩니다.
--
-- 5. 탈퇴 회원의 개인정보
--    withdrawn_at만 남기고 email·nickname을 마스킹할지, 행을 지울지 정해야 합니다.
--    dev 스키마에 pgcrypto가 설치돼 있어 digest()로 해시만 남기는 것도 가능합니다.
--
-- 6. 취향 갱신 배치의 job_name
--    admin은 잠정적으로 'refresh-member-preferences'를 쓰고 있습니다.
--    실제 이름이 정해지면 알려주세요. batch_runs.job_name은 자유 문자열입니다.
--
--
-- 7. 관리자 로그인 방식
--    지금 초안은 이메일 + 비밀번호(password_hash)를 전제로 합니다.
--    사내 SSO를 쓴다면 password_hash를 빼고 provider·provider_user_id를 넣어야 합니다.
--    액세스 15분 + 리프레시 14일 회전은 제안일 뿐이니, 팀 정책이 있으면 알려주세요.
--    ※ 이 항목은 API 명세(docs/openapi.yaml)의 /auth/* 세 엔드포인트와 짝입니다.
--
-- 8. 만료된 리프레시 토큰을 누가 지우나요?
--    user_refresh_tokens는 로그인할 때마다 행이 쌓입니다. DB가 10GB라 방치하면
--    안 됩니다. 취향 갱신 배치에 얹을지, 별도 cron을 둘지 정해야 합니다.
--    DELETE FROM user_refresh_tokens WHERE expires_at < now() - interval '30 days';
--

-- =============================================================================
-- 참고 — admin이 이 스키마를 어떻게 쓰는지
-- =============================================================================
--   회원 목록      members_service (필터: status, joined_at 범위, 이름·이메일 검색)
--   회원 상세 계정  members_service 1건
--   회원 상세 설문  member_surveys
--   회원 상세 감상평 member_reviews + popcorn_movies 조인 (제목 표시)
--   회원 상세 취향  member_preference_updates (최신순)
--   감상평·신고 화면 member_reviews + 신고 수
--   관리자 관리     admins_service (GNB 계정 영역은 /admins/me)
--   로그인·토큰 갱신 users + user_refresh_tokens (/auth/login · /auth/refresh)
--
--   ⚠️ 회원·관리자 조회는 모두 뷰를 쓰세요. 테이블을 직접 읽으면 role 필터를
--      빠뜨릴 수 있고, 그러면 회원 목록에 운영자가 섞입니다.
-- =============================================================================
