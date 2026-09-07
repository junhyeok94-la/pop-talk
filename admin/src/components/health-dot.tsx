"use client";

import { useEffect, useState } from "react";

import { fetchHealth, type Health } from "@/lib/api";
import styles from "./health-dot.module.css";

/** 30초마다 다시 묻는다. 사람이 보고 있는 화면이라 이 정도면 충분하다. */
const INTERVAL_MS = 30_000;

type State = "checking" | "ok" | "degraded" | "down";

const LABEL: Record<State, string> = {
  checking: "확인 중",
  ok: "정상",
  degraded: "DB 연결 끊김",
  down: "응답 없음",
};

const DETAIL: Record<State, string> = {
  checking: "서버 상태를 확인하고 있습니다.",
  ok: "API 서버와 DB가 모두 정상입니다.",
  degraded: "API 서버는 살아 있지만 DB에 연결하지 못합니다.",
  down: "API 서버가 응답하지 않습니다. 서버가 내려갔거나 주소가 잘못됐습니다.",
};

function toState(health: Health | null): State {
  if (health === null) return "down";
  return health.status === "ok" ? "ok" : "degraded";
}

/**
 * GNB 우측의 API 서버 상태 점.
 *
 * 색만 바뀌는 작은 표시라, 실패해도 화면 어디에도 영향을 주지 않는다.
 * 자세한 내용은 마우스를 올렸을 때만 보여준다.
 */
export function HealthDot() {
  const [state, setState] = useState<State>("checking");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    // 화면을 떠날 때 진행 중인 요청을 끊는다. 안 끊으면 사라진 컴포넌트에
    // setState가 걸린다.
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    const check = async () => {
      const health = await fetchHealth(controller.signal);
      if (controller.signal.aborted) return;
      setState(toState(health));
      setCheckedAt(new Date().toLocaleTimeString("ko-KR", { hour12: false }));
      timer = setTimeout(check, INTERVAL_MS);
    };

    check();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  // Seed에 Tooltip이 없다. 이 프로젝트는 title 속성을 쓴다 (movie-table의 반려 사유와 같은 방식).
  const tip = [LABEL[state], DETAIL[state], checkedAt && `${checkedAt} 확인`]
    .filter(Boolean)
    .join("\n");

  return (
    <span className={styles.root} role="status" aria-label={`API 서버 ${LABEL[state]}`} title={tip}>
      <span className={`${styles.dot} ${styles[state]}`} aria-hidden="true" />
      <span className={styles.label}>API</span>
    </span>
  );
}
