import { NextResponse } from "next/server";

import { mutate } from "@/lib/db";

/**
 * PATCH /admin-api/reviews/:id/status — 감상평 노출 상태
 *
 * 목록의 숨김 버튼이 화면 상태만 바꾸고 있었다. 쪽을 넘기거나 검색어를
 * 고치면 목록을 다시 받아오므로 방금 바꾼 표시가 사라졌다.
 *
 * **숨김과 되돌리기만 다룬다.** 삭제(deleted_at)는 넣지 않았다 — 세 층이
 * 서로 다른 말을 하고 있어서다.
 *
 *   내 명세(openapi.yaml)  ACTIVE · HIDDEN · DELETED + reason
 *   Python WAS             ACTIVE · HIDDEN 둘뿐, 사유 없음
 *   DB                     status(제약 없는 varchar) + deleted_at, 사유 칸 없음
 *
 * 셋이 모두 동의하는 것은 숨김 하나다. 어디에 두든(admin이든 WAS든) 버릴
 * 코드가 없는 범위만 먼저 만든다. 삭제와 사유는 갈 곳이 정해진 뒤에 붙인다.
 */

export const dynamic = "force-dynamic";

/**
 * DB의 status는 제약 없는 varchar(20)다. 오타로 'HIDEN'이 들어가도 DB가
 * 막지 않고, 그러면 그 감상평은 어느 거르기에도 안 잡혀 화면에서 사라진다.
 * DB가 안 막으니 여기서 막는다.
 */
const ALLOWED = ["ACTIVE", "HIDDEN"] as const;
type Status = (typeof ALLOWED)[number];

/** 화면은 NORMAL로 부르고 DB는 ACTIVE로 적는다. 둘 다 받아준다. */
const NORMALIZE: Record<string, Status> = {
  ACTIVE: "ACTIVE",
  NORMAL: "ACTIVE",
  HIDDEN: "HIDDEN",
};

const problem = (status: number, title: string, detail?: string) =>
  NextResponse.json({ title, detail, status }, { status });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  /*
   * reviews.id는 uuid다(영화의 정수 id와 다르다). 모양을 먼저 본다 —
   * 아니면 Postgres가 22P02로 죽고 500이 나간다.
   */
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return problem(422, "감상평 id가 올바르지 않습니다", `id=${id}`);
  }

  let body: { status?: unknown };
  try {
    body = (await request.json()) as { status?: unknown };
  } catch {
    return problem(400, "본문을 읽을 수 없습니다");
  }

  const raw = typeof body.status === "string" ? body.status.toUpperCase() : "";
  const status = NORMALIZE[raw];
  if (!status) {
    return problem(422, "status가 올바르지 않습니다", ALLOWED.join(" | "));
  }

  /*
   * 삭제된 감상평은 건드리지 않는다. 지금은 삭제 경로가 없어 걸릴 일이
   * 없지만, 나중에 생겼을 때 숨김이 삭제를 덮어쓰지 않게 미리 막는다.
   */
  const result = await mutate<{ id: string; status: string }>(
    `UPDATE dev.reviews
        SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, status`,
    [id, status],
  );

  if (!result.ok) {
    if (result.reason === "no-db") {
      return problem(
        503,
        "DB에 연결되어 있지 않습니다",
        "상태를 저장할 수 없습니다. 서버에 DATABASE_URL이 필요합니다.",
      );
    }
    return problem(500, "상태를 저장하지 못했습니다", result.detail);
  }

  if (result.rows.length === 0) {
    return problem(404, "감상평을 찾을 수 없습니다", `id=${id}`);
  }

  // 화면이 쓰는 말로 돌려준다 — DB의 ACTIVE는 화면에서 NORMAL이다.
  return NextResponse.json(
    { id, status: status === "HIDDEN" ? "HIDDEN" : "NORMAL" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
