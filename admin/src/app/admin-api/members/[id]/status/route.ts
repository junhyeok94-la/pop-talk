import { NextResponse } from "next/server";

import { mutate } from "@/lib/db";

/**
 * PATCH /admin-api/members/:id/status — 회원 이용 상태
 *
 * 정지시키면 실제로 서비스를 못 쓰게 된다. WAS가 로그인과 토큰 갱신 두 곳에서
 * 이 값을 본다 —
 *
 *   if user["status"] != "ACTIVE":
 *       raise ProblemError(403, "Account Unavailable", ...)
 *
 * 이미 로그인해 있던 사람도 토큰을 갱신하는 순간 끊긴다. 화면에만 표시되는
 * 값이 아니다.
 *
 * **admin이 유일하게 이 값을 쓰는 쪽이다.** WAS·apps/api 어디에도 회원 상태를
 * 바꾸는 경로가 없어, 두 곳이 같은 컬럼에 쓰며 부딪힐 일이 없다. 상태값도
 * WAS의 MemberStatus와 같은 말을 쓴다.
 */

export const dynamic = "force-dynamic";

/**
 * 탈퇴(WITHDRAWN)는 받지 않는다.
 *
 * 탈퇴는 회원 본인이 하는 일이고 WAS에도 그 경로가 없다. 운영자가 하는 것은
 * 정지다. 감상평에서 관리자 삭제를 뺀 것과 같은 판단 — 운영자가 하는 판단은
 * "쓰게 할 것인가"이지 계정을 없애는 것이 아니다.
 *
 * DB는 WITHDRAWN도 허용하므로(users.status의 CHECK) 회원 본인 탈퇴가 생기면
 * 그 경로에서 쓰면 된다.
 */
const ALLOWED = ["ACTIVE", "SUSPENDED"] as const;
type Status = (typeof ALLOWED)[number];

/** dev.users.id는 uuid다. 영화(정수 id)와 다르다. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const problem = (status: number, title: string, detail?: string) =>
  NextResponse.json({ title, detail, status }, { status });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID.test(id)) {
    return problem(422, "회원 id가 올바르지 않습니다", `id=${id}`);
  }

  let body: { status?: unknown };
  try {
    body = (await request.json()) as { status?: unknown };
  } catch {
    return problem(400, "본문을 읽을 수 없습니다");
  }

  const raw = typeof body.status === "string" ? body.status.toUpperCase() : "";
  if (!ALLOWED.includes(raw as Status)) {
    return problem(
      422,
      "상태가 올바르지 않습니다",
      raw === "WITHDRAWN"
        ? "탈퇴는 회원 본인이 하는 처리입니다."
        : ALLOWED.join(" | "),
    );
  }
  const status = raw as Status;

  /*
   * 이미 탈퇴한 회원은 건드리지 않는다. 지금은 탈퇴 경로가 없어 걸릴 일이
   * 없지만, 생겼을 때 정지가 탈퇴를 덮어쓰지 않게 미리 막는다.
   *
   * deleted_at이 있는 회원도 뺀다 — 지워진 계정을 되살리는 것은 다른 판단이다.
   */
  const result = await mutate<{ id: string; status: string }>(
    `UPDATE dev.users
        SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND deleted_at IS NULL
        AND status <> 'WITHDRAWN'
      RETURNING id, status`,
    [id, status],
  );

  if (!result.ok) {
    if (result.reason === "no-db") {
      return problem(
        503,
        "DB에 연결되어 있지 않습니다",
        "회원 상태를 저장할 수 없습니다. 서버에 DATABASE_URL이 필요합니다.",
      );
    }
    return problem(500, "회원 상태를 저장하지 못했습니다", result.detail);
  }

  if (result.rows.length === 0) {
    /*
     * 없는 회원인지, 탈퇴·삭제된 회원이라 걸러진 것인지 구분해 알린다.
     * 둘 다 0행으로 오지만 화면에 할 말이 다르다.
     */
    const found = await mutate<{ status: string; deleted: boolean }>(
      `SELECT status, deleted_at IS NOT NULL AS deleted FROM dev.users WHERE id = $1`,
      [id],
    );
    if (found.ok && found.rows.length > 0) {
      return problem(
        409,
        "상태를 바꿀 수 없는 회원입니다",
        found.rows[0].deleted ? "삭제된 계정입니다." : "탈퇴한 회원입니다.",
      );
    }
    return problem(404, "회원을 찾을 수 없습니다", `id=${id}`);
  }

  return NextResponse.json(
    { id, status: result.rows[0].status },
    { headers: { "Cache-Control": "no-store" } },
  );
}
