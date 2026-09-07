import "server-only";

import { query } from "./db";
import { MOCK_BATCH_RUNS, type BatchRun } from "./mock";

/**
 * 배치 실행 이력을 읽는다.
 *
 * 두 곳에서 쓴다 —
 *   layout.tsx            화면을 그리기 전에 서버가 읽어 스토어 초기값으로 넘긴다
 *   /admin-api/batch-runs 화면이 다시 물을 때
 *
 * 같은 SQL을 두 번 적지 않으려고 여기로 모았다. 조회 조건이 어긋나면
 * 처음 그려진 값과 다시 받은 값이 달라진다.
 */

/** 대시보드가 보여주는 만큼. 더 필요하면 늘려 부른다. */
export const DEFAULT_SIZE = 5;
export const MAX_SIZE = 50;

/**
 * DB의 timestamptz를 화면이 쓰는 'YYYY-MM-DD HH:MM:SS'로 맞춘다.
 *
 * 화면이 문자열을 그대로 잘라 쓰기 때문에 여기서 모양을 정한다.
 * to_char를 SQL에서 쓰면 시간대가 서버 설정을 타므로, 한국 시간으로 고정한다.
 */
const TS = (col: string) =>
  `to_char(${col} AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS')`;

const SQL = `
  SELECT
    -- batch_runs.id는 bigint다. pg 드라이버는 bigint를 문자열로 준다
    -- (자바스크립트 number가 2^53을 넘는 정수를 못 담기 때문이다).
    -- 화면은 이 값을 목록 key로만 쓰고 BatchRun.id는 number라, 여기서
    -- 정수로 맞춰 타입과 실제 값이 어긋나지 않게 한다. 배치 실행 기록이
    -- 21억 건에 이를 일은 없다.
    id::int AS id,
    job_name,
    ${TS("scheduled_for")} AS scheduled_for,
    status,
    source_file,
    processed_count,
    inserted_count,
    updated_count,
    failed_count,
    result,
    last_error,
    ${TS("started_at")}  AS started_at,
    ${TS("finished_at")} AS finished_at,
    ${TS("created_at")}  AS created_at
  -- movies-source.ts와 같이 스키마를 명시한다. search_path에 기대면
  -- 연결 설정이 바뀔 때 조용히 다른 스키마를 읽는다.
  FROM dev.batch_runs
  ORDER BY scheduled_for DESC
  LIMIT $1
`;

export type BatchRunData = {
  items: BatchRun[];
  /** 실 DB인지 목인지. 화면이 구분해야 할 때를 위해 남긴다. */
  source: "db" | "mock";
};

/**
 * DB가 없거나 조회가 실패하면 목으로 돌아간다.
 * admin은 DB 없이도 화면이 보여야 한다.
 */
export async function loadBatchRuns(size = DEFAULT_SIZE): Promise<BatchRunData> {
  const capped = Number.isFinite(size) && size > 0 ? Math.min(size, MAX_SIZE) : DEFAULT_SIZE;
  const rows = await query<BatchRun>(SQL, [capped]);
  if (rows === null) {
    return { items: MOCK_BATCH_RUNS.slice(0, capped), source: "mock" };
  }
  return { items: rows, source: "db" };
}
