import { NextResponse } from "next/server";

import { mutate } from "@/lib/db";
import {
  CATEGORY_COLUMNS,
  CODE_PATTERN,
  TYPES,
  findConflictingAliases,
  listCategories,
  normalizeAliases,
  type CategoryType,
} from "@/lib/movie-categories";
import type { MovieCategory } from "@/lib/mock";

/**
 * GET  /admin-api/movie-categories — 목록
 * POST /admin-api/movie-categories — 생성
 *
 * '카테고리 관리' 화면이 쓴다. 지금까지 등록·수정·삭제가 화면 상태만 바꿔
 * 새로고침하면 되돌아갔다.
 *
 * 왜 admin이 갖는지는 lib/movie-categories.ts에 적었다.
 */

export const dynamic = "force-dynamic";

const problem = (status: number, title: string, detail?: string) =>
  NextResponse.json({ title, detail, status }, { status });

export async function GET() {
  const rows = await listCategories();
  if (rows === null) {
    return problem(
      503,
      "DB에 연결되어 있지 않습니다",
      "카테고리는 실 DB에만 있습니다. 서버에 DATABASE_URL이 필요합니다.",
    );
  }
  return NextResponse.json(
    { items: rows, source: "db" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

type Body = {
  code?: unknown;
  name?: unknown;
  type?: unknown;
  description?: unknown;
  sort_order?: unknown;
  match_keywords?: unknown;
  admin?: unknown;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return problem(400, "본문을 읽을 수 없습니다");
  }

  /*
   * DB 제약을 여기서 먼저 본다. 어기면 DB가 막아주긴 하지만 500으로 나가고,
   * 화면은 무엇이 잘못됐는지 알 수 없다.
   */
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!CODE_PATTERN.test(code)) {
    return problem(422, "코드 형식이 올바르지 않습니다", "대문자·숫자·밑줄 2~50자");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return problem(422, "이름이 필요합니다");

  const type = typeof body.type === "string" ? body.type.toUpperCase() : "";
  if (!TYPES.includes(type as CategoryType)) {
    return problem(422, "분류가 올바르지 않습니다", TYPES.join(" | "));
  }

  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  const rawSort = Number(body.sort_order);
  const sortOrder = Number.isFinite(rawSort) && rawSort >= 0 ? Math.floor(rawSort) : 0;

  const aliases = normalizeAliases(body.match_keywords);
  const admin = typeof body.admin === "string" && body.admin.trim() ? body.admin.trim() : null;

  /*
   * 별칭이 다른 카테고리와 겹치는지 본다. DB가 막지 못하는 부분이라
   * 저장 전에 확인한다 — 겹치면 한 낱말이 두 카테고리로 갈려 분류가 어긋난다.
   */
  const conflicts = await findConflictingAliases(aliases);
  if (conflicts === null) {
    return problem(503, "DB에 연결되어 있지 않습니다");
  }
  if (conflicts.length > 0) {
    return problem(
      409,
      "다른 카테고리가 쓰는 낱말입니다",
      conflicts.map((c) => `${c.alias} → ${c.code}`).join(", "),
    );
  }

  const result = await mutate<MovieCategory>(
    `INSERT INTO dev.movie_categories
       (code, name, type, description, sort_order, match_keywords, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     RETURNING ${CATEGORY_COLUMNS}`,
    [code, name, type, description, sortOrder, aliases, admin],
  );

  if (!result.ok) {
    if (result.reason === "no-db") {
      return problem(503, "DB에 연결되어 있지 않습니다", "카테고리를 저장할 수 없습니다.");
    }
    // code에 UNIQUE 제약이 있다. 중복은 요청이 잘못된 것이지 서버 문제가 아니다.
    if (result.detail.includes("uq_movie_categories_code") || result.detail.includes("duplicate key")) {
      return problem(409, "이미 있는 코드입니다", code);
    }
    return problem(500, "카테고리를 저장하지 못했습니다", result.detail);
  }

  return NextResponse.json(
    { category: result.rows[0] },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
