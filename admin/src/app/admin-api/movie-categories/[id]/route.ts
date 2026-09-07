import { NextResponse } from "next/server";

import { mutate } from "@/lib/db";
import {
  CATEGORY_COLUMNS,
  findCategory,
  findConflictingAliases,
  normalizeAliases,
} from "@/lib/movie-categories";
import { findPhrasesUsing } from "@/lib/display-categories";
import type { MovieCategory } from "@/lib/mock";

/**
 * PATCH  /admin-api/movie-categories/:id — 수정 (활성 토글 포함)
 * DELETE /admin-api/movie-categories/:id — 삭제
 *
 * code와 type은 바꾸지 않는다. 둘은 이 카테고리의 정체다 — code는 회원 취향과
 * 영화 분류에 저장되는 값이고, type은 어느 설문 문항에 속하는지를 정한다.
 * 바꿔야 할 상황이면 새로 만들고 옛것을 비활성으로 두는 편이 안전하다.
 * (WAS의 MovieCategoryUpdate도 같은 판단으로 name·description·sort_order·
 * is_active만 받는다.)
 */

export const dynamic = "force-dynamic";

const problem = (status: number, title: string, detail?: string) =>
  NextResponse.json({ title, detail, status }, { status });

type Body = {
  name?: unknown;
  description?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
  match_keywords?: unknown;
  admin?: unknown;
};

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await params;
  const id = parseId(raw);
  if (id === null) return problem(422, "카테고리 id가 올바르지 않습니다", `id=${raw}`);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return problem(400, "본문을 읽을 수 없습니다");
  }

  /*
   * 부분 수정이다. 보낸 것만 바꾼다 — 활성 토글은 is_active 하나만 보내고,
   * 그때 name까지 덮어쓰면 안 된다.
   */
  const sets: string[] = [];
  const values: unknown[] = [id];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    sets.push(`${sql} = $${values.length}`);
  };

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return problem(422, "이름이 필요합니다");
    add("name", name);
  }

  if (body.description !== undefined) {
    const d = typeof body.description === "string" ? body.description.trim() : "";
    add("description", d || null);
  }

  if (body.sort_order !== undefined) {
    const n = Number(body.sort_order);
    if (!Number.isFinite(n) || n < 0) return problem(422, "노출 순서가 올바르지 않습니다");
    add("sort_order", Math.floor(n));
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") return problem(422, "활성 여부가 올바르지 않습니다");
    add("is_active", body.is_active);
  }

  /*
   * type을 보내면 조용히 무시하지 않고 알린다. 화면이 바꿀 수 있다고 착각한
   * 채로 "저장됐다"를 보는 것이 가장 나쁘다.
   */
  if ("type" in body || "code" in body) {
    return problem(
      422,
      "코드와 분류는 바꿀 수 없습니다",
      "새로 만들고 옛 카테고리를 비활성으로 두세요.",
    );
  }

  if (body.match_keywords !== undefined) {
    const aliases = normalizeAliases(body.match_keywords);
    const conflicts = await findConflictingAliases(aliases, id);
    if (conflicts === null) return problem(503, "DB에 연결되어 있지 않습니다");
    if (conflicts.length > 0) {
      return problem(
        409,
        "다른 카테고리가 쓰는 낱말입니다",
        conflicts.map((c) => `${c.alias} → ${c.code}`).join(", "),
      );
    }
    add("match_keywords", aliases);
  }

  if (sets.length === 0) return problem(422, "바꿀 내용이 없습니다");

  const admin = typeof body.admin === "string" && body.admin.trim() ? body.admin.trim() : null;
  values.push(admin);
  sets.push(`updated_by = $${values.length}`);

  const result = await mutate<MovieCategory>(
    `UPDATE dev.movie_categories
        SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING ${CATEGORY_COLUMNS}`,
    values,
  );

  if (!result.ok) {
    if (result.reason === "no-db") return problem(503, "DB에 연결되어 있지 않습니다");
    return problem(500, "카테고리를 저장하지 못했습니다", result.detail);
  }
  if (result.rows.length === 0) {
    return problem(404, "카테고리를 찾을 수 없습니다", `id=${id}`);
  }

  return NextResponse.json(
    { category: result.rows[0] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await params;
  const id = parseId(raw);
  if (id === null) return problem(422, "카테고리 id가 올바르지 않습니다", `id=${raw}`);

  /*
   * 화면 문구가 이 카테고리를 쓰고 있으면 막는다.
   *
   * **전에는 FK가 이 일을 했다.** display_categories.category_id가
   * ON DELETE RESTRICT였다. 011에서 문구가 카테고리를 여럿 가리키게 되면서
   * 그 자리가 문자열 배열(category_codes)이 됐고, 배열에는 FK를 걸 수 없다.
   * DB가 손을 뗐으므로 여기서 대신 묻는다.
   *
   * 이 검사는 FK보다 약하다 — 묻고 지우는 사이에 다른 사람이 그 카테고리를
   * 쓰는 문구를 만들면 통과하고도 죽은 코드가 남는다. 내부 어드민이라
   * 감수하고, 그래도 생기면 문구 화면이 '없는 카테고리'로 드러낸다.
   */
  const found = await findCategory(id);
  if (found === null) return problem(404, "카테고리를 찾을 수 없습니다", `id=${id}`);

  const usedBy = await findPhrasesUsing(found.code);
  if (usedBy === null) return problem(503, "DB에 연결되어 있지 않습니다");
  if (usedBy.length > 0) {
    return problem(
      409,
      "화면 문구가 쓰는 카테고리입니다",
      `${usedBy.join(", ")} 문구에서 먼저 빼세요.`,
    );
  }

  /*
   * 영화가 붙어 있으면 DB가 막는다 — movie_category_links의 FK가
   * ON DELETE RESTRICT다. 이쪽은 아직 FK가 살아 있어 DB에 맡긴다.
   */
  const result = await mutate<{ id: number }>(
    `DELETE FROM dev.movie_categories WHERE id = $1 RETURNING id`,
    [id],
  );

  if (!result.ok) {
    if (result.reason === "no-db") return problem(503, "DB에 연결되어 있지 않습니다");
    if (result.detail.includes("violates foreign key constraint")) {
      // 문구는 위에서 이미 걸렀다. 여기 오는 것은 영화가 붙어 있는 경우다.
      return problem(
        409,
        "영화가 연결된 카테고리입니다",
        `${found.name}에 붙은 영화를 먼저 해제하세요.`,
      );
    }
    return problem(500, "카테고리를 지우지 못했습니다", result.detail);
  }
  if (result.rows.length === 0) {
    return problem(404, "카테고리를 찾을 수 없습니다", `id=${id}`);
  }

  return NextResponse.json({ id }, { headers: { "Cache-Control": "no-store" } });
}
