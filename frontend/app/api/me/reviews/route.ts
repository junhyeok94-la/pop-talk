import { NextResponse } from "next/server";
import { getAuthSession, getWasOrigin } from "@/lib/auth/server";
import { errorMessage, readUpstream } from "@/lib/auth/route-utils";
import { getMovieDetail } from "@/lib/api";
import { moviePoster } from "@/lib/movie-view";

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const upstream = await fetch(`${getWasOrigin()}/me/reviews`, {
      headers: { Authorization: `Bearer ${session.token}` },
      cache: "no-store",
    });
    const data = await readUpstream(upstream);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: errorMessage(data, "내 리뷰를 불러오지 못했습니다.") },
        { status: upstream.status },
      );
    }
    await enrichWithMovies(data);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "리뷰 서버에 연결할 수 없습니다." }, { status: 502 });
  }
}

/**
 * 리뷰 응답의 movie_id 를 공개 영화 API(API_ORIGIN)로 조회해
 * movie_title · movie_poster 를 각 항목에 붙인다. (개별 실패는 무시하고 id 폴백)
 */
async function enrichWithMovies(data: Record<string, unknown>) {
  const items = Array.isArray(data.items)
    ? (data.items as Array<Record<string, unknown>>)
    : null;
  if (!items || items.length === 0) return;

  const ids = [
    ...new Set(
      items
        .map((r) => r.movie_id)
        .filter((v): v is number | string => v !== null && v !== undefined),
    ),
  ];

  const byId = new Map<string, { title: string; poster: string | null }>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const movie = await getMovieDetail(id);
        byId.set(String(id), { title: movie.title_ko, poster: moviePoster(movie) });
      } catch {
        /* 영화 조회 실패 시 해당 항목은 id 폴백으로 표시 */
      }
    }),
  );

  for (const review of items) {
    const found = byId.get(String(review.movie_id));
    if (found) {
      review.movie_title = found.title;
      review.movie_poster = found.poster;
    }
  }
}
