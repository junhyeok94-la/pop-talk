import { NextResponse } from "next/server";

import { mutate, query } from "@/lib/db";
import { MOVIE_COLUMNS } from "@/lib/movies-source";

/**
 * PATCH /admin-api/movies/:id/approval — 영화 인증 판정
 *
 * "영화 검수" 메뉴의 인증·반려가 여기로 온다. 지금까지 판정은 화면 상태만
 * 바꾸고 끝나서, 새로고침하면 되돌아가고 사용자 화면에는 인증 마크가 붙지
 * 않았다. 이 라우트가 그 값을 실제로 원장에 쓴다.
 *
 * **admin이 DB에 쓰는 첫 자리다.** 지금까지는 조회만 했다.
 *
 * 원래 자리는 apps/api다 — fe도 같은 원장을 읽으니까. 다만 apps/api는
 * 조회 엔드포인트만 있고 담당자가 다르다. 관리자 로그인을 MVP에서 뺐기
 * 때문에 그쪽에 열면 인증 없이 아무나 판정할 수 있게 되는 문제도 있다.
 * 그래서 admin 안에 두되, 화면이 부르는 모양은 옮겨도 그대로이도록
 * REST 경로로 만들었다.
 */

export const dynamic = "force-dynamic";

/** 화면이 요청하는 세 가지. DB enum(PENDING·APPROVED·REJECTED)과는 층이 다르다. */
type Action = "APPROVE" | "REJECT" | "RESTORE";

const ACTIONS: Action[] = ["APPROVE", "REJECT", "RESTORE"];

/** 반려 사유 길이. DB는 text라 제한이 없지만 화면과 로그가 감당할 선을 둔다. */
const MAX_REASON = 500;

type Body = {
  action?: unknown;
  reason?: unknown;
  /** 누가 판정했는지. 로그인이 없는 동안 화면이 현재 관리자 이름을 보낸다. */
  admin?: unknown;
};

const problem = (status: number, title: string, detail?: string) =>
  NextResponse.json({ title, detail, status }, { status });

/*
 * 세 판정이 건드리는 컬럼이 서로 다르다.
 *
 * DB의 CHECK 제약 두 가지를 지켜야 한다 —
 *   APPROVED면 approved_at이 반드시 있어야 하고,
 *   REJECTED면 rejection_reason이 비어 있으면 안 된다.
 * 어겨도 DB가 막아주지만, 여기서 먼저 맞춰 500 대신 명확한 응답을 준다.
 */
const SET: Record<Action, string> = {
  APPROVE: `
    approval_status  = 'APPROVED',
    approved_by      = $2,
    approved_at      = CURRENT_TIMESTAMP,
    rejection_reason = NULL`,
  REJECT: `
    approval_status  = 'REJECTED',
    approved_by      = $2,
    rejection_reason = $3`,
  // 반려를 되돌린다. 다시 검수 대기로 보내고 사유를 지운다.
  RESTORE: `
    approval_status  = 'PENDING',
    approved_by      = $2,
    approved_at      = NULL,
    rejection_reason = NULL`,
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return problem(422, "영화 id가 올바르지 않습니다", `id=${rawId}`);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return problem(400, "본문을 읽을 수 없습니다");
  }

  const action = body.action;
  if (typeof action !== "string" || !ACTIONS.includes(action as Action)) {
    return problem(422, "action이 올바르지 않습니다", ACTIONS.join(" | "));
  }

  const admin = typeof body.admin === "string" && body.admin.trim() ? body.admin.trim() : null;

  // 반려는 사유가 있어야 한다. DB의 ck_popcorn_movies_rejection과 같은 규칙이다.
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (action === "REJECT" && !reason) {
    return problem(422, "반려 사유가 필요합니다");
  }
  if (reason.length > MAX_REASON) {
    return problem(422, "반려 사유가 너무 깁니다", `${MAX_REASON}자 이하`);
  }

  /*
   * 바뀐 행을 그대로 돌려준다. 화면이 응답으로 자기 상태를 맞추면
   * 서버가 실제로 무엇을 저장했는지(approved_at 같은 것)와 어긋나지 않는다.
   *
   * 뷰가 아니라 원장에 쓴다 — popcorn_movies_service는 읽기용이다.
   * 다만 돌려줄 때는 화면이 쓰는 모양이어야 하므로 뷰에서 다시 읽는다.
   */
  const result = await mutate<{ id: number }>(
    `UPDATE dev.popcorn_movies
        SET ${SET[action as Action]},
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id`,
    action === "REJECT" ? [id, admin, reason] : [id, admin],
  );

  if (!result.ok) {
    if (result.reason === "no-db") {
      return problem(
        503,
        "DB에 연결되어 있지 않습니다",
        "판정을 저장할 수 없습니다. 서버에 DATABASE_URL이 필요합니다.",
      );
    }
    // 제약 위반(23514)은 요청이 잘못된 것이고, 나머지는 서버 문제다.
    const isConstraint = result.detail.includes("violates check constraint");
    return problem(isConstraint ? 409 : 500, "판정을 저장하지 못했습니다", result.detail);
  }

  if (result.rows.length === 0) {
    return problem(404, "영화를 찾을 수 없습니다", `id=${id}`);
  }

  /*
   * 화면이 쓰는 모양(is_embedded·media 포함)으로 다시 읽어 돌려준다.
   * 여기는 조회라 query()를 쓴다 — 실패해도 판정은 이미 저장됐으므로
   * 오류로 만들지 않고 movie: null로 내린다. 화면은 자기 상태를 유지한다.
   */
  /*
   * 별칭 s를 반드시 붙인다. MOVIE_COLUMNS 안의 하위 질의가 이 행을 s로
   * 가리킨다 — 자동 분류는 s.source_keywords를, 수동 분류는 s.id를 본다.
   *
   * 이 줄에 별칭이 없어 c29b35d(자동 분류 도입) 이후로 조회가 매번
   * "missing FROM-clause entry for table s"로 실패했다. 실패해도 판정은 이미
   * 저장됐으므로 오류를 내지 않고 movie: null로 내리게 해 둔 탓에, 화면은
   * 조용히 옛 상태를 유지했고 아무도 알아채지 못했다.
   */
  const after = await query<Record<string, unknown>>(
    `SELECT ${MOVIE_COLUMNS} FROM dev.popcorn_movies_service s WHERE s.id = $1`,
    [id],
  );

  return NextResponse.json(
    { movie: after?.[0] ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
