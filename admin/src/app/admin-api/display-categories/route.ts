import { NextResponse } from "next/server";

import { mutate } from "@/lib/db";
import {
  SHORT_LABEL_MAX,
  findDisplayCategory,
  findUnknownCodes,
  listDisplayCategories,
  normalizeCategoryCodes,
  normalizeShortLabel,
} from "@/lib/display-categories";

/**
 * GET  /admin-api/display-categories — 목록
 * POST /admin-api/display-categories — 생성
 *
 * '화면 문구 관리' 화면이 쓴다. 등록·수정·삭제가 화면 상태만 바꿔
 * 새로고침하면 되돌아갔다 — admin에서 마지막까지 통째로 목이던 화면이다.
 *
 * 문구는 카테고리를 사용자에게 보여주는 말이다. 담기는 영화도 카테고리가
 * 정한다(마이그레이션 008).
 */

export const dynamic = "force-dynamic";

const problem = (status: number, title: string, detail?: string) =>
  NextResponse.json({ title, detail, status }, { status });

export async function GET() {
  const items = await listDisplayCategories();
  if (items === null) {
    return problem(
      503,
      "DB에 연결되어 있지 않습니다",
      "화면 문구는 실 DB에만 있습니다. 서버에 DATABASE_URL이 필요합니다.",
    );
  }
  return NextResponse.json(
    { items, source: "db" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

type Body = {
  name?: unknown;
  short_label?: unknown;
  /** 쉼표로 구분한 문자열도, 배열도 받는다. */
  category_codes?: unknown;
  description?: unknown;
  sort_order?: unknown;
  admin?: unknown;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return problem(400, "본문을 읽을 수 없습니다");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return problem(422, "문구가 필요합니다");

  /*
   * 짧은 이름은 없어도 된다 — 알약으로 쓰지 않는 문구가 있을 수 있다.
   * 길이는 여기서 막는다. DB 컬럼이 VARCHAR(20)이라 넘기면 500이 난다.
   */
  const shortLabel = normalizeShortLabel(body.short_label);
  if (shortLabel !== null && shortLabel.length > SHORT_LABEL_MAX) {
    return problem(422, "짧은 이름이 너무 깁니다", `${SHORT_LABEL_MAX}자 이내`);
  }

  /*
   * 카테고리는 하나 이상 있어야 한다. 없으면 이 문구가 무엇을 묶는지 알 수
   * 없다 — DB의 CHECK도 빈 배열을 막는다.
   *
   * 그리고 **실재하는 코드인지 확인한다.** 배열에는 FK가 없어 DB가 이 일을
   * 해 주지 않는다(011). 확인하지 않으면 오타 하나가 조용히 저장되고,
   * 운영자는 한참 뒤에 "왜 0편이지?"로 발견한다.
   */
  const categoryCodes = normalizeCategoryCodes(body.category_codes);
  if (categoryCodes.length === 0) {
    return problem(422, "카테고리를 하나 이상 고르세요", "이 문구가 무엇을 묶는지 정해야 합니다.");
  }
  const unknown = await findUnknownCodes(categoryCodes);
  if (unknown === null) return problem(503, "DB에 연결되어 있지 않습니다");
  if (unknown.length > 0) {
    return problem(422, "없는 카테고리입니다", unknown.join(", "));
  }

  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;
  const rawSort = Number(body.sort_order);
  const sortOrder = Number.isFinite(rawSort) && rawSort >= 0 ? Math.floor(rawSort) : 0;
  const admin = typeof body.admin === "string" && body.admin.trim() ? body.admin.trim() : null;

  const result = await mutate<{ id: number }>(
    `INSERT INTO dev.display_categories
       (name, short_label, category_codes, description, sort_order, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     RETURNING id::int AS id`,
    [name, shortLabel, categoryCodes, description, sortOrder, admin],
  );

  if (!result.ok) {
    if (result.reason === "no-db") {
      return problem(503, "DB에 연결되어 있지 않습니다", "문구를 저장할 수 없습니다.");
    }
    return problem(500, "문구를 저장하지 못했습니다", result.detail);
  }

  /*
   * 뷰에서 다시 읽어 돌려준다. 카테고리 이름과 영화 수는 INSERT가 주지
   * 않는데 화면이 바로 쓴다.
   */
  const created = await findDisplayCategory(result.rows[0].id);
  return NextResponse.json(
    { category: created },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
