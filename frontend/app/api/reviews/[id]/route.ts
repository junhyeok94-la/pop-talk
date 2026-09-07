import { NextResponse } from "next/server";
import { getAuthSession, getWasOrigin } from "@/lib/auth/server";
import { errorMessage, readUpstream } from "@/lib/auth/route-utils";

type Ctx = { params: Promise<{ id: string }> };

/** 내 리뷰 수정 → WAS PATCH /reviews/{id} */
export async function PATCH(request: Request, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { id } = await params;

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "평점과 리뷰를 확인해주세요." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const rating = Number(input.rating);
  if (
    !Number.isFinite(rating) ||
    rating < 0.5 ||
    rating > 5 ||
    typeof input.content !== "string" ||
    input.content.trim().length < 1
  ) {
    return NextResponse.json({ error: "평점과 리뷰 내용을 확인해주세요." }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${getWasOrigin()}/reviews/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({
        rating,
        content: input.content.trim(),
        contains_spoiler: Boolean(input.contains_spoiler),
      }),
      cache: "no-store",
    });
    const data = await readUpstream(upstream);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: errorMessage(data, "리뷰를 수정하지 못했습니다.") },
        { status: upstream.status },
      );
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "리뷰 서버에 연결할 수 없습니다." }, { status: 502 });
  }
}

/** 내 리뷰 삭제 → WAS DELETE /reviews/{id} */
export async function DELETE(_request: Request, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { id } = await params;

  try {
    const upstream = await fetch(`${getWasOrigin()}/reviews/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.token}` },
      cache: "no-store",
    });
    if (!upstream.ok) {
      const data = await readUpstream(upstream);
      return NextResponse.json(
        { error: errorMessage(data, "리뷰를 삭제하지 못했습니다.") },
        { status: upstream.status },
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "리뷰 서버에 연결할 수 없습니다." }, { status: 502 });
  }
}
