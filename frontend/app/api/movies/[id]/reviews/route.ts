import { NextResponse } from "next/server";
import { getWasOrigin } from "@/lib/auth/server";
import { errorMessage, readUpstream } from "@/lib/auth/route-utils";

const PAGE_SIZE = 5;

export async function GET(request: Request, context: RouteContext<"/api/movies/[id]/reviews">) {
  const { id } = await context.params;
  const movieId = Number(id);
  const requestedPage = Number(new URL(request.url).searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  if (!Number.isInteger(movieId) || movieId < 1) {
    return NextResponse.json({ error: "올바른 영화 ID가 필요합니다." }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      `${getWasOrigin()}/movies/${movieId}/reviews?page=${page}&size=${PAGE_SIZE}`,
      { cache: "no-store" },
    );
    const data = await readUpstream(upstream);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: errorMessage(data, "리뷰 목록을 불러오지 못했습니다.") },
        { status: upstream.status },
      );
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "리뷰 서버에 연결할 수 없습니다." }, { status: 502 });
  }
}
