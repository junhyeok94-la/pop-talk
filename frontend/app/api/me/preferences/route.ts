import { NextResponse } from "next/server";
import { getAuthSession, getWasOrigin } from "@/lib/auth/server";
import { errorMessage, readUpstream } from "@/lib/auth/route-utils";

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const upstream = await fetch(`${getWasOrigin()}/me/preferences`, {
      headers: { Authorization: `Bearer ${session.token}` },
      cache: "no-store",
    });
    const data = await readUpstream(upstream);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: errorMessage(data, "취향 정보를 불러오지 못했습니다.") },
        { status: upstream.status },
      );
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "취향 정보 서버에 연결할 수 없습니다." }, { status: 502 });
  }
}
