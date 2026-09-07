import { NextResponse } from "next/server";

import { listMembers } from "@/lib/members";

/**
 * GET /admin-api/members — 회원 목록
 *
 * '회원 관리' 화면이 쓴다. 지금까지 목 12명을 보고 있었다.
 *
 * 거르기와 쪽 나누기는 화면에서 한다 — 감상평(2만 건)과 달리 회원은 지금
 * 3명이고, 늘어도 관리자가 훑을 수 있는 규모다. 서버로 옮기는 것은 목록이
 * 화면에 안 담길 만큼 커진 뒤에 해도 늦지 않다.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await listMembers();
  if (items === null) {
    return NextResponse.json(
      {
        title: "DB에 연결되어 있지 않습니다",
        detail: "회원은 실 DB에만 있습니다. 서버에 DATABASE_URL이 필요합니다.",
        status: 503,
      },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { items, source: "db" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
