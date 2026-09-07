-- =============================================================================
-- 카테고리 도메인 초안 (검토용 — 아직 실행하지 않았습니다)
--
-- admin의 '카테고리 관리'·'화면 문구 관리' 두 화면이 요구하는 테이블입니다.
-- 지금 이 두 화면만 실 데이터 없이 목으로 돌고 있습니다.
--
-- 영화 참조 대상은 popcorn_movies(bigint)로 정해졌습니다 (2026-08-11, 팀 결정).
-- 관리자가 검수하는 대상이 수집 계층이고, admin이 보는 popcorn_movies_service도
-- 그 위에 서 있어서 화면과 데이터가 한 축으로 맞습니다.
--
-- 작성 근거 — pop_talk_batch/migrations 001~004의 규약을 따랐습니다.
--   · 스키마를 하드코딩하지 않고 search_path의 첫 스키마에 만듭니다 (dev/prd 공용)
--   · BEGIN ... COMMIT으로 감싸고, 스키마가 public이면 즉시 실패시킵니다
--   · 테이블·컬럼 설명을 COMMENT ON으로 남깁니다
--   · 상태·분류는 CHECK 제약으로 값을 고정합니다 (004의 chat_role 방식과 동일 취지)
--
-- 화면에서 역산한 것 —
--   카테고리 관리   : 코드·이름·분류·설명·순서·활성·영화수·등록자/일시·수정자/일시
--   화면 문구 관리  : 코드·이름(알약 문구)·축·설명·순서·활성·등록자/일시·수정자/일시
-- =============================================================================

BEGIN;

-- 001~004와 같은 가드입니다. search_path 없이 실행하면 public에 만들어져 버립니다.
DO $$
BEGIN
    IF current_schema() IS NULL OR current_schema() = 'public' THEN
        RAISE EXCEPTION
            'Set search_path to the application schema first (for example: dev, public or prd, public).';
    END IF;
END $$;


-- ── 영화 분류 (카테고리 관리 화면) ────────────────────────────────────────────
-- 관리자가 영화에 붙이는 분류 축입니다. 장르·분위기·테마·등급 네 종류가 있고,
-- 화면에서 이 값으로 필터를 겁니다.
--
-- popcorn_movies.genres(text[])와는 다릅니다. 저쪽은 KOFIC/KMDB에서 수집한
-- 원본 장르 문자열이고, 이 테이블은 관리자가 서비스 기준으로 정리한 분류입니다.
CREATE TABLE movie_categories (
    id BIGSERIAL PRIMARY KEY,

    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL CHECK (length(btrim(name)) > 0),
    type VARCHAR(20) NOT NULL
        CHECK (type IN ('GENRE', 'MOOD', 'THEME', 'RATING')),
    description TEXT,

    -- 화면 목록의 정렬 기준. 같은 값이면 code 순으로 보입니다.
    sort_order INTEGER NOT NULL DEFAULT 0,
    -- 끄면 사용자 화면에서 사라지지만 이미 붙은 연결은 남습니다.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- 감사 정보. popcorn_movies.approved_by가 varchar(100)이라 형태를 맞췄습니다.
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_movie_categories_code UNIQUE (code)
);

COMMENT ON TABLE movie_categories IS '관리자가 영화에 붙이는 분류 축 (장르·분위기·테마·등급)';
COMMENT ON COLUMN movie_categories.id IS '분류 고유 식별자 (PK)';
COMMENT ON COLUMN movie_categories.code IS '코드. 화면과 API에서 쓰는 불변 키';
COMMENT ON COLUMN movie_categories.name IS '화면에 보이는 이름';
COMMENT ON COLUMN movie_categories.type IS '분류 종류 (GENRE, MOOD, THEME, RATING)';
COMMENT ON COLUMN movie_categories.description IS '이 분류가 무엇인지에 대한 설명';
COMMENT ON COLUMN movie_categories.sort_order IS '목록 정렬 순서';
COMMENT ON COLUMN movie_categories.is_active IS '사용 여부. 끄면 사용자 화면에서 숨김';
COMMENT ON COLUMN movie_categories.created_by IS '등록한 관리자';
COMMENT ON COLUMN movie_categories.updated_by IS '마지막으로 수정한 관리자';

CREATE INDEX idx_movie_categories_active_sort
    ON movie_categories (is_active, sort_order, code);
CREATE INDEX idx_movie_categories_type ON movie_categories (type);

CREATE TRIGGER trg_movie_categories_updated_at BEFORE UPDATE
    ON movie_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 영화 ↔ 분류 연결 ─────────────────────────────────────────────────────────
-- 한 영화에 분류 여럿, 한 분류에 영화 여럿이라 다대다입니다.
-- 화면의 '영화수' 열이 이 테이블을 셉니다.
--
-- movie_id는 popcorn_movies(bigint)를 가리킵니다. 관리자가 카테고리를 붙이는
-- 대상이 수집 계층이기 때문입니다. admin 화면도 popcorn_movies_service를 봅니다.
--
-- 참고 — 사용자 도메인(reviews·user_favorites·watch_history·
-- recommendation_items)은 movies(uuid)를 참조합니다. 두 계층을 잇는 다리가
-- 아직 없어서, 사용자 화면에 카테고리를 노출하려면 그 연결이 먼저 정리되어야
-- 합니다. 카테고리 자체는 관리자용이라 지금 구조로 문제없습니다.
CREATE TABLE movie_category_links (
    movie_id BIGINT NOT NULL REFERENCES popcorn_movies(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES movie_categories(id) ON DELETE RESTRICT,

    -- 누가 언제 붙였는지. 자동 분류가 생기면 여기로 구분됩니다.
    assigned_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (movie_id, category_id)
);

COMMENT ON TABLE movie_category_links IS '영화와 분류의 다대다 연결. 화면의 영화수는 이 표를 센다';
COMMENT ON COLUMN movie_category_links.movie_id IS '대상 영화';
COMMENT ON COLUMN movie_category_links.category_id IS '붙인 분류';
COMMENT ON COLUMN movie_category_links.assigned_by IS '분류를 붙인 관리자';

-- 분류별 영화수를 셀 때 타는 경로입니다.
CREATE INDEX idx_movie_category_links_category ON movie_category_links (category_id);

-- ON DELETE RESTRICT를 쓴 이유 —
-- 명세가 "연결된 영화가 있으면 카테고리 삭제 409"를 약속합니다.
-- CASCADE로 두면 분류를 지울 때 연결이 조용히 사라져 그 약속이 깨집니다.
-- 애플리케이션이 먼저 세어 막더라도, DB가 마지막 방어선입니다.


-- ── 사용자 화면 문구 (화면 문구 관리) ────────────────────────────────────────
-- 사용자 앱의 알약(pill) 문구입니다. 영화 분류와는 성격이 다릅니다.
--   movie_categories : 관리자가 영화에 붙이는 분류      (내부 기준)
--   display_categories : 사용자에게 보이는 추천 문구      (표현)
-- 예) "가족과 둘러앉아 함께 볼 영화" — 어떤 장르인지가 아니라 어떤 상황인지를 말합니다.
--
-- 두 축이 있습니다 (기획 문서 '온보딩 설문 & 추천 카테고리 설계' 기준).
--   SITUATION : 언제·누구와 보는가
--   TASTE     : 어떤 것을 좋아하는가
CREATE TABLE display_categories (
    id BIGSERIAL PRIMARY KEY,

    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL CHECK (length(btrim(name)) > 0),
    axis VARCHAR(20) NOT NULL
        CHECK (axis IN ('SITUATION', 'TASTE')),
    description TEXT,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_display_categories_code UNIQUE (code)
);

COMMENT ON TABLE display_categories IS '사용자 화면에 보이는 추천 알약 문구. 영화 분류와 별개 축';
COMMENT ON COLUMN display_categories.code IS '코드. 화면과 API에서 쓰는 불변 키';
COMMENT ON COLUMN display_categories.name IS '사용자에게 보이는 문구. 문장형이라 길이를 200으로 둔다';
COMMENT ON COLUMN display_categories.axis IS '축 (SITUATION 상황 · TASTE 취향)';
COMMENT ON COLUMN display_categories.sort_order IS '사용자 화면 노출 순서';
COMMENT ON COLUMN display_categories.is_active IS '사용 여부. 끄면 사용자 화면에서 숨김';

CREATE INDEX idx_display_categories_active_sort
    ON display_categories (is_active, sort_order, code);
CREATE INDEX idx_display_categories_axis ON display_categories (axis);

CREATE TRIGGER trg_display_categories_updated_at BEFORE UPDATE
    ON display_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 조회용 뷰 ────────────────────────────────────────────────────────────────
-- popcorn_movies_service와 같은 역할입니다. 화면이 매번 집계 조인을 하지 않도록
-- 영화수를 미리 붙입니다. 목록이 수십 건 규모라 뷰로 충분합니다.
CREATE OR REPLACE VIEW movie_categories_service AS
SELECT
    c.*,
    COALESCE(l.movie_count, 0)::int AS movie_count
FROM movie_categories c
LEFT JOIN (
    SELECT category_id, count(*) AS movie_count
      FROM movie_category_links
     GROUP BY category_id
) l ON l.category_id = c.id;

COMMENT ON VIEW movie_categories_service IS '분류에 영화수를 붙인 admin 조회용 뷰';

COMMIT;


-- =============================================================================
-- 정해야 할 것
-- =============================================================================
--
-- 1. [해결됨 2026-08-11] 영화 참조 대상 = popcorn_movies(bigint).
--
-- 2. 마이그레이션 번호를 몇 번으로 할까요?
--    pop_talk_batch/migrations는 004까지입니다. 그런데 실제 DB에는 회원 도메인
--    테이블 9개가 이미 있고 그것을 만든 파일이 어느 저장소에도 없습니다.
--    담당자가 005를 쓰고 계실 수 있어 확인이 필요합니다.
--
-- 3. 사용자 화면에 카테고리를 언제 노출하나요?
--    카테고리는 popcorn_movies에 붙는데 사용자 도메인은 movies를 참조합니다.
--    두 계층을 잇는 다리(수집 → 서비스 이관)가 정리되어야 사용자에게 보일 수
--    있습니다. 관리자 화면만 쓰는 지금 단계에서는 문제없습니다.
--
-- 4. 두 카테고리가 서로 이어지나요?
--    display_categories(사용자 문구)가 movie_categories(내부 분류)로 영화를
--    찾는 구조라면 둘 사이에 연결 테이블이 하나 더 필요합니다.
--    지금은 서로 독립으로 두었습니다 — 화면이 그렇게 되어 있습니다.
--
-- =============================================================================
-- admin이 이 스키마를 어떻게 쓰는지
-- =============================================================================
--   카테고리 관리    movie_categories_service (영화수 포함)
--   화면 문구 관리    display_categories
--   영화 상세의 분류  movie_category_links 조인
--
--   삭제 규칙 — 연결된 영화가 있으면 409. ON DELETE RESTRICT가 DB에서도 막는다.
-- =============================================================================
