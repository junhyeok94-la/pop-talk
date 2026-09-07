import { NextResponse } from "next/server";

const CATALOG_ORIGIN =
  process.env.CATALOG_API_ORIGIN ??
  process.env.WAS_API_ORIGIN ??
  "http://popcorn-private-alb-144239326-fdd5172f3bd6.kr.lb.naverncp.com:3200";

/**
 * /catalog/movies 프록시 — 제목 검색(q) 지원.
 * 카탈로그 백엔드는 사설/http 라 브라우저 직접 호출 불가 → 서버에서 프록시.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const size = searchParams.get("size") ?? "30";

  const usp = new URLSearchParams({ size });
  if (q) usp.set("q", q);

  try {
    const upstream = await fetch(`${CATALOG_ORIGIN}/catalog/movies?${usp}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "영화 목록을 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
