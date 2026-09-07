import { NextResponse } from "next/server";
import { getWasOrigin } from "@/lib/auth/server";
import { errorMessage, readUpstream } from "@/lib/auth/route-utils";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "회원가입 정보를 확인해주세요." }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (typeof input.nickname !== "string" || input.nickname.trim().length < 2 || typeof input.email !== "string" || typeof input.password !== "string" || input.password.length < 8) return NextResponse.json({ error: "닉네임, 이메일, 8자 이상의 비밀번호를 확인해주세요." }, { status: 400 });
  const displayCategoryIds = Array.isArray(input.movie_category_ids)
    ? input.movie_category_ids.filter((id): id is number => Number.isInteger(id) && Number(id) > 0)
    : [];
  if (displayCategoryIds.length !== (Array.isArray(input.movie_category_ids) ? input.movie_category_ids.length : 0)) {
    return NextResponse.json({ error: "영화 취향 카테고리 값을 확인해주세요." }, { status: 400 });
  }
  try {
    const upstream = await fetch(`${getWasOrigin()}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname: input.nickname.trim(), email: input.email.trim(), password: input.password, movie_category_ids: displayCategoryIds }), cache: "no-store" });
    const data = await readUpstream(upstream);
    if (!upstream.ok) return NextResponse.json({ error: errorMessage(data, "회원가입에 실패했습니다.") }, { status: upstream.status });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "인증 서버에 연결할 수 없습니다." }, { status: 502 });
  }
}
