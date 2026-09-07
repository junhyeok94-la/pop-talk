import { NextResponse } from "next/server";

const CATALOG_ORIGIN = (
  process.env.CATALOG_API_ORIGIN ??
  process.env.WAS_API_ORIGIN ??
  "http://popcorn-private-alb-144239326-fdd5172f3bd6.kr.lb.naverncp.com:3200"
).replace(/\/$/, "");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);

  try {
    const upstream = await fetch(
      `${CATALOG_ORIGIN}/catalog/movies/${encodeURIComponent(id)}`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      },
    );
    const text = await upstream.text();

    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ??
          "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("[catalog-movie-detail] upstream 요청 실패", {
      movieId: id,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "영화 정보를 불러오지 못했습니다." },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
