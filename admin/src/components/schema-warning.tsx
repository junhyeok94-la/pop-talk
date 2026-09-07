"use client";

import { useState } from "react";

import { IconClose, IconWarning } from "@/lib/icons";
import type { SchemaDrift } from "@/lib/schema-guard";
import styles from "./schema-warning.module.css";

/**
 * DB 모양이 어드민이 기대하는 것과 어긋났을 때 띄우는 띠.
 *
 * ── 왜 배너인가 ───────────────────────────────────────────────────────────
 *
 * 이 DB는 여러 저장소가 함께 쓴다. 하루에 두 번 조용히 깨졌다 — 별칭이
 * 덮어써져 자동 분류가 343편에서 124편으로 줄었고, 설문 테이블이 사라져
 * 회원 상세의 설문이 늘 빈 채로 떴다.
 *
 * **둘 다 오류가 보이지 않았다.** 조회 실패를 null로 삼키고 화면이 그것을
 * "데이터 없음"으로 그렸기 때문이다. 그 설계는 맞다 — DB 없이도 목으로
 * 돌아야 한다. 다만 "없는 것"과 "사라진 것"이 화면에서 똑같아 보이면
 * 아무도 알아채지 못한다.
 *
 * 그래서 눈에 걸리는 자리에 둔다. 화면 안쪽 어딘가에 작게 적으면 그 화면을
 * 열지 않는 한 못 본다.
 *
 * ── 왜 닫을 수 있나 ───────────────────────────────────────────────────────
 *
 * 어긋난 것을 알면서도 당장 못 고치는 동안 작업을 막지 않기 위해서다.
 * 다만 새로고침하면 다시 뜬다 — 세션에 기억해 두면 "닫아 두고 잊는" 상태가
 * 되어 배너를 둔 이유가 사라진다.
 */
export function SchemaWarning({ drift }: { drift: SchemaDrift[] }) {
  const [closed, setClosed] = useState(false);
  if (drift.length === 0 || closed) return null;

  return (
    <div className={styles.bar} role="alert">
      <IconWarning size={15} />
      <div className={styles.body}>
        <p className={styles.title}>
          DB 모양이 어드민이 기대하는 것과 다릅니다 ({drift.length}건)
        </p>
        <ul className={styles.list}>
          {drift.map((d) => (
            <li key={d.table}>
              <code className={styles.table}>{d.table}</code>
              {d.missingTable ? (
                <span className={styles.gone}>테이블 없음</span>
              ) : (
                <span className={styles.gone}>
                  컬럼 없음: {d.missingColumns.join(", ")}
                </span>
              )}
              <span className={styles.usedBy}>{d.usedBy}</span>
            </li>
          ))}
        </ul>
        <p className={styles.hint}>
          다른 저장소가 스키마를 바꿨을 수 있습니다. 해당 화면은 값이 비어 보여도
          오류가 뜨지 않으니 그대로 믿지 마세요.
        </p>
      </div>
      <button
        type="button"
        className={styles.close}
        aria-label="경고 닫기"
        onClick={() => setClosed(true)}
      >
        <IconClose size={14} />
      </button>
    </div>
  );
}
