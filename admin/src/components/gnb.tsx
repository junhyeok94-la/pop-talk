"use client";

import { HStack, Text } from "@seed-design/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { HealthDot } from "@/components/health-dot";
import { useAdminStore } from "@/lib/admin-store";
import { CURRENT_ADMIN } from "@/lib/mock";
import { IconData, IconRefresh } from "@/lib/icons";
import styles from "./gnb.module.css";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 전 화면 상단에 고정되는 GNB.
 * 마지막 데이터 수집 일시와 새로고침은 특정 화면이 아니라 콘솔 전체의 상태라서
 * 대시보드에만 두지 않고 여기로 올렸다.
 */
export function Gnb() {
  const { movies, source, capturedAt, movieCounts } = useAdminStore();

  const router = useRouter();
  /*
   * router.refresh()는 서버가 다시 그려 보낼 때까지 기다려야 상태를 알 수
   * 있다. useTransition의 isPending이 그 시간을 알려준다 — 직접 타이머를
   * 두면 실제 소요와 어긋난다.
   */
  const [refreshing, startRefresh] = useTransition();
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  /*
   * 서버가 센 값을 먼저 쓴다. movies는 300편만 담고 있어 그중 최대값은
   * 실제 마지막 수집 시각이 아닐 수 있다.
   */
  const lastLoaded =
    movieCounts?.lastSyncedAt ??
    movies.reduce<string | null>(
      (acc, m) => (!acc || m.source_synced_at > acc ? m.source_synced_at : acc),
      null,
    );

  /*
   * 화면 데이터를 서버에서 다시 읽는다.
   *
   * 전에는 0.8초 기다렸다가 시각만 찍었다 — 아무것도 다시 읽지 않았다.
   * 화면이 요청마다 그려지게 되면서(layout.tsx의 force-dynamic) 진짜로
   * 동작하게 됐다. refresh()가 layout을 서버에서 다시 실행해 영화와 배치
   * 이력을 새로 읽어 온다.
   *
   * 배치 수집을 지금 돌리는 것이 아니다. 그건 별개이고 그럴 API가 없다.
   */
  const handleRefresh = () => {
    startRefresh(() => {
      router.refresh();
      const now = new Date();
      setLastRefreshed(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
    });
  };

  const [collectedDate, collectedTime] = (lastLoaded ?? "").split(" ");

  return (
    <HStack asChild justifyContent="flex-end" alignItems="center" gap="x3">
      <header className={styles.gnb}>
      {/* 실 DB를 보고 있는지 떠둔 스냅샷을 보고 있는지 화면에서 바로 알아야 한다. */}
      <span className={`${styles.source} ${source === "database" ? styles.sourceLive : ""}`}>
        {source === "database" ? "실 DB" : source === "snapshot" ? `스냅샷 ${capturedAt?.slice(0, 10) ?? ""}` : "목 데이터"}
      </span>

      <div className={styles.collected}>
        <IconData size={14} />
        <div>
          <p className={styles.collectedLabel}>마지막 데이터 수집</p>
          {lastLoaded ? (
            <p className={styles.collectedValue}>
              {collectedDate}
              {collectedTime && <span className={styles.collectedTime}>{collectedTime}</span>}
            </p>
          ) : (
            <p className={styles.collectedValue}>—</p>
          )}
        </div>
      </div>

      <div className={styles.refreshBox}>
        <button type="button" className={styles.refresh} disabled={refreshing} onClick={handleRefresh}>
          <span className={refreshing ? styles.spinning : undefined}>
            <IconRefresh size={13} />
          </span>
          {refreshing ? "불러오는 중…" : "새로고침"}
        </button>
        {lastRefreshed && <p className={styles.refreshedAt}>{lastRefreshed} 갱신</p>}
      </div>

      {/*
        로그인한 관리자 정보는 사이드바 하단이 아니라 GNB 우측 끝에 둔다.
        로그인을 만들지 않아 로그아웃 버튼은 뺐다. 이름은 남긴다 —
        카테고리 등록자·검증 로그 처리자로 찍히는 값이라 출처가 화면에 있어야 한다.
      */}
      {/* API 서버가 살아 있는지. 색만 바뀌는 작은 표시라 실패해도 화면에 영향이 없다. */}
      <HealthDot />

      <div className={styles.account}>
        <div className={styles.accountInfo}>
          <Text as="span" textStyle="t2Medium" className={styles.accountName}>
            {CURRENT_ADMIN.name}
          </Text>
          <Text as="span" textStyle="t1Regular" color="fg.neutralSubtle" className={styles.accountRole}>
            {CURRENT_ADMIN.role === "SUPER_ADMIN" ? "슈퍼관리자" : "관리자"}
          </Text>
        </div>
      </div>
      </header>
    </HStack>
  );
}
