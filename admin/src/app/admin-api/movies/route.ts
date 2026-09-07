import { NextResponse } from "next/server";

import { countMovies, listGenres, listMovies, type MovieQuery } from "@/lib/movies-query";

/**
 * GET /admin-api/movies — 영화 목록
 *
 * 검수 화면 둘(서비스 영화·인증완료 영화)이 쓴다.
 *
 * 전에는 layout이 300편만 읽어 스토어에 넣고 화면이 거기서 걸렀다. 5,312편
 * 중 300편만 보였다는 뜻이고, release_date로 잘랐으므로 개봉일이 뒤에 있는
 * 영화는 **아예 나타나지 않았다.**
 *
 * 요약 수치(counts)와 장르 목록을 함께 준다. 화면이 셋을 같은 순간에 쓰고,
 * 따로 부르면 왕복이 세 번이 된다.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;

  const num = (key: string) => {
    const v = Number(p.get(key));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const str = (key: string) => p.get(key)?.trim() || undefined;

  const params: MovieQuery = {
    page: num("page"),
    size: num("size"),
    status: str("status"),
    genre: str("genre"),
    q: str("q"),
    exposure: str("exposure") as MovieQuery["exposure"],
    complete: str("complete") as MovieQuery["complete"],
    syncedFrom: str("syncedFrom"),
    syncedTo: str("syncedTo"),
    approvedFrom: str("approvedFrom"),
    approvedTo: str("approvedTo"),
  };

  /*
   * 셋을 함께 기다린다. 순서대로 하면 느린 쪽 뒤에 빠른 쪽이 줄을 선다.
   * counts와 genres는 조건과 무관해서 매번 같은 값이지만, 5천 행을 세는 데
   * 수 ms라 따로 캐시하지 않는다.
   */
  const [page, counts, genres] = await Promise.all([
    listMovies(params),
    countMovies(),
    listGenres(),
  ]);

  if (page === null || counts === null) {
    return NextResponse.json(
      {
        title: "DB에 연결되어 있지 않습니다",
        detail: "영화 목록은 실 DB에서 읽습니다. 서버에 DATABASE_URL이 필요합니다.",
        status: 503,
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { ...page, counts, genres: genres ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
