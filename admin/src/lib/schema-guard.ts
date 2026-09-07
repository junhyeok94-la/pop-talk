import "server-only";

import { query } from "./db";

/**
 * 어드민이 기대하는 DB 모양이 아직 그대로인지 확인한다.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────────
 *
 * 이 DB는 여러 저장소가 함께 쓴다. 어드민(pop_talk), 파이썬 WAS
 * (pop_talk_was), 배치가 같은 테이블을 만진다. 하루에 두 번 조용히 깨졌다.
 *
 *   movie_categories.aliases   WAS의 015가 의미 검색용 어구로 덮어씀
 *                              → 어드민의 자동 분류가 343편 → 124편
 *   onboarding_profiles        WAS가 취향을 users 컬럼으로 옮기며 테이블 삭제
 *                              → 회원 상세의 설문이 항상 빈 채로 표시
 *
 * 둘 다 **오류가 보이지 않았다.** query()가 실패를 null로 삼키고, 화면은
 * 그 null을 "데이터 없음"으로 그렸기 때문이다. 그 설계 자체는 맞다 — DB가
 * 없어도 목 데이터로 돌아야 한다. 다만 "없는 것"과 "사라진 것"이 화면에서
 * 똑같아 보이는 것이 문제다.
 *
 * 그래서 기동 시 한 번 물어보고, 어긋나면 GNB에 띄운다.
 *
 * ── 무엇을 확인하나 ───────────────────────────────────────────────────────
 *
 * 테이블과 컬럼의 **존재**만 본다. 값이나 타입은 보지 않는다 — 그건 쿼리가
 * 알아서 실패하고, 여기서 다 검사하려 들면 스키마가 조금만 움직여도
 * 거짓 경고가 뜬다. 사라진 것만 잡아도 오늘 겪은 두 사고는 둘 다 걸린다.
 *
 * 목록은 어드민이 실제로 SELECT/UPDATE 하는 것만 적는다. 여기 없는 컬럼이
 * 사라지는 것은 우리 문제가 아니다.
 */

/** 어드민이 읽거나 쓰는 테이블과, 그중 없으면 곤란한 컬럼. */
const EXPECTED: { table: string; columns: string[]; usedBy: string }[] = [
  {
    table: "popcorn_movies",
    columns: [
      "id", "title_ko", "genres", "source_keywords", "poster_url", "plot",
      "approval_status", "service_status", "approved_by", "approved_at",
      "rejection_reason", "viewing_grade", "source_synced_at",
    ],
    usedBy: "영화 검수 · 영화 상세",
  },
  {
    table: "popcorn_movies_service",
    columns: ["id", "is_embedded", "media"],
    usedBy: "영화 목록(뷰)",
  },
  {
    table: "movie_categories",
    /*
     * match_keywords가 자동 분류의 유일한 수단이다. 사라지면 분류가 통째로
     * 멈춘다. aliases는 WAS 것이라 우리가 읽기만 하지만, 013 전까지 우리가
     * 쓰던 칸이라 함께 지켜본다.
     */
    columns: ["id", "code", "name", "type", "aliases", "match_keywords", "sort_order", "is_active"],
    usedBy: "카테고리 관리 · 자동 분류",
  },
  {
    table: "movie_category_links",
    columns: ["movie_id", "category_id"],
    usedBy: "영화 상세의 카테고리 지정",
  },
  {
    table: "display_categories",
    columns: ["id", "name", "short_label", "category_codes", "sort_order", "is_active"],
    usedBy: "화면 문구 관리",
  },
  {
    table: "display_categories_service",
    columns: ["id", "category_names", "unknown_codes", "movie_count"],
    usedBy: "화면 문구 목록(뷰)",
  },
  {
    table: "reviews",
    // source_system은 WAS의 008이 넣은 칸이다. 우리는 읽기만 하지만 목록의
    // 출처 열이 이것 하나에 매달려 있어, 사라지면 열이 통째로 빈다.
    columns: ["id", "user_id", "movie_id", "rating", "content", "status", "source_system"],
    usedBy: "감상평 관리",
  },
  {
    table: "users",
    // onboarding_* 둘은 WAS가 옮겨 온 자리다. 또 옮겨가면 회원 화면이 빈다.
    columns: [
      "id", "email", "nickname", "status", "created_at", "last_login_at",
      "onboarding_status", "onboarding_movie_category_ids",
    ],
    usedBy: "회원 관리 · 회원 상세",
  },
  {
    table: "batch_runs",
    columns: ["id", "job_name", "status", "scheduled_for"],
    usedBy: "대시보드의 수집 이력",
  },
  {
    table: "popcorn_movie_embeddings",
    columns: ["movie_id", "status", "embedding_model"],
    usedBy: "영화 상세의 추천 임베딩",
  },
];

/** 어긋난 것 하나. 테이블이 통째로 없으면 columns가 빈 배열이다. */
export type SchemaDrift = {
  table: string;
  /** 테이블 자체가 없는가 */
  missingTable: boolean;
  /** 있지만 빠진 컬럼들 */
  missingColumns: string[];
  usedBy: string;
};

/**
 * 한 번의 조회로 전부 확인한다.
 *
 * 테이블마다 물어보면 왕복이 열 번이다. information_schema에서 우리가
 * 관심 있는 테이블의 컬럼을 통째로 받아 메모리에서 맞춰 본다.
 *
 * 뷰도 함께 잡으려고 information_schema.columns를 쓴다 — 이 뷰는 테이블과
 * 뷰를 구분하지 않고 둘 다 담는다.
 *
 * DB가 없으면 null. 그때는 목 데이터로 도는 중이라 검사할 대상이 없다.
 */
export async function checkSchema(): Promise<SchemaDrift[] | null> {
  const rows = await query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'dev' AND table_name = ANY($1::text[])`,
    [EXPECTED.map((e) => e.table)],
  );
  if (rows === null) return null;

  const found = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = found.get(r.table_name) ?? new Set<string>();
    set.add(r.column_name);
    found.set(r.table_name, set);
  }

  const drift: SchemaDrift[] = [];
  for (const e of EXPECTED) {
    const cols = found.get(e.table);
    if (!cols) {
      drift.push({ table: e.table, missingTable: true, missingColumns: [], usedBy: e.usedBy });
      continue;
    }
    const missing = e.columns.filter((c) => !cols.has(c));
    if (missing.length > 0) {
      drift.push({ table: e.table, missingTable: false, missingColumns: missing, usedBy: e.usedBy });
    }
  }
  return drift;
}
