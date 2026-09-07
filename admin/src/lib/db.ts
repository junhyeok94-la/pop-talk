import "server-only";

import { Pool } from "pg";

/**
 * admin 서버가 직접 쓰는 DB 연결.
 *
 * movies-source.ts가 갖고 있던 풀을 여기로 옮겼다. 이제 route handler도
 * 쓰므로 한 곳에서 관리한다.
 *
 * admin이 DB에 직접 붙는 범위는 좁게 둔다 — admin 화면에서만 쓰고 다른 곳에
 * 영향이 없는 것(배치 조회, 카테고리)만이다. 회원·영화처럼 fe도 쓰는 것은
 * apps/api에 둔다. 스키마가 바뀔 때 봐야 할 곳이 늘지 않게.
 */

// 개발 중 핫리로드마다 풀이 새로 생기지 않도록 전역에 붙인다.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

/**
 * 우리 SQL은 전부 dev.를 붙여 쓰는데도 search_path를 고정해야 한다.
 *
 * popcorn_movies에는 AFTER UPDATE 트리거(dev.queue_movie_embedding)가 걸려
 * 있고, 그 함수 본문이 popcorn_movie_embeddings·movie_embedding_jobs를
 * **스키마 없이** 참조한다. 함수에 SET search_path가 없어서 부르는 쪽의
 * 설정을 그대로 탄다. 기본값("$user", public)으로 연결하면 인증 한 번에
 *
 *   relation "popcorn_movie_embeddings" does not exist
 *
 * 로 죽는다. 조회만 할 때는 드러나지 않다가 쓰기에서 처음 나온다.
 *
 * 더 위험한 쪽은 그 반대다 — 같은 이름의 테이블이 prd에도 있어서,
 * search_path가 prd를 가리키면 dev 영화를 고치면서 prd의 임베딩 큐를
 * 건드린다. 조용히 잘못된 곳에 쓰는 것이라 오류보다 나쁘다.
 *
 * 함수를 고치는 것이 옳지만 그건 DB 담당자 것이다. 여기서는 우리 연결만
 * 못 박는다. prd로 옮길 때는 이 값과 SQL의 dev. 접두어가 함께 움직인다.
 */
const SCHEMA = "dev";

/** DATABASE_URL이 없으면 null. 부르는 쪽이 대안(스냅샷·목)을 고른다. */
export function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  globalForPg.pgPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    connectionTimeoutMillis: 5000,
    // 풀이 새 연결을 열 때마다 적용된다. 쿼리마다 SET을 보내지 않아도 된다.
    options: `-c search_path=${SCHEMA}`,
  });
  return globalForPg.pgPool;
}

/**
 * 조회 한 번. DB가 없거나 실패하면 null을 준다.
 *
 * 던지지 않는 이유 — admin은 DB 없이도 목 데이터로 돌아야 한다.
 * 부르는 쪽이 null을 받아 대안을 고르게 한다.
 */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[] | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query(sql, params);
    return rows as T[];
  } catch (error) {
    // 화면이 죽지 않게 삼키되, 서버 로그에는 남긴다.
    console.error("[db] 조회 실패:", error);
    return null;
  }
}

/**
 * 쓰기 한 번.
 *
 * query()와 달리 실패를 삼키지 않는다. 조회는 못 읽으면 목으로 대신할 수
 * 있지만, 쓰기는 대신할 것이 없다 — "저장됐다"고 화면에 알린 뒤 실제로는
 * 아무 일도 없는 것이 가장 나쁘다.
 *
 * "DB가 없음"과 "쓰다 실패함"을 갈라 돌려준다. 부르는 쪽이 상태 코드를
 * 다르게 매겨야 하기 때문이다 — 전자는 서버 구성 문제(503)이고 후자는
 * 제약 위반 같은 요청 문제(409)일 수 있다.
 */
export type MutateResult<T> =
  | { ok: true; rows: T[] }
  | { ok: false; reason: "no-db" }
  | { ok: false; reason: "failed"; detail: string };

export async function mutate<T>(
  sql: string,
  params: unknown[] = [],
): Promise<MutateResult<T>> {
  const pool = getPool();
  if (!pool) return { ok: false, reason: "no-db" };
  try {
    const { rows } = await pool.query(sql, params);
    return { ok: true, rows: rows as T[] };
  } catch (error) {
    console.error("[db] 쓰기 실패:", error);
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
