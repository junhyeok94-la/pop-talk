import { NextResponse } from "next/server";

import { loadBatchRuns } from "@/lib/batch-runs";

/**
 * GET /admin-api/batch-runs — 배치 실행 이력
 *
 * 대시보드는 이 라우트를 거치지 않는다. layout.tsx가 화면을 그리기 전에
 * 서버에서 읽어 스토어에 넣어주므로, 첫 화면부터 실 데이터가 보인다.
 *
 * 여기는 화면이 **다시** 물을 때를 위한 자리다 — 새로고침 버튼처럼.
 * 조회 자체는 lib/batch-runs.ts에 있다.
 *
 * /api/*는 apps/api로 넘기는 중계 자리다(next.config.ts). 여기는 admin이
 * 직접 처리하므로 경로를 나눠 어디로 가는지 주소만 봐도 알게 했다.
 *
 * admin이 DB에 직접 붙는 범위는 좁게 둔다 — admin 화면에서만 쓰는 것이다.
 * 회원·영화처럼 fe도 쓰는 것은 apps/api에 있다.
 */

/** 실행 이력은 매번 새로 읽는다. 캐시된 "성공"은 의미가 없다. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const raw = Number(new URL(request.url).searchParams.get("size"));
  // 상한과 기본값은 loadBatchRuns가 정한다. 두 곳에서 다르게 정하지 않는다.
  const data = await loadBatchRuns(raw);

  return NextResponse.json(data, {
    // 목이라는 사실을 캐시하지 않는다. DB가 살아나면 바로 실 데이터로 바뀌어야 한다.
    headers: { "Cache-Control": "no-store" },
  });
}
