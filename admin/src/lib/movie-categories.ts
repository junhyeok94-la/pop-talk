import "server-only";

import { query } from "./db";
import type { MovieCategory } from "./mock";

/**
 * 카테고리(movie_categories)를 읽고 쓰는 자리.
 *
 * 두 라우트가 함께 쓴다 — 목록·생성(/) 과 수정·삭제(/[id]).
 * 조회 컬럼과 검증 규칙을 한 곳에 모아 두 곳이 어긋나지 않게 한다.
 *
 * **왜 admin이 갖는가** — Python WAS에 /movie-categories CRUD가 이미 있다.
 * 그런데 그쪽은 aliases를 주고받지 않아, 별칭을 다루려면 WAS를 고쳐야 한다.
 * 별칭 없이는 영화를 카테고리에 자동으로 붙일 수 없고(5,312편을 손으로 붙일
 * 수는 없다), 그러면 온보딩 설문도 화면 문구도 동작하지 않는다.
 * 그래서 admin이 직접 관리한다. WAS가 나중에 aliases를 받게 되면 화면은
 * 그대로 두고 lib/api.ts에서 부르는 곳만 바꾸면 된다.
 */

/** 화면이 쓰는 모양 그대로. sort_order·code 순으로 준다. */
const COLUMNS = `
  -- id는 BIGSERIAL이라 드라이버가 문자열로 준다(자바스크립트 number가 2^53을
  -- 넘는 정수를 못 담기 때문이다). MovieCategory.id는 number라, 여기서 정수로
  -- 맞춰 타입과 실제 값이 어긋나지 않게 한다. 카테고리가 21억 개가 될 일은 없다.
  id::int AS id,
  code, name, type, description, sort_order, is_active, aliases, match_keywords,
  created_by, updated_by,
  to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
  to_char(updated_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS updated_at
`;

/*
 * 타입 목록은 mock.ts가 갖는다. 여기서 다시 세지 않고 가져다 쓴다.
 *
 * 전에는 두 군데에 따로 있었다 — 여기(API 검증용)와 화면(드롭다운용).
 * SITUATION을 더할 때 화면만 고치고 여기를 놓쳐, 운영자가 드롭다운에서
 * '상황'을 고르고 저장하면 422가 나는 상태가 됐다. 화면이 있다고 하는 것을
 * API가 거부하는 건 가장 나쁜 종류의 불일치다.
 *
 * 왜 mock.ts에 두나 — 이 파일은 server-only다. 클라이언트 컴포넌트인 두
 * 화면이 여기서 값을 가져오면 빌드가 깨진다. 그래서 단일 출처는 반드시
 * 클라이언트가 읽을 수 있는 쪽에 있어야 하고, 서버가 그것을 가져와야 한다.
 */
export { CATEGORY_TYPES as TYPES } from "./mock";
export type { CategoryType } from "./mock";

/** code 형식. WAS의 MovieCategoryCreate와 같은 규칙으로 맞췄다. */
export const CODE_PATTERN = /^[A-Z0-9_]{2,50}$/;

/**
 * sort_order로만 정렬한다. 화면 문구 목록과 같은 이유다.
 *
 * 앞에 type을 두었더니 운영자가 정한 순서를 분류가 덮어썼다 — 1~7로
 * 매겨 놓아도 MOOD가 THEME 앞으로 올라와 6·7·1·2·3·4·5로 보였다.
 * 화면에 순서 칸이 있는데 그것으로 순서를 바꿀 수 없으면 칸이 거짓말을 한다.
 *
 * 분류별로 묶어 보는 것은 화면의 요약 카드가 이미 해 준다 — 카드를 누르면
 * 그 분류만 걸러진다. 정렬까지 분류를 우선할 이유가 없다.
 */
export async function listCategories(): Promise<MovieCategory[] | null> {
  return query<MovieCategory>(
    `SELECT ${COLUMNS} FROM dev.movie_categories ORDER BY sort_order, code`,
  );
}

export async function findCategory(id: number): Promise<MovieCategory | null> {
  const rows = await query<MovieCategory>(
    `SELECT ${COLUMNS} FROM dev.movie_categories WHERE id = $1`,
    [id],
  );
  return rows?.[0] ?? null;
}

export { COLUMNS as CATEGORY_COLUMNS };

/**
 * 별칭 목록을 다듬는다.
 *
 * DB는 빈 문자열만 막는다(ck_movie_categories_aliases_no_empty). 공백만 있는
 * 값('  ')은 제약을 통과하는데, 그런 별칭은 어느 영화에도 안 걸리면서 목록에는
 * 보여 "왜 분류가 안 되지"를 찾기 어렵게 만든다. **넣는 쪽에서 다듬는다.**
 *
 * 중복도 여기서 없앤다. 같은 낱말이 두 번 있어도 분류 결과는 같지만,
 * 화면에 두 번 보이는 것은 실수로 읽힌다.
 */
export function normalizeAliases(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const alias = raw.trim();
    if (alias) seen.add(alias);
  }
  return [...seen];
}

/**
 * 이 별칭들을 다른 카테고리가 이미 가져갔는지 본다.
 *
 * DB가 막지 못하는 부분이다 — 배열 원소에 대한 전역 유일 제약을 Postgres가
 * 기본 제공하지 않는다. 겹치면 한 낱말이 두 카테고리로 갈려 분류가 어긋나므로
 * 저장 전에 확인한다.
 *
 * excludeId는 수정할 때 자기 자신을 빼기 위한 것이다.
 */
export async function findConflictingAliases(
  aliases: string[],
  excludeId?: number,
): Promise<{ alias: string; code: string }[] | null> {
  if (aliases.length === 0) return [];
  return query<{ alias: string; code: string }>(
    `SELECT a AS alias, c.code
       FROM dev.movie_categories c, unnest(c.match_keywords) a
      WHERE a = ANY($1::text[])
        AND ($2::bigint IS NULL OR c.id <> $2)`,
    [aliases, excludeId ?? null],
  );
}
