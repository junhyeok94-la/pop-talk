import "server-only";

import { query } from "./db";
import { AUTO_CATEGORIES, COMPLETENESS, MANUAL_CATEGORIES, MISSING_FIELDS } from "./movies-source";
import type { Movie } from "./mock";

/**
 * 영화 목록을 쪽 단위로 읽는다.
 *
 * 왜 필요한가 — layout이 300편만 읽어 스토어에 넣고 화면이 거기서 걸렀다.
 * 5,312편 중 300편만 보였다는 뜻이다. release_date 내림차순으로 잘랐으므로,
 * 오래된 영화나 개봉일이 뒤에 있는 영화는 검수 화면에 **아예 나타나지 않았다.**
 *
 * 전부 보내는 방법도 재봤다 —
 *
 *   전체 필드 + media   11 MB
 *   media 빼면           6.6 MB
 *   화면 표시용만        1.3 MB
 *
 * media(포스터·스틸, 영화당 평균 8.3개)가 7MB로 대부분이고 목록에는 쓰이지
 * 않는다. 다 걷어내도 1.3MB를 매번 보내 10편을 보여주게 된다. 감상평(2만 건)
 * 에서 쓴 방식대로 서버에서 거르고 자른다.
 *
 * 완성도와 자동 분류는 **결과만** 보낸다. 판정에 필요한 원본(plot·actors…)은
 * 서버에서만 읽고 화면으로 나가지 않는다.
 */

/** 목록이 쓰는 필드만. media·plot 같은 큰 것은 상세에서 읽는다. */
const LIST_COLUMNS = `
  s.id, s.kofic_movie_cd, s.kmdb_id, s.kmdb_matched,
  s.title_ko, s.title_en, s.title_original,
  s.release_date, s.production_year, s.runtime_minutes,
  s.movie_type, s.production_status,
  s.representative_country, s.genres, s.representative_genre,
  s.directors, s.actors,
  s.viewing_grade, s.poster_url,
  s.service_status, s.approval_status, s.approved_by, s.approved_at,
  s.rejection_reason, s.source_synced_at, s.is_embedded,
  ${COMPLETENESS},
  ${AUTO_CATEGORIES},
  ${MANUAL_CATEGORIES}
`;

export type MovieQuery = {
  page?: number;
  size?: number;
  /** 인증 상태. 쉼표로 여러 개. */
  status?: string;
  genre?: string;
  /** 제목·감독·배우에서 찾는다. */
  q?: string;
  /** 노출 상태. approved 화면이 쓴다. */
  exposure?: "EXPOSED" | "HIDDEN";
  /** 정보 완성도. */
  complete?: "COMPLETE" | "INCOMPLETE";
  /** 적재일시 기준 기간. review 화면이 쓴다. */
  syncedFrom?: string;
  syncedTo?: string;
  /** 인증일시 기준 기간. approved 화면이 쓴다. */
  approvedFrom?: string;
  approvedTo?: string;
};

export type MoviePage = {
  items: Movie[];
  total: number;
  page: number;
  size: number;
};

const DEFAULT_SIZE = 10;
const MAX_SIZE = 100;

export async function listMovies(params: MovieQuery): Promise<MoviePage | null> {
  const size =
    Number.isFinite(params.size) && (params.size ?? 0) > 0
      ? Math.min(params.size!, MAX_SIZE)
      : DEFAULT_SIZE;
  const page =
    Number.isFinite(params.page) && (params.page ?? 0) > 0 ? Math.floor(params.page!) : 1;

  const where: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    where.push(sql.replace("?", `$${values.length}`));
  };

  if (params.status) {
    const list = params.status.split(",").map((s) => s.trim()).filter(Boolean);
    // approval_status는 enum이라 text[]와 바로 비교되지 않는다(operator does not exist).
    if (list.length) add("s.approval_status::text = ANY(?::text[])", list);
  }
  // 장르는 배열이라 포함 검사로 찾는다.
  if (params.genre) add("s.genres @> ARRAY[?]::text[]", params.genre);
  if (params.exposure === "EXPOSED") where.push("s.service_status = 'PUBLISHED'");
  if (params.exposure === "HIDDEN") where.push("s.service_status <> 'PUBLISHED'");
  if (params.syncedFrom) add("s.source_synced_at::date >= ?", params.syncedFrom);
  if (params.syncedTo) add("s.source_synced_at::date <= ?", params.syncedTo);
  if (params.approvedFrom) add("s.approved_at::date >= ?", params.approvedFrom);
  if (params.approvedTo) add("s.approved_at::date <= ?", params.approvedTo);

  if (params.q) {
    /*
     * 제목·감독·배우에서 찾는다. 화면의 검색창이 하나이고 안내도 그렇게
     * 적혀 있다. 배열은 배열 그대로 훑어야 해서 EXISTS를 쓴다.
     */
    values.push(`%${params.q}%`);
    const n = `$${values.length}`;
    where.push(`(
      s.title_ko ILIKE ${n}
      OR EXISTS (SELECT 1 FROM unnest(s.directors) d WHERE d ILIKE ${n})
      OR EXISTS (SELECT 1 FROM unnest(s.actors) a WHERE a ILIKE ${n})
    )`);
  }

  /*
   * 완성도로 거르려면 판정을 WHERE에서 다시 계산해야 한다. SELECT에 붙인
   * 별칭은 WHERE에서 쓸 수 없다(SQL이 SELECT보다 WHERE를 먼저 본다).
   * 목록을 두 번 적지 않도록 MISSING_FIELDS를 함께 쓴다.
   */
  if (params.complete === "COMPLETE") {
    where.push(`cardinality(${MISSING_FIELDS}) = 0`);
  } else if (params.complete === "INCOMPLETE") {
    where.push(`cardinality(${MISSING_FIELDS}) > 0`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  values.push(size, (page - 1) * size);
  const rows = await query<Movie & { full_count: string }>(
    `SELECT ${LIST_COLUMNS}, count(*) OVER () AS full_count
       FROM dev.popcorn_movies_service s
       ${whereSql}
      ORDER BY s.release_date DESC, s.id DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  if (rows === null) return null;

  const total = rows.length > 0 ? Number(rows[0].full_count) : 0;
  const items = rows.map((row) => {
    const { full_count, ...movie } = row;
    void full_count;
    return {
      ...movie,
      id: Number(movie.id),
      // 목록은 media를 읽지 않는다. 화면 타입을 맞추려고 빈 값으로 채운다.
      media: [],
      categories: (movie.categories as string[]) ?? [],
      pop_talk_score: undefined,
    } as Movie;
  });

  return { items, total, page, size };
}

/**
 * 화면 상단 요약과 대시보드가 쓰는 수치.
 *
 * 목록과 따로 센다 — 요약 카드는 지금 걸린 조건과 무관한 전체를 보여줘야
 * 무엇을 누르는지 알 수 있다. 감상평에서 쓴 판단과 같다.
 */
export type MovieCounts = {
  all: number;
  pending: number;
  approved: number;
  rejected: number;
  published: number;
  /** 마지막 수집 시각. GNB가 보여준다. */
  lastSyncedAt: string | null;
};

export async function countMovies(): Promise<MovieCounts | null> {
  const rows = await query<{
    all: string;
    pending: string;
    approved: string;
    rejected: string;
    published: string;
    last_synced_at: string | null;
  }>(`
    SELECT count(*)                                                   AS all,
           count(*) FILTER (WHERE approval_status = 'PENDING')         AS pending,
           count(*) FILTER (WHERE approval_status = 'APPROVED')        AS approved,
           count(*) FILTER (WHERE approval_status = 'REJECTED')        AS rejected,
           count(*) FILTER (WHERE service_status = 'PUBLISHED')        AS published,
           to_char(max(source_synced_at) AT TIME ZONE 'Asia/Seoul',
                   'YYYY-MM-DD HH24:MI:SS')                            AS last_synced_at
      FROM dev.popcorn_movies
  `);
  const row = rows?.[0];
  if (!row) return null;
  return {
    all: Number(row.all),
    pending: Number(row.pending),
    approved: Number(row.approved),
    rejected: Number(row.rejected),
    published: Number(row.published),
    lastSyncedAt: row.last_synced_at,
  };
}

/** 화면의 장르 필터가 쓸 목록. 20종뿐이라 통째로 준다. */
export async function listGenres(): Promise<string[] | null> {
  const rows = await query<{ genre: string }>(`
    SELECT DISTINCT unnest(genres) AS genre
      FROM dev.popcorn_movies
     ORDER BY 1
  `);
  return rows?.map((r) => r.genre) ?? null;
}
