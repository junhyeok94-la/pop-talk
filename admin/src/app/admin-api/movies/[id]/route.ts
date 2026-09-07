import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import { MOVIE_COLUMNS } from "@/lib/movies-source";
import type { Movie, MovieEmbedding, MovieMediaEntry } from "@/lib/mock";

/**
 * GET /admin-api/movies/:id — 영화 상세
 *
 * 목록이 쪽 단위로 오게 되면서 필요해졌다. 전에는 스토어에 300편이 다 있어
 * 상세 화면이 거기서 찾았는데, 이제 목록에 없는 영화도 주소로 열 수 있어야
 * 한다.
 *
 * 목록과 달리 media(포스터·스틸)와 plot을 함께 준다 — 상세 화면이 쓴다.
 * 임베딩 상태도 붙인다.
 */

export const dynamic = "force-dynamic";

const problem = (status: number, title: string, detail?: string) =>
  NextResponse.json({ title, detail, status }, { status });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return problem(422, "영화 id가 올바르지 않습니다", `id=${raw}`);
  }

  const rows = await query<Record<string, unknown>>(
    `SELECT ${MOVIE_COLUMNS} FROM dev.popcorn_movies_service s WHERE s.id = $1`,
    [id],
  );
  if (rows === null) {
    return problem(503, "DB에 연결되어 있지 않습니다", "영화는 실 DB에서 읽습니다.");
  }
  if (rows.length === 0) {
    return problem(404, "영화를 찾을 수 없습니다", `id=${id}`);
  }

  const row = rows[0];
  const media = (row.media as MovieMediaEntry[] | null) ?? [];
  const movie = {
    ...(row as unknown as Movie),
    id: Number(row.id),
    media,
    // poster_url이 비어도 media에 대표 포스터가 있는 경우가 35편 있다.
    poster_url:
      (row.poster_url as string | null) ??
      media.find((m) => m.type === "POSTER" && m.primary)?.url,
    categories: [],
    pop_talk_score: undefined,
  } as Movie;

  /*
   * 임베딩은 따로 읽는다. 한 영화에 여러 행이 있을 수 있어(문서 종류·청크)
   * 위 조회에 붙이면 영화가 여러 줄로 늘어난다.
   */
  const embeddings = await query<MovieEmbedding>(
    `SELECT e.id, e.movie_id, e.document_type, e.chunk_no, e.embedding_model,
            e.status, e.content_hash, e.attempts, e.last_error,
            to_char(e.embedded_at, 'YYYY-MM-DD HH24:MI:SS') AS embedded_at,
            to_char(e.updated_at,  'YYYY-MM-DD HH24:MI:SS') AS updated_at
       FROM dev.popcorn_movie_embeddings e
      WHERE e.movie_id = $1`,
    [id],
  );

  return NextResponse.json(
    {
      movie,
      embeddings: (embeddings ?? []).map((e) => ({
        ...e,
        id: Number(e.id),
        movie_id: Number(e.movie_id),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
