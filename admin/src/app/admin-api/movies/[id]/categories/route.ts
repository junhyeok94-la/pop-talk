import { NextResponse } from "next/server";

import { mutate } from "@/lib/db";

/**
 * PUT /admin-api/movies/:id/categories — 영화에 붙은 카테고리를 통째로 교체
 *
 * 영화 상세의 '정보 수정'에서 고른 카테고리를 원장에 쓴다.
 *
 * ── 왜 이제야 만드나 ──────────────────────────────────────────────────────
 *
 * movie_category_links는 005부터 있었는데 지금까지 0건이었다. 화면에는
 * 체크박스가 있었지만 저장하는 곳이 없어 스토어에만 담겼고, 새로고침하면
 * 사라졌다. 게다가 체크박스가 카테고리가 아니라 **화면 문구**를 나열하고
 * 있어서, 009에서 문구의 name을 프롬프트 문장으로 바꾸자 라벨이
 * "퇴근하고 편하게 쉬면서 볼 영화가 필요해요."로 바뀌어 버렸다.
 *
 * 영화에 붙는 것은 카테고리다. 문구는 그 카테고리를 사용자에게 보여주는
 * 말이라 영화와 직접 관계가 없다.
 *
 * ── 자동 분류와 섞지 않는다 ───────────────────────────────────────────────
 *
 * 여기 쓰는 것은 **사람이 고른 것**이다. 별칭 자동 분류(auto_categories)는
 * 조회할 때마다 계산하는 별개 값이고 이 테이블에 쌓이지 않는다. 섞으면
 * 별칭을 고쳤을 때 사람이 붙인 것까지 흔들린다.
 *
 * ── 왜 통째로 교체하나 ────────────────────────────────────────────────────
 *
 * 화면이 체크박스 전체 상태를 보낸다. 부분 추가·삭제로 만들면 화면과 원장이
 * 어긋날 때 무엇이 맞는지 알 수 없다. 지우고 다시 넣는 편이 단순하고,
 * 한 트랜잭션 안에서 하므로 중간 상태가 보이지 않는다.
 */

export const dynamic = "force-dynamic";

const problem = (status: number, title: string, detail?: string) =>
  NextResponse.json({ title, detail, status }, { status });

type Body = { codes?: unknown };

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await params;
  const movieId = Number(raw);
  if (!Number.isInteger(movieId) || movieId <= 0) {
    return problem(422, "영화 id가 올바르지 않습니다", `id=${raw}`);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return problem(400, "본문을 읽을 수 없습니다");
  }

  if (!Array.isArray(body.codes)) {
    return problem(422, "카테고리 목록이 필요합니다", "codes는 배열이어야 합니다.");
  }

  /*
   * 대문자로 올리고 중복을 없앤다. 빈 배열은 "전부 뗀다"는 뜻이라 허용한다 —
   * 문구와 달리 영화는 카테고리가 하나도 없어도 된다.
   */
  const codes = [
    ...new Set(
      body.codes
        .map((c) => (typeof c === "string" ? c.trim().toUpperCase() : ""))
        .filter((c) => c !== ""),
    ),
  ];

  /*
   * assigned_by는 쓰지 않는다.
   *
   * uuid이고 dev.users(id)를 참조한다 — 서비스 회원 계정을 가리키는 자리다.
   * 어드민 운영자는 그 테이블에 없어서 넣을 값이 없다. 운영자 이름을 넣으면
   * "invalid input syntax for type uuid"가 난다.
   *
   * 누가 붙였는지는 검증 로그가 남긴다. 어드민에 계정 체계가 생기면 그때
   * 채운다.
   *
   * ⚠️ 이 테이블에는 트리거가 걸려 있다(trg_queue_category_link_movie_embedding).
   *    링크가 바뀌면 그 영화의 임베딩 재생성이 큐에 쌓인다. 의도된 동작이다 —
   *    카테고리가 추천 문서에 들어가므로 다시 만들어야 한다.
   *
   * 한 문장으로 지우고 넣는다. 없는 코드는 조용히 빠진다 — SELECT가 실재하는
   * 카테고리만 고르기 때문이다. 무엇이 빠졌는지는 dropped로 돌려준다.
   */
  const result = await mutate<{ code: string }>(
    `WITH removed AS (
       DELETE FROM dev.movie_category_links WHERE movie_id = $1
     ), inserted AS (
       INSERT INTO dev.movie_category_links (movie_id, category_id)
       SELECT $1, c.id
         FROM dev.movie_categories c
        WHERE c.code = ANY($2::text[])
       RETURNING category_id
     )
     SELECT c.code
       FROM inserted i
       JOIN dev.movie_categories c ON c.id = i.category_id
      ORDER BY c.sort_order, c.code`,
    [movieId, codes],
  );

  if (!result.ok) {
    if (result.reason === "no-db") return problem(503, "DB에 연결되어 있지 않습니다");
    // 없는 영화를 가리키면 FK가 막는다. 요청이 잘못된 것이다.
    if (result.detail.includes("movie_category_links_movie_id_fkey")) {
      return problem(404, "영화를 찾을 수 없습니다", `id=${movieId}`);
    }
    return problem(500, "카테고리를 저장하지 못했습니다", result.detail);
  }

  const saved = result.rows.map((r) => r.code);
  const dropped = codes.filter((c) => !saved.includes(c));

  return NextResponse.json(
    { categories: saved, dropped },
    { headers: { "Cache-Control": "no-store" } },
  );
}
