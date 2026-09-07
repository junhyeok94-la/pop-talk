import "server-only";

import { query } from "./db";
import type { Category } from "./mock";

/**
 * 화면 문구(display_categories)를 읽고 쓰는 자리. 서비스 홈의 알약이다.
 *
 * 문구 하나가 카테고리를 **여럿** 가리킨다(마이그레이션 011).
 *
 *   category_codes = {ADAPTED, TRUE_STORY, WITH_FAMILY}
 *
 * 배열이라 FK가 없다. DB는 이 글자가 실제 카테고리인지 모른다 — 오타도,
 * 없는 코드도, 카테고리를 지운 뒤 남은 죽은 코드도 그냥 저장된다.
 * **그래서 이 파일이 대신 검사한다**(findUnknownCodes·countPhrasesUsing).
 *
 * DB가 하는 것과 달리 검사와 실행 사이에 틈이 있다. 두 사람이 동시에
 * 작업하면 통과하고도 깨질 수 있다. 그래서 뷰가 unknown_codes를 함께 주어,
 * 그래도 죽은 코드가 생기면 화면이 바로 드러낸다.
 *
 * 문구 자체에는 code가 없다. id가 불변 유일 키다.
 */

/**
 * 뷰에서 읽는다. 카테고리 이름·영화 수·죽은 코드를 붙여 준다.
 *
 * movie_count는 묶은 카테고리들의 영화 **합집합**이다. 교집합이 아닌 이유 —
 * 상황(SITUATION) 카테고리는 별칭이 없어 0편이라, 교집합으로 세면 상황을
 * 하나라도 묶는 순간 무조건 0이 된다.
 */
const COLUMNS = `
  -- id는 BIGSERIAL이라 드라이버가 문자열로 준다. 화면 타입은 number다.
  id::int AS id,
  -- name은 알약을 누르면 입력창에 채워지는 문장, short_label은 버튼에
  -- 보이는 짧은 이름이다. 둘의 요구가 반대라 칸을 나눴다(009).
  name, short_label,
  category_codes, category_names, unknown_codes,
  description, sort_order, is_active, movie_count,
  created_by, updated_by,
  to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
  to_char(updated_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS updated_at
`;

/**
 * 짧은 이름을 다듬는다.
 *
 * 빈 문자열과 공백만 든 값은 null로 만든다 — DB의 CHECK가 공백만 든 값을
 * 막고, "정하지 않았다"는 뜻은 null이 정직하다. 그래야 알약 목록에서
 * "short_label IS NOT NULL" 한 줄로 걸러진다.
 */
export function normalizeShortLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** DB 컬럼 길이와 같다. 넘으면 500이 나므로 API에서 먼저 막는다. */
export const SHORT_LABEL_MAX = 20;

/**
 * sort_order로만 정렬한다.
 *
 * 앞에 category_type을 두었더니 운영자가 정한 순서를 분류가 덮어썼다 —
 * 1~7로 매겨 놓아도 MOOD가 THEME 앞으로 올라와 6·7·1·2·3·4·5로 보였다.
 * 화면에 순서 칸이 있는데 그것으로 순서를 바꿀 수 없으면 칸이 거짓말을 한다.
 *
 * 같은 순서를 두 문구가 가질 수 있어(UNIQUE 제약이 없다) id로 한 번 더
 * 갈라 준다. 그래야 새로고침마다 자리가 바뀌지 않는다.
 */
export async function listDisplayCategories(): Promise<Category[] | null> {
  return query<Category>(
    `SELECT ${COLUMNS} FROM dev.display_categories_service
      ORDER BY sort_order, id`,
  );
}

export async function findDisplayCategory(id: number): Promise<Category | null> {
  const rows = await query<Category>(
    `SELECT ${COLUMNS} FROM dev.display_categories_service WHERE id = $1`,
    [id],
  );
  return rows?.[0] ?? null;
}

/**
 * 카테고리 코드 목록을 다듬는다.
 *
 * 화면은 쉼표로 구분한 한 줄을 보내고, 배열로도 보낼 수 있다. 양쪽 다 받는다.
 *
 * 대문자로 올린다 — 카테고리 code가 대문자·숫자·밑줄이라 운영자가 소문자로
 * 적었다고 없는 코드 취급하면 억울하다. 중복은 없앤다. 순서는 적은 대로
 * 지킨다 — 화면에 그 순서로 보이고 뷰의 category_names도 그 순서를 따른다.
 */
export function normalizeCategoryCodes(raw: unknown): string[] {
  const parts =
    typeof raw === "string"
      ? raw.split(",")
      : Array.isArray(raw)
        ? raw.map((x) => (typeof x === "string" ? x : ""))
        : [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const code = part.trim().toUpperCase();
    if (code === "" || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/**
 * 없는 카테고리 코드를 찾아 돌려준다. 비어 있으면 전부 실재한다는 뜻이다.
 *
 * **FK를 대신하는 검사다.** 011에서 category_codes를 배열로 바꾸면서 DB의
 * 보장이 사라졌다. 저장 직전에 여기로 한 번 거른다.
 *
 * 활성 여부는 보지 않는다 — 꺼 둔 카테고리를 가리키는 것은 운영자의 선택일
 * 수 있고, 그때 영화 수가 0으로 떨어지는 것이 이미 신호다. 여기서 막을 것은
 * "존재하지 않는 것"뿐이다.
 *
 * DB가 없으면 null. 그때는 호출부가 저장을 포기해야 한다 — 검사하지 못한 채
 * 통과시키면 검사가 없는 것과 같다.
 */
export async function findUnknownCodes(codes: string[]): Promise<string[] | null> {
  if (codes.length === 0) return [];
  const rows = await query<{ code: string }>(
    `SELECT x AS code FROM unnest($1::text[]) AS x
      WHERE NOT EXISTS (SELECT 1 FROM dev.movie_categories c WHERE c.code = x)`,
    [codes],
  );
  return rows === null ? null : rows.map((r) => r.code);
}

/**
 * 이 카테고리 코드를 쓰는 문구를 찾는다. 카테고리 삭제를 막는 데 쓴다.
 *
 * 전에는 FK(ON DELETE RESTRICT)가 이 일을 했다. 배열로 바꾸면서 DB가
 * 손을 뗐으므로 카테고리 삭제 API가 지우기 전에 물어본다.
 */
export async function findPhrasesUsing(code: string): Promise<string[] | null> {
  const rows = await query<{ label: string }>(
    `SELECT COALESCE(short_label, left(name, 20)) AS label
       FROM dev.display_categories
      WHERE category_codes @> ARRAY[$1]::text[]
      ORDER BY sort_order, id`,
    [code],
  );
  return rows === null ? null : rows.map((r) => r.label);
}

export { COLUMNS as DISPLAY_CATEGORY_COLUMNS };
