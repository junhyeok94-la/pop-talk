import { NextResponse } from "next/server";

import { mutate } from "@/lib/db";
import {
  SHORT_LABEL_MAX,
  findDisplayCategory,
  findUnknownCodes,
  normalizeCategoryCodes,
  normalizeShortLabel,
} from "@/lib/display-categories";

/**
 * PATCH  /admin-api/display-categories/:id — 수정 (활성 토글 포함)
 * DELETE /admin-api/display-categories/:id — 삭제
 *
 * 문구에는 code가 없다. id가 불변 유일 키다(011) — 문구의 정체가 "어떤
 * 카테고리들을 묶는가"로 바뀌면서 code가 설 자리를 잃었다.
 *
 * 카테고리(category_codes)는 바꿀 수 있다. "이 문구가 무엇을 묶는가"라서
 * 잘못 골랐으면 고칠 수 있어야 한다.
 */

export const dynamic = "force-dynamic";

const problem = (status: number, title: string, detail?: string) =>
  NextResponse.json({ title, detail, status }, { status });

type Body = {
  name?: unknown;
  short_label?: unknown;
  /** 쉼표로 구분한 문자열도, 배열도 받는다. */
  category_codes?: unknown;
  description?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
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
  if (id === null) return problem(422, "문구 id가 올바르지 않습니다", `id=${raw}`);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return problem(400, "본문을 읽을 수 없습니다");
  }

  // 부분 수정이다. 보낸 것만 바꾼다 — 활성 토글은 is_active 하나만 보낸다.
  const sets: string[] = [];
  const values: unknown[] = [id];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    sets.push(`${sql} = $${values.length}`);
  };

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return problem(422, "문구가 필요합니다");
    add("name", name);
  }

  /*
   * 짧은 이름은 비울 수 있다 — 알약에서 내리는 방법이다. 그래서 빈 값을
   * 오류로 보지 않고 null로 저장한다("보내지 않음"과 "비움"은 다르고,
   * 여기서는 body에 키가 있느냐로 구분한다).
   */
  if (body.short_label !== undefined) {
    const shortLabel = normalizeShortLabel(body.short_label);
    if (shortLabel !== null && shortLabel.length > SHORT_LABEL_MAX) {
      return problem(422, "짧은 이름이 너무 깁니다", `${SHORT_LABEL_MAX}자 이내`);
    }
    add("short_label", shortLabel);
  }

  /*
   * 카테고리는 통째로 갈아끼운다. 부분 수정(하나만 빼기)은 화면이 목록 전체를
   * 보내므로 필요 없고, 배열을 부분 수정하면 순서가 뒤엉킨다.
   *
   * 실재 확인은 여기서도 한다 — 배열에 FK가 없어 DB가 막아 주지 않는다(011).
   */
  if (body.category_codes !== undefined) {
    const codes = normalizeCategoryCodes(body.category_codes);
    if (codes.length === 0) {
      return problem(422, "카테고리를 하나 이상 고르세요", "이 문구가 무엇을 묶는지 정해야 합니다.");
    }
    const unknown = await findUnknownCodes(codes);
    if (unknown === null) return problem(503, "DB에 연결되어 있지 않습니다");
    if (unknown.length > 0) {
      return problem(422, "없는 카테고리입니다", unknown.join(", "));
    }
    add("category_codes", codes);
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

  if (sets.length === 0) return problem(422, "바꿀 내용이 없습니다");

  const admin = typeof body.admin === "string" && body.admin.trim() ? body.admin.trim() : null;
  values.push(admin);
  sets.push(`updated_by = $${values.length}`);

  const result = await mutate<{ id: number }>(
    `UPDATE dev.display_categories
        SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id::int AS id`,
    values,
  );

  if (!result.ok) {
    if (result.reason === "no-db") return problem(503, "DB에 연결되어 있지 않습니다");
    return problem(500, "문구를 저장하지 못했습니다", result.detail);
  }
  if (result.rows.length === 0) {
    return problem(404, "문구를 찾을 수 없습니다", `id=${id}`);
  }

  // 뷰에서 다시 읽는다. 카테고리 이름과 영화 수는 UPDATE가 주지 않는다.
  return NextResponse.json(
    { category: await findDisplayCategory(id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await params;
  const id = parseId(raw);
  if (id === null) return problem(422, "문구 id가 올바르지 않습니다", `id=${raw}`);

  /*
   * 문구에는 영화가 직접 붙지 않는다(008에서 연결 테이블을 걷어냈다).
   * 담기는 영화는 카테고리가 정하므로, 문구를 지워도 잃는 연결이 없다.
   * 카테고리 삭제와 달리 막을 것이 없다.
   */
  const result = await mutate<{ id: number }>(
    `DELETE FROM dev.display_categories WHERE id = $1 RETURNING id::int AS id`,
    [id],
  );

  if (!result.ok) {
    if (result.reason === "no-db") return problem(503, "DB에 연결되어 있지 않습니다");
    return problem(500, "문구를 지우지 못했습니다", result.detail);
  }
  if (result.rows.length === 0) {
    return problem(404, "문구를 찾을 수 없습니다", `id=${id}`);
  }

  return NextResponse.json({ id }, { headers: { "Cache-Control": "no-store" } });
}
