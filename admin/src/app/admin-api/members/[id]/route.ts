import { NextResponse } from "next/server";

import { findMember, findMemberSurvey, listMemberReviews } from "@/lib/members";

/**
 * GET /admin-api/members/:id — 회원 상세
 *
 * 회원 정보·감상평·온보딩 설문을 한 번에 준다. 화면이 셋을 함께 보여주므로
 * 따로 부르면 왕복이 세 번이 되고, 그 사이에 하나만 늦게 도착해 화면이
 * 덜컹거린다.
 */

export const dynamic = "force-dynamic";

const problem = (status: number, title: string, detail?: string) =>
  NextResponse.json({ title, detail, status }, { status });

/** dev.users.id는 uuid다. 영화(정수 id)와 다르다. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  /*
   * 모양을 먼저 본다. 아니면 Postgres가 22P02로 죽고 500이 나간다 —
   * 잘못된 주소를 친 것은 서버 문제가 아니다.
   */
  if (!UUID.test(id)) {
    return problem(422, "회원 id가 올바르지 않습니다", `id=${id}`);
  }

  const member = await findMember(id);
  if (member === null) {
    /*
     * DB가 없을 때와 회원이 없을 때를 구분한다. 둘 다 null로 오지만
     * 화면에 할 말이 다르다 — 전자는 서버 구성 문제이고 후자는 주소가
     * 틀린 것이다.
     */
    const alive = await listMemberReviews(id);
    if (alive === null) {
      return problem(503, "DB에 연결되어 있지 않습니다", "회원은 실 DB에만 있습니다.");
    }
    return problem(404, "회원을 찾을 수 없습니다", `id=${id}`);
  }

  const [reviews, survey] = await Promise.all([
    listMemberReviews(id),
    findMemberSurvey(id),
  ]);

  return NextResponse.json(
    { member, reviews: reviews ?? [], survey },
    { headers: { "Cache-Control": "no-store" } },
  );
}
