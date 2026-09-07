"use client";

import {
  ContentPlaceholderRoot,
  ListContent,
  ListDetail,
  ListItem,
  ListPrefix,
  ListRoot,
  ListSuffix,
  ListTitle,
} from "@seed-design/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { CardTitle, GroupTitle, PageSub, PageTitle } from "@/components/typography";
import { MoviePoster } from "@/components/movie-poster";
import { StateBadge, type StateTone } from "@/components/state-badge";
import { SummaryCards, type SummaryItem } from "@/components/summary-cards";
import { useAdminStore } from "@/lib/admin-store";
import {
  BATCH_JOBS,
  type JobStatus,
} from "@/lib/mock";
import {
  IconApprove,
  IconData,
  IconChevronRight,
  IconClock,
  IconHidden,
  IconMember,
  IconMembers,
  IconMovie,
  IconRefresh,
  IconReview,
  IconUncertify,
} from "@/lib/icons";
import ui from "@/styles/ui.module.css";
import styles from "./page.module.css";


const BATCH_LABELS: Record<JobStatus, string> = {
  PENDING: "대기",
  PROCESSING: "실행 중",
  SUCCEEDED: "성공",
  FAILED: "실패",
};

const BATCH_TONES: Record<JobStatus, StateTone> = {
  PENDING: "neutral",
  PROCESSING: "informative",
  SUCCEEDED: "positive",
  FAILED: "critical",
};




export default function DashboardPage() {
  const router = useRouter();
  const { movies, pendingCount, batchRuns, members, reviewTotal, movieCounts } =
    useAdminStore();

  /*
   * 서버가 센 값을 먼저 쓴다. movies는 300편만 담고 있어 그것으로 세면
   * "전체 영화 300"이 되고, 검수 화면(5,312)과 어긋난다.
   */
  const approved =
    movieCounts?.approved ?? movies.filter((m) => m.approval_status === "APPROVED").length;
  // 노출은 인증 상태와 무관하게 설정할 수 있으므로 상태로 거르지 않는다.
  const published =
    movieCounts?.published ?? movies.filter((m) => m.service_status === "PUBLISHED").length;
  const rejected =
    movieCounts?.rejected ?? movies.filter((m) => m.approval_status === "REJECTED").length;
  const memberActive = members.filter((m) => m.status === "ACTIVE").length;
  const memberSuspended = members.filter((m) => m.status === "SUSPENDED").length;
  const memberWithdrawn = members.filter((m) => m.status === "WITHDRAWN").length;
  // 배치는 최신순으로 들어온다. 첫 항목이 마지막 실행.
  /*
   * 배치 이력은 layout이 서버에서 읽어 스토어에 넣어준다.
   *
   * 전에는 여기서 /admin-api/batch-runs를 불렀다. 그러면 첫 그림에는 목이
   * 보이다가 응답이 온 뒤 실 데이터로 바뀐다 — 날짜와 건수가 눈앞에서
   * 달라지는 것이 보였다. 화면이 요청마다 그려지게 되면서(force-dynamic)
   * 서버에서 미리 넣을 수 있게 됐다.
   */
  // 실 DB가 비어 있으면 이력이 0건일 수 있다 — 목만 볼 때는 없던 경우다.
  const lastBatch = batchRuns.at(0);
  const batchFailed = batchRuns.filter((r) => r.status === "FAILED").length;
  // 회원별 작성 수를 더하지 않는다 — 수집 감상평은 작성자가 없어 빠진다.
  const totalReviews = reviewTotal;

  const pendingMovies = movies.filter((m) => m.approval_status === "PENDING").slice(0, 5);

  const movieKpis: SummaryItem[] = [
    { key: "pending", label: "인증대기", value: pendingCount, caption: "검토 필요", icon: IconClock, tone: "neutral", href: "/review" },
    { key: "approved", label: "인증완료", value: approved, caption: "사용자 화면에 인증 뱃지", icon: IconApprove, tone: "positive", href: "/approved" },
    { key: "uncertified", label: "반려", value: rejected, caption: "인증 거부됨", icon: IconUncertify, tone: "neutral", href: "/review" },
  ];

  const serviceKpis: SummaryItem[] = [
    { key: "movies", label: "전체 영화", value: movieCounts?.all ?? movies.length, caption: `노출 중 ${published}건`, icon: IconMovie, tone: "brand", href: "/review" },
    // 회원 수는 아래 "회원 관리 현황"이 전담한다. 여기서는 겹치지 않는 지표를 둔다.
    { key: "reviews", label: "누적 감상평", value: totalReviews, caption: "사용자 작성", icon: IconReview, tone: "informative", href: "/reviews" },
  ];

  const memberKpis: SummaryItem[] = [
    { key: "member-all", label: "전체 회원", value: members.length, caption: "가입 회원", icon: IconMembers, tone: "brand", href: "/members" },
    { key: "member-active", label: "정상", value: memberActive, caption: "이용 중", icon: IconMember, tone: "positive", href: "/members" },
    { key: "member-suspended", label: "정지", value: memberSuspended, caption: "이용 제한", icon: IconUncertify, tone: "critical", href: "/members" },
    { key: "member-withdrawn", label: "탈퇴", value: memberWithdrawn, caption: "탈퇴 처리됨", icon: IconHidden, tone: "neutral", href: "/members" },
  ];


  return (
    <div className={ui.page}>
      <div>
        <PageTitle>대시보드</PageTitle>
        <PageSub>2026년 8월 7일 기준 현황</PageSub>
      </div>

      <section aria-labelledby="movie-kpi-title">
        <GroupTitle id="movie-kpi-title">영화 인증 현황</GroupTitle>
        <SummaryCards items={movieKpis} />
      </section>

      <section aria-labelledby="service-kpi-title">
        <GroupTitle id="service-kpi-title">서비스 전체 현황</GroupTitle>
        <SummaryCards items={serviceKpis} />
      </section>

      <section aria-labelledby="member-kpi-title">
        <GroupTitle id="member-kpi-title">회원 관리 현황</GroupTitle>
        <SummaryCards items={memberKpis} />
      </section>

      <section className={`${ui.card} ${styles.panel}`} aria-labelledby="batch-title">
        <div className={ui.cardHead}>
          <CardTitle id="batch-title">배치 실행 현황</CardTitle>
          {lastBatch && (
            <StateBadge tone={BATCH_TONES[lastBatch.status]}>
              {BATCH_LABELS[lastBatch.status]}
            </StateBadge>
          )}
        </div>
        <p className={styles.batchNote}>
          <IconData size={11} />
          영화 데이터 수집이 매일 02:00에 돕니다.
          {batchFailed > 0 && ` 최근 ${batchRuns.length}회 중 ${batchFailed}회 실패했습니다.`}
        </p>
        <ListRoot>
          {batchRuns.length === 0 && (
            <ListItem>
              <ListContent>
                <ListDetail>실행 이력이 없습니다.</ListDetail>
              </ListContent>
            </ListItem>
          )}
          {batchRuns.map((run) => (
            <ListItem key={run.id}>
              <ListPrefix>
                <span
                  className={`${styles.shortcutIcon} ${run.status === "FAILED" ? styles.kpiCritical : styles.kpiPositive}`}
                >
                  <IconRefresh size={13} />
                </span>
              </ListPrefix>
              <ListContent>
                <ListTitle>
                  <span className={styles.logHead}>
                    <span className={styles.logMovie}>{BATCH_JOBS[run.job_name] ?? run.job_name}</span>
                    <span className={ui.caption}>{run.scheduled_for}</span>
                    <StateBadge tone={BATCH_TONES[run.status]}>
                      {BATCH_LABELS[run.status]}
                    </StateBadge>
                  </span>
                </ListTitle>
                <ListDetail>
                  {run.status === "FAILED"
                    ? (run.last_error ?? "실패")
                    : `처리 ${run.processed_count}건 · 신규 ${run.inserted_count} · 갱신 ${run.updated_count}` +
                      (run.failed_count > 0 ? ` · 실패 ${run.failed_count}` : "")}
                </ListDetail>
              </ListContent>
            </ListItem>
          ))}
        </ListRoot>
      </section>

      <section className={`${ui.card} ${styles.panel}`} aria-labelledby="queue-title">
        <div className={ui.cardHead}>
          <CardTitle id="queue-title">인증대기 목록</CardTitle>
          <span className={ui.score}>{pendingCount}건</span>
        </div>
        <ListRoot>
          {pendingMovies.length === 0 && <ContentPlaceholderRoot>인증 대기 중인 영화가 없습니다.</ContentPlaceholderRoot>}
          {pendingMovies.map((movie) => (
            <ListItem
              key={movie.id}
              className={styles.queueRow}
              onClick={() => router.push(`/movies/${movie.id}`)}
            >
              <ListPrefix>
                <MoviePoster movie={movie} />
              </ListPrefix>
              <ListContent>
                <ListTitle>{movie.title_ko}</ListTitle>
                <ListDetail>
                  <span className={styles.queueMeta}>
                    <span className={ui.score}>{movie.pop_talk_score ?? "—"}점</span>
                    <span className={ui.caption}>{movie.source_synced_at.split(" ")[0]}</span>
                  </span>
                </ListDetail>
              </ListContent>
              <ListSuffix>
                <IconChevronRight size={13} />
              </ListSuffix>
            </ListItem>
          ))}
        </ListRoot>
        <div className={ui.cardFoot}>
          <Link href="/review" className={ui.textButton}>
            서비스 영화 전체 보기 <IconChevronRight size={12} />
          </Link>
        </div>
      </section>
    </div>
  );
}
