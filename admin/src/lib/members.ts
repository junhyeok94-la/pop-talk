import "server-only";

import { query } from "./db";
import type { Member, MemberSurvey, Review } from "./mock";

/**
 * 회원(dev.users)을 읽는 자리.
 *
 * 상태값이 admin과 정확히 맞는다 — DB의 CHECK가 ACTIVE·SUSPENDED·WITHDRAWN
 * 셋만 허용하고, 화면의 MemberStatus도 같은 셋이다. 변환이 필요 없다.
 *
 * **읽기만 한다.** 회원 화면에 상태를 바꾸는 동작이 없다. 생기면 그때
 * 라우트에 PATCH를 더한다.
 */

/**
 * 화면이 쓰는 모양으로 옮긴다. 이름이 다른 것이 둘 있다.
 *
 *   name       ← nickname     dev.users에는 name 컬럼이 없다
 *   joined_at  ← created_at   가입일 컬럼이 따로 없다
 *
 * status_updated_by·status_updated_at은 DB에 아예 없다. 정지·탈퇴를 누가
 * 언제 처리했는지 남기는 칸이 없어서, 화면의 '수정자'·'수정일시' 열은
 * 비어 나온다. 그 기능이 생길 때 컬럼을 더해야 한다.
 */
const COLUMNS = `
  u.id,
  u.nickname AS name,
  u.email,
  u.status,
  to_char(u.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS joined_at,
  /*
   * 회원이 쓴 감상평 수.
   *
   * reviews 대부분은 수집 데이터라 user_id가 비어 있다. 여기 잡히는 것은
   * 회원이 직접 쓴 것뿐이라 수가 작다. 삭제된 것은 세지 않는다.
   */
  (SELECT count(*)::int
     FROM dev.reviews r
    WHERE r.user_id = u.id AND r.deleted_at IS NULL) AS review_count
`;

/** 탈퇴 회원도 보여준다 — 화면에 '탈퇴' 요약 카드가 있다. */
export async function listMembers(): Promise<Member[] | null> {
  return query<Member>(
    `SELECT ${COLUMNS} FROM dev.users u ORDER BY u.created_at DESC`,
  );
}

export async function findMember(id: string): Promise<Member | null> {
  const rows = await query<Member>(
    `SELECT ${COLUMNS} FROM dev.users u WHERE u.id = $1`,
    [id],
  );
  return rows?.[0] ?? null;
}

/**
 * 이 회원이 쓴 감상평.
 *
 * 감상평 목록 화면과 같은 모양으로 준다 — 화면이 같은 컴포넌트를 쓴다.
 * 수집 데이터는 user_id가 없어 여기 잡히지 않는다.
 */
export async function listMemberReviews(id: string): Promise<Review[] | null> {
  return query<Review>(
    `SELECT
       r.id,
       COALESCE(u.nickname, '(알 수 없음)')                       AS author,
       COALESCE(m.title_ko, '(삭제된 영화)')                       AS movie,
       r.rating::float8                                            AS rating,
       r.content,
       to_char(r.created_at AT TIME ZONE 'Asia/Seoul',
               'YYYY-MM-DD HH24:MI:SS')                            AS created_at,
       CASE
         WHEN r.deleted_at IS NOT NULL THEN 'DELETED'
         WHEN r.status = 'HIDDEN'      THEN 'HIDDEN'
         ELSE 'NORMAL'
       END                                                         AS status
     FROM dev.reviews r
     LEFT JOIN dev.users          u ON u.id = r.user_id
     LEFT JOIN dev.popcorn_movies m ON m.id = r.movie_id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC`,
    [id],
  );
}

/**
 * 회원가입 온보딩 취향.
 *
 * **읽는 자리가 바뀌었다.** 전에는 dev.onboarding_profiles에서 문항별 자유
 * 낱말 배열을 읽었는데, WAS가 그 테이블을 지우고 users에 컬럼 둘로 옮겼다.
 *
 *   users.onboarding_status               NOT_STARTED · IN_PROGRESS · COMPLETED · SKIPPED
 *   users.onboarding_movie_category_ids   movie_categories.id 배열 (CHECK 최대 20)
 *
 * 그 사이 회원 상세의 설문은 늘 빈 채로 떴다. 조회 실패를 null로 삼키고
 * 화면이 그것을 '미응답'으로 그렸기 때문이다 — 오류가 어디에도 보이지
 * 않았다. 같은 일이 또 생기면 GNB 배너가 잡는다(lib/schema-guard.ts).
 *
 * 이름까지 풀어서 준다. 화면에 id를 보여줄 수는 없고, 화면이 카테고리
 * 목록을 따로 받아 맞추게 하면 회원 한 명을 열 때마다 왕복이 하나 는다.
 *
 * 회원이 없으면 null. 온보딩을 안 했으면 null이 아니라 status가
 * NOT_STARTED인 객체다 — "회원이 없다"와 "아직 안 했다"는 다르고,
 * 화면이 후자를 '콜드스타트 대상'으로 표시해야 한다.
 */
type OnboardingRow = {
  status: MemberSurvey["status"];
  categories: MemberSurvey["categories"] | null;
};

export async function findMemberSurvey(id: string): Promise<MemberSurvey | null> {
  const rows = await query<OnboardingRow>(
    `SELECT
       u.onboarding_status AS status,
       (SELECT jsonb_agg(
                 jsonb_build_object('id', c.id::int, 'code', c.code,
                                    'name', c.name, 'type', c.type)
                 ORDER BY c.sort_order, c.id)
          FROM dev.movie_categories c
         WHERE c.id = ANY (u.onboarding_movie_category_ids)) AS categories
     FROM dev.users u
    WHERE u.id = $1`,
    [id],
  );
  const row = rows?.[0];
  if (!row) return null;

  return {
    status: row.status,
    /*
     * 고른 id 중 카테고리가 지워진 것이 있으면 그 항목만 빠진다.
     * FK가 없어(배열이다) 생길 수 있는 일이고, 화면은 남은 것만 보여준다.
     */
    categories: row.categories ?? [],
  };
}

/**
 * 감상평 총 건수.
 *
 * 대시보드의 '누적 감상평' 카드가 쓴다. 회원별 작성 수를 더하는 방식으로는
 * 맞지 않는다 — reviews 대부분이 수집 데이터라 user_id가 없어서, 더하면
 * 5건이 나오고 감상평 관리 화면의 20,962건과 어긋난다. 두 화면이 같은 것을
 * 세는데 다른 숫자를 보이면 어느 쪽을 믿어야 할지 알 수 없다.
 *
 * 삭제된 것은 빼고 센다 — 감상평 목록도 같은 기준이다.
 */
export async function countReviews(): Promise<number | null> {
  const rows = await query<{ n: string }>(
    `SELECT count(*) AS n FROM dev.reviews WHERE deleted_at IS NULL`,
  );
  return rows ? Number(rows[0].n) : null;
}
