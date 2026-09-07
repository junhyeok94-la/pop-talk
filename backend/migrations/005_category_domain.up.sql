-- =============================================================================
-- 005 — 카테고리 도메인
--
-- admin의 '카테고리 관리'·'화면 문구 관리' 두 화면이 요구하는 테이블입니다.
-- 이 둘만 실 데이터 없이 목으로 돌고 있었습니다.
--
-- 카테고리가 두 종류라는 점이 이 스키마의 핵심입니다.
--
--   movie_categories    관리자용 내부 분류.  "드라마"·"액션"      (낱말)
--   display_categories  사용자용 추천 문구.  "가족과 둘러앉아…"  (문장)
--
-- 영화에 붙는 것은 display_categories입니다. admin의 영화 상세에서 카테고리를
-- 편집할 때 후보로 뜨는 목록이 이쪽이고(admin-store의 MOCK_CATEGORIES),
-- 목 데이터의 영화도 전부 알약 문구를 들고 있습니다.
--   예) categories: ['근현대사가 궁금해지는 실화·시대극', '심장 쫄깃한 긴장감']
--
-- movie_categories에는 연결 테이블을 두지 않았습니다. 영화에 내부 분류를
-- 붙이는 화면이 아직 없기 때문입니다. 생기면 그때 링크 테이블을 하나 더
-- 추가하면 됩니다.
--
-- 001~004의 규약을 따랐습니다 —
--   · 스키마를 하드코딩하지 않고 search_path의 첫 스키마에 만듭니다 (dev/prd 공용)
--   · BEGIN ... COMMIT으로 감싸고, 스키마가 public이면 즉시 실패시킵니다
--   · 테이블·컬럼 설명을 COMMENT ON으로 남깁니다
--   · 상태·분류는 CHECK 제약으로 값을 고정합니다
--
-- 적용 —
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--        -c "SET search_path TO dev, public" -f migrations/005_category_domain.up.sql
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


-- ── 관리자용 영화 분류 (카테고리 관리 화면) ──────────────────────────────────
-- 관리자가 서비스 기준으로 정리한 분류 축입니다. 장르·분위기·테마·등급 네 종류.
--
-- popcorn_movies.genres(text[])와는 다릅니다. 저쪽은 KOFIC/KMDB에서 수집한
-- 원본 장르 문자열이고, 이 테이블은 관리자가 정리한 서비스 기준입니다.
--
-- 지금은 목록을 관리할 뿐 영화와 잇지 않습니다. 그래서 '영화수'가 없습니다.
CREATE TABLE movie_categories (
    id BIGSERIAL PRIMARY KEY,

    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL CHECK (length(btrim(name)) > 0),
    type VARCHAR(20) NOT NULL
        CHECK (type IN ('GENRE', 'MOOD', 'THEME', 'RATING')),
    description TEXT,

    -- 화면 목록의 정렬 기준. 같은 값이면 code 순으로 보입니다.
    sort_order INTEGER NOT NULL DEFAULT 0,
    -- 끄면 사용자 화면에서 사라집니다.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- 감사 정보. popcorn_movies.approved_by가 varchar(100)이라 형태를 맞췄습니다.
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_movie_categories_code UNIQUE (code)
);

COMMENT ON TABLE movie_categories IS '관리자용 영화 분류 축 (장르·분위기·테마·등급). 아직 영화와 잇지 않는다';
COMMENT ON COLUMN movie_categories.id IS '분류 고유 식별자 (PK)';
COMMENT ON COLUMN movie_categories.code IS '코드. 화면과 API에서 쓰는 불변 키';
COMMENT ON COLUMN movie_categories.name IS '화면에 보이는 이름';
COMMENT ON COLUMN movie_categories.type IS '분류 종류 (GENRE, MOOD, THEME, RATING)';
COMMENT ON COLUMN movie_categories.description IS '이 분류가 무엇인지에 대한 설명';
COMMENT ON COLUMN movie_categories.sort_order IS '목록 정렬 순서';
COMMENT ON COLUMN movie_categories.is_active IS '사용 여부. 끄면 사용자 화면에서 숨김';
COMMENT ON COLUMN movie_categories.created_by IS '등록한 관리자';
COMMENT ON COLUMN movie_categories.updated_by IS '마지막으로 수정한 관리자';
COMMENT ON COLUMN movie_categories.created_at IS '등록 일시';
COMMENT ON COLUMN movie_categories.updated_at IS '마지막 수정 일시. 트리거가 자동 갱신';

CREATE INDEX idx_movie_categories_active_sort
    ON movie_categories (is_active, sort_order, code);
CREATE INDEX idx_movie_categories_type ON movie_categories (type);

CREATE TRIGGER trg_movie_categories_updated_at BEFORE UPDATE
    ON movie_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 사용자 화면 문구 (화면 문구 관리) ────────────────────────────────────────
-- 사용자 앱의 알약(pill) 문구입니다. 어떤 장르인지가 아니라 어떤 상황인지를
-- 말합니다. 예) "가족과 둘러앉아 함께 볼 영화"
--
-- 두 축이 있습니다 (기획 문서 '온보딩 설문 & 추천 카테고리 설계' 기준).
--   SITUATION : 언제·누구와 보는가
--   TASTE     : 어떤 것을 좋아하는가
--
-- 영화가 실제로 붙는 대상입니다. 아래 연결 테이블이 이 표를 가리킵니다.
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

COMMENT ON TABLE display_categories IS '사용자 화면에 보이는 추천 알약 문구. 영화가 붙는 대상';
COMMENT ON COLUMN display_categories.id IS '문구 고유 식별자 (PK)';
COMMENT ON COLUMN display_categories.code IS '코드. 화면과 API에서 쓰는 불변 키';
COMMENT ON COLUMN display_categories.name IS '사용자에게 보이는 문구. 문장형이라 길이를 200으로 둔다';
COMMENT ON COLUMN display_categories.axis IS '축 (SITUATION 상황 · TASTE 취향)';
COMMENT ON COLUMN display_categories.description IS '이 문구가 무엇을 묶는지에 대한 설명';
COMMENT ON COLUMN display_categories.sort_order IS '사용자 화면 노출 순서';
COMMENT ON COLUMN display_categories.is_active IS '사용 여부. 끄면 사용자 화면에서 숨김';
COMMENT ON COLUMN display_categories.created_by IS '등록한 관리자';
COMMENT ON COLUMN display_categories.updated_by IS '마지막으로 수정한 관리자';
COMMENT ON COLUMN display_categories.created_at IS '등록 일시';
COMMENT ON COLUMN display_categories.updated_at IS '마지막 수정 일시. 트리거가 자동 갱신';

CREATE INDEX idx_display_categories_active_sort
    ON display_categories (is_active, sort_order, code);
CREATE INDEX idx_display_categories_axis ON display_categories (axis);

CREATE TRIGGER trg_display_categories_updated_at BEFORE UPDATE
    ON display_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 영화 ↔ 화면 문구 연결 ────────────────────────────────────────────────────
-- admin의 영화 상세에서 카테고리를 체크하면 여기에 쌓입니다.
-- 한 영화에 문구 여럿, 한 문구에 영화 여럿이라 다대다입니다.
--
-- movie_id는 popcorn_movies(bigint)를 가리킵니다. 관리자가 검수하는 대상이
-- 수집 계층이고, admin이 보는 popcorn_movies_service도 그 위에 서 있습니다.
--
-- 참고 — 사용자 도메인(reviews·user_favorites·watch_history·
-- recommendation_items)은 movies(uuid)를 참조합니다. 두 계층을 잇는 다리가
-- 아직 없어서, 사용자 화면에 이 연결을 노출하려면 그것이 먼저 정리되어야
-- 합니다. 관리자가 붙이는 단계까지는 지금 구조로 문제없습니다.
CREATE TABLE movie_display_category_links (
    movie_id BIGINT NOT NULL REFERENCES popcorn_movies(id) ON DELETE CASCADE,
    display_category_id BIGINT NOT NULL REFERENCES display_categories(id) ON DELETE RESTRICT,

    -- 누가 언제 붙였는지. 자동 분류가 생기면 여기로 구분됩니다.
    assigned_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (movie_id, display_category_id)
);

COMMENT ON TABLE movie_display_category_links IS '영화와 화면 문구의 다대다 연결. 화면 문구의 영화수는 이 표를 센다';
COMMENT ON COLUMN movie_display_category_links.movie_id IS '대상 영화 (popcorn_movies)';
COMMENT ON COLUMN movie_display_category_links.display_category_id IS '붙인 화면 문구';
COMMENT ON COLUMN movie_display_category_links.assigned_by IS '문구를 붙인 관리자';
COMMENT ON COLUMN movie_display_category_links.created_at IS '붙인 일시';

-- 문구별 영화수를 셀 때 타는 경로입니다.
CREATE INDEX idx_movie_display_category_links_category
    ON movie_display_category_links (display_category_id);

-- ON DELETE RESTRICT를 쓴 이유 —
-- 명세가 "연결된 영화가 있으면 카테고리 삭제 409"를 약속합니다.
-- CASCADE로 두면 문구를 지울 때 연결이 조용히 사라져 그 약속이 깨집니다.
-- 애플리케이션이 먼저 세어 막더라도, DB가 마지막 방어선입니다.


-- ── 조회용 뷰 ────────────────────────────────────────────────────────────────
-- popcorn_movies_service와 같은 역할입니다. 화면이 매번 집계 조인을 하지 않도록
-- 영화수를 미리 붙입니다. 목록이 수십 건 규모라 뷰로 충분합니다.
--
-- 미리 계산해 두는 것이 아니라 조회할 때마다 셉니다. 규모가 커지면 그때
-- 카운트 컬럼이나 materialized view를 검토하면 됩니다.
CREATE OR REPLACE VIEW display_categories_service AS
SELECT
    d.*,
    COALESCE(l.movie_count, 0)::int AS movie_count
FROM display_categories d
LEFT JOIN (
    SELECT display_category_id, count(*) AS movie_count
      FROM movie_display_category_links
     GROUP BY display_category_id
) l ON l.display_category_id = d.id;

COMMENT ON VIEW display_categories_service IS '화면 문구에 영화수를 붙인 admin 조회용 뷰';

COMMIT;


-- =============================================================================
-- admin이 이 스키마를 어떻게 쓰는지
-- =============================================================================
--   카테고리 관리     movie_categories                (영화수 없음)
--   화면 문구 관리    display_categories_service      (영화수 포함)
--   영화 상세의 분류  movie_display_category_links     체크하면 여기에 쌓인다
--
--   삭제 규칙 — 연결된 영화가 있으면 409. ON DELETE RESTRICT가 DB에서도 막는다.
--
-- 남은 논의
--   · 카테고리 관리 화면에 '영화수' 열이 있는데 movie_categories에는 연결이
--     없다. 화면에서 그 열을 빼거나, 영화에 내부 분류를 붙이는 화면을 만들고
--     링크 테이블을 하나 더 두어야 한다.
--   · movie_categories와 display_categories를 잇나 — 지금은 독립이다.
--   · 사용자 화면 노출 — 연결은 popcorn_movies에 붙는데 사용자 도메인은
--     movies(uuid)를 참조한다. 두 계층을 잇는 다리가 정리되어야 보인다.
-- =============================================================================
