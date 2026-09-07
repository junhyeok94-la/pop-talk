import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import { MOCK_REVIEWS, type Review } from "@/lib/mock";

/**
 * GET /admin-api/reviews — 감상평 목록
 *
 * 실 DB에 20,957건이 있다(2026-08-11 적재, 네이버 영화 수집분).
 *
 * **거르기와 쪽 나누기를 서버에서 한다.** 배치·영화와 다른 점이다. 화면이
 * 전부 받아 자바스크립트로 거르던 방식은 2만 건에서 쓸 수 없다 — 첫 화면에
 * 수 MB를 내려보내게 된다.
 *
 * 나중에 Python WAS의 /admin/reviews로 옮기더라도 화면은 그대로 둘 수 있게
 * 응답 모양을 page/size/total로 맞췄다.
 */

export const dynamic = "force-dynamic";

const DEFAULT_SIZE = 10;
const MAX_SIZE = 100;

/**
 * 화면이 쓰는 상태와 DB의 상태가 다르다.
 *
 *   DB    status='ACTIVE' + deleted_at으로 삭제를 표시한다
 *   화면  NORMAL · HIDDEN · DELETED 세 가지
 *
 * deleted_at이 있으면 DELETED, 아니면 status를 그대로 옮긴다. 지금 실
 * 데이터는 20,957건 전부 ACTIVE이고 삭제된 것이 없어 모두 NORMAL이 된다.
 */
const STATUS = `
  CASE
    WHEN r.deleted_at IS NOT NULL THEN 'DELETED'
    WHEN r.status = 'HIDDEN'      THEN 'HIDDEN'
    ELSE 'NORMAL'
  END`;

/**
 * 작성자 자리.
 *
 * 수집 데이터라 user_id가 20,957건 전부 비어 있다. 회원과 이어진 감상평이
 * 아직 하나도 없다. 대신 출처가 준 익명 키(source_user_key) 앞자리를 쓴다 —
 * 같은 사람이 쓴 것끼리는 같은 값으로 묶여 보이므로 목록에서 구분은 된다.
 *
 * 회원 감상평이 생기면 users.nickname을 먼저 쓰도록 바꾼다. 그때까지의
 * 임시 표시다.
 */
const AUTHOR = `
  COALESCE(
    u.nickname,
    CASE WHEN r.source_user_key IS NOT NULL
         THEN '익명 ' || left(r.source_user_key, 6)
    END,
    '(알 수 없음)'
  )`;

type Row = Review & { full_count: string };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const p = url.searchParams;

  const rawSize = Number(p.get("size"));
  const size =
    Number.isFinite(rawSize) && rawSize > 0 ? Math.min(rawSize, MAX_SIZE) : DEFAULT_SIZE;
  const rawPage = Number(p.get("page"));
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  /*
   * 조건을 배열로 모아 마지막에 합친다. 값은 전부 $n으로 넘긴다 —
   * 검색어가 문자열 그대로 SQL에 들어가면 주입이 된다.
   */
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };

  const status = p.get("status");
  if (status === "HIDDEN") where.push("r.status = 'HIDDEN' AND r.deleted_at IS NULL");
  else if (status === "DELETED") where.push("r.deleted_at IS NOT NULL");
  else if (status === "NORMAL")
    where.push("r.status <> 'HIDDEN' AND r.deleted_at IS NULL");

  const q = p.get("q")?.trim();
  if (q) {
    // 내용과 영화 제목 둘 다에서 찾는다. 화면의 검색창이 하나이기 때문이다.
    params.push(`%${q}%`);
    const n = `$${params.length}`;
    where.push(`(r.content ILIKE ${n} OR m.title_ko ILIKE ${n})`);
  }

  const from = p.get("from");
  if (from) add("r.created_at::date >= ?", from);
  const to = p.get("to");
  if (to) add("r.created_at::date <= ?", to);

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  /*
   * 전체 건수를 같은 조회에서 얻는다(window function). 따로 COUNT(*)를
   * 한 번 더 돌리면 조건이 어긋날 여지가 생긴다.
   */
  params.push(size, (page - 1) * size);
  const sql = `
    SELECT
      r.id,
      ${AUTHOR}                                                    AS author,
      -- 수집분이면 출처 이름, 회원이 직접 쓴 것이면 NULL이다(008의 CHECK).
      -- 화면이 그 둘을 갈라 표시하므로 NULL을 메우지 않고 그대로 올려보낸다.
      r.source_system,
      COALESCE(m.title_ko, '(삭제된 영화)')                          AS movie,
      r.rating::float8                                             AS rating,
      r.content,
      to_char(r.created_at AT TIME ZONE 'Asia/Seoul',
              'YYYY-MM-DD HH24:MI:SS')                             AS created_at,
      ${STATUS}                                                    AS status,
      count(*) OVER ()                                             AS full_count
    FROM dev.reviews r
    -- 영화는 반드시 있다(FK). 그래도 LEFT로 두어 조인 하나가 목록을 통째로
    -- 비우는 일이 없게 한다.
    LEFT JOIN dev.popcorn_movies m ON m.id = r.movie_id
    LEFT JOIN dev.users          u ON u.id = r.user_id
    ${whereSql}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const rows = await query<Row>(sql, params);

  // DB가 없으면 목으로 돌아간다. admin은 DB 없이도 화면이 보여야 한다.
  if (rows === null) {
    const start = (page - 1) * size;
    return NextResponse.json(
      {
        items: MOCK_REVIEWS.slice(start, start + size),
        total: MOCK_REVIEWS.length,
        page,
        size,
        counts: {
          all: MOCK_REVIEWS.length,
          hidden: MOCK_REVIEWS.filter((r) => r.status === "HIDDEN").length,
        },
        source: "mock",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const total = rows.length > 0 ? Number(rows[0].full_count) : 0;
  // full_count는 전체 건수를 나르는 임시 열이다. 화면에는 내보내지 않는다.
  const items = rows.map((row) => {
    const { full_count, ...review } = row;
    void full_count;
    return review;
  });

  /*
   * 요약 카드가 쓰는 전체 건수. **거르기와 무관하게 늘 전체를 센다** —
   * 카드가 "전체 / 숨김 처리됨"으로 넘나드는 빠른 보기라, 지금 걸린 조건에
   * 따라 숫자가 흔들리면 무엇을 누르는지 알 수 없다.
   *
   * 2만 건을 세는 데 수 ms면 된다. 목록 조회와 합치지 않고 따로 두어
   * 조건이 섞이지 않게 했다.
   */
  const counts = await query<{ all: string; hidden: string }>(`
    SELECT count(*) AS all,
           count(*) FILTER (WHERE status = 'HIDDEN' AND deleted_at IS NULL) AS hidden
      FROM dev.reviews
  `);

  return NextResponse.json(
    {
      items,
      total,
      page,
      size,
      counts: {
        all: Number(counts?.[0]?.all ?? total),
        hidden: Number(counts?.[0]?.hidden ?? 0),
      },
      source: "db",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
