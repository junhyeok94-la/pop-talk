"use client";

import {
  ActionButton,
  ContentPlaceholderRoot,
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsTrigger,
  Text,
} from "@seed-design/react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/confirm-modal";
import { useToast } from "@/components/snackbar";
import { fetchMemberDetail, patchMemberStatus, type MemberDetail } from "@/lib/api";
import { use, useEffect, useState } from "react";

import { StateBadge, type StateTone } from "@/components/state-badge";
import { SummaryCards, type SummaryItem } from "@/components/summary-cards";
import { PopcornScore } from "@/components/popcorn-score";
import { CardTitle, PageSub } from "@/components/typography";
import { DateTimeCell } from "@/components/date-time-cell";
import {
  MOCK_MEMBERS,
  MOCK_REVIEWS,
  MOCK_SURVEYS,
  type MemberStatus,
} from "@/lib/mock";
import {
  IconCategory,
  IconChevronLeft,
  IconClock,
  IconData,
  IconReview,
  IconTrendUp,
} from "@/lib/icons";
import ui from "@/styles/ui.module.css";
import styles from "./page.module.css";

const STATUS_LABELS: Record<MemberStatus, string> = {
  ACTIVE: "정상",
  SUSPENDED: "정지",
  WITHDRAWN: "탈퇴",
};

const STATUS_TONES: Record<MemberStatus, StateTone> = {
  ACTIVE: "positive",
  SUSPENDED: "critical",
  WITHDRAWN: "neutral",
};


/** 설문 한 문항. 답이 없으면 "건너뜀"으로 표시한다. */
/**
 * 회원이 고른 취향 카테고리 하나.
 *
 * 어느 분류(장르·분위기·테마·상황)인지 함께 보여준다 — 코드만으로는
 * 운영자가 카테고리 관리 화면과 맞춰 보기 어렵다.
 */
/** users.onboarding_status의 네 값. DB CHECK와 같다. */
const SURVEY_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "미응답",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  SKIPPED: "건너뜀",
};

const TYPE_LABEL: Record<string, string> = {
  GENRE: "장르",
  MOOD: "분위기",
  THEME: "테마",
  RATING: "관람등급",
  SITUATION: "상황",
};

function SurveyChip({ code, name, type }: { code: string; name: string; type: string }) {
  return (
    <span className={styles.surveyChip}>
      {name}
      <span className={styles.surveyChipMeta}>
        {TYPE_LABEL[type] ?? type} · {code}
      </span>
    </span>
  );
}

export default function MemberDetailPage({ params }: PageProps<"/members/[id]">) {
  const router = useRouter();
  const { id } = use(params);
  // 요약 카드가 탭을 여는 버튼이라 탭 상태를 직접 들고 있는다.
  const [tab, setTab] = useState("account");
  /*
   * 회원 정보·감상평·설문을 한 번에 받는다(/admin-api/members/:id).
   *
   * 셋을 따로 부르면 왕복이 세 번이 되고, 하나만 늦게 도착해 화면이
   * 덜컹거린다.
   *
   * 목으로 시작해 응답이 오면 갈아끼운다. id가 uuid라 Number()로 바꾸면
   * NaN이 된다 — 문자열 그대로 쓴다.
   */
  const [detail, setDetail] = useState<MemberDetail | null>(() => {
    const found = MOCK_MEMBERS.find((m) => m.id === id);
    if (!found) return null;
    return {
      member: found,
      survey: MOCK_SURVEYS[found.id] ?? null,
      // 목에는 회원 id가 없어 이름으로 잇는다. 서버는 user_id로 조회한다.
      reviews: MOCK_REVIEWS.filter((r) => r.author === found.name),
    };
  });
  /* 아직 응답을 기다리는 중인가. 없는 회원과 구분해야 한다. */
  const [loading, setLoading] = useState(true);
  /* 상태를 저장하는 중. 버튼을 잠가 두 번 눌리지 않게 한다. */
  const [saving, setSaving] = useState(false);
  /* 정지는 회원이 서비스를 못 쓰게 만드는 일이라 한 번 더 묻는다. */
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const controller = new AbortController();
    fetchMemberDetail(id, controller.signal).then((res) => {
      if (controller.signal.aborted) return;
      // 실패하면 목을 유지한다. 없는 회원이면 아래에서 걸러진다.
      if (res) setDetail(res);
      setLoading(false);
    });
    return () => controller.abort();
  }, [id]);

  /*
   * 기다리는 동안 "존재하지 않는 회원"이라고 말하지 않는다. 실 DB의 회원은
   * 목에 없으므로 첫 렌더에서 detail이 비어 있다 — 그때 없다고 단정하면
   * 멀쩡한 회원이 잠깐 사라진 것처럼 보인다.
   */
  if (!detail) {
    return (
      <div className={ui.pageTight}>
        <ContentPlaceholderRoot>
          {loading ? "불러오는 중…" : "존재하지 않는 회원입니다."}
        </ContentPlaceholderRoot>
      </div>
    );
  }

  const { member, survey, reviews } = detail;
  const suspended = member.status === "SUSPENDED";

  /*
   * 정지하면 실제로 서비스를 못 쓰게 된다 — WAS가 로그인과 토큰 갱신에서
   * 이 값을 보고 403으로 막는다. 화면 표시가 아니다.
   *
   * 저장이 끝난 뒤에 화면을 바꾼다. 실패하면 이유를 알리고 상태는 그대로 둔다.
   * 탈퇴(WITHDRAWN)는 다루지 않는다 — 회원 본인이 하는 처리다.
   */
  const applyStatus = async () => {
    const next = suspended ? "ACTIVE" : "SUSPENDED";
    setSaving(true);
    const res = await patchMemberStatus(member.id, next);
    setSaving(false);
    setConfirming(false);
    if (!res.ok) {
      toast(res.message, "critical");
      return;
    }
    setDetail((prev) => (prev ? { ...prev, member: { ...prev.member, status: next } } : prev));
    toast(
      next === "SUSPENDED"
        ? `“${member.name}” 회원을 정지했습니다. 로그인이 막힙니다.`
        : `“${member.name}” 회원의 정지를 해제했습니다.`,
      next === "SUSPENDED" ? "critical" : "positive",
    );
  };

  const summary: SummaryItem[] = [
    {
      key: "reviews",
      label: "감상평",
      value: member.review_count,
      caption: "작성 건수",
      icon: IconReview,
      tone: "brand",
      active: tab === "reviews",
      onClick: () => setTab("reviews"),
    },
    {
      key: "survey",
      label: "취향 설문",
      value: SURVEY_STATUS_LABEL[survey?.status ?? "NOT_STARTED"],
      caption:
        survey && survey.categories.length > 0
          ? `${survey.categories.length}개 취향 선택`
          : "콜드스타트 대상",
      icon: IconCategory,
      tone: survey?.status === "COMPLETED" ? "positive" : "neutral",
      active: tab === "survey",
      onClick: () => setTab("survey"),
    },
  ];

  // 별점은 0.5 단위라 반올림하면 뭉개진다. 소수 한 자리로 둔다.
  const avgScore =
    reviews.length > 0
      ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
      : null;

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <button type="button" className={styles.back} aria-label="뒤로" onClick={() => router.back()}>
          <IconChevronLeft size={16} />
        </button>
        <div>
          <h1 className={styles.headerTitle}>{member.name}</h1>
          <p className={ui.caption}>
            {member.email} · 회원번호 {member.id}
          </p>
        </div>
        <div className={styles.headerRight}>
          <StateBadge tone={STATUS_TONES[member.status]}>
            {STATUS_LABELS[member.status]}
          </StateBadge>
          {/*
            탈퇴 회원에게는 버튼을 두지 않는다 — 서버도 거부한다.
            되살리는 것은 다른 판단이고 그 경로가 아직 없다.
          */}
          {member.status !== "WITHDRAWN" && (
            <ActionButton
              type="button"
              variant={suspended ? "neutralOutline" : "criticalSolid"}
              size="medium"
              disabled={saving}
              onClick={() => setConfirming(true)}
            >
              {saving ? "저장 중…" : suspended ? "정지 해제" : "정지"}
            </ActionButton>
          )}
        </div>
      </header>

      {/* 다른 화면과 같은 규칙 — 상단에 주요 정보를 요약 카드로 얹고 버튼으로 쓴다. */}
      <SummaryCards items={summary} />

      {/* 계정·설문·감상평·배치는 성격이 달라 한 화면에 쌓지 않고 탭으로 나눈다. */}
      <TabsRoot
        value={tab}
        onValueChange={setTab}
        triggerLayout="hug"
        size="medium"
        className={styles.tabs}
      >
        <TabsList>
          <TabsTrigger value="account">계정</TabsTrigger>
          <TabsTrigger value="survey">취향 설문</TabsTrigger>
          <TabsTrigger value="reviews">감상평 {reviews.length > 0 && `(${reviews.length})`}</TabsTrigger>
          <TabsIndicator />
        </TabsList>

        <TabsContent value="account">
          <section className={`${ui.card} ${styles.block}`} aria-labelledby="account-title">
            <div className={ui.cardHead}>
              <CardTitle id="account-title">계정 정보</CardTitle>
              <IconData size={14} />
            </div>
            <dl className={styles.specs}>
              <div>
                <dt>가입일</dt>
                <dd>{member.joined_at}</dd>
              </div>
              <div>
                <dt>상태</dt>
                <dd>{STATUS_LABELS[member.status]}</dd>
              </div>
              <div>
                <dt>감상평</dt>
                <dd>{member.review_count}건</dd>
              </div>
              <div>
                <dt>상태 수정</dt>
                <dd>
                  {member.status_updated_by ? (
                    <>
                      {member.status_updated_by}
                      <DateTimeCell value={member.status_updated_at} />
                    </>
                  ) : (
                    <span className={ui.muted}>—</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>
        </TabsContent>

        <TabsContent value="survey">
          <section className={`${ui.card} ${styles.block}`} aria-labelledby="survey-title">
            <div className={ui.cardHead}>
              <CardTitle id="survey-title">가입 시 취향 선택</CardTitle>
              <span className={ui.caption}>
                {SURVEY_STATUS_LABEL[survey?.status ?? "NOT_STARTED"]}
              </span>
            </div>

            {/*
              회원가입에서 묻는 것은 카테고리 복수 선택 하나다.
              전에는 Q1~Q6 문항으로 그렸는데, WAS가 취향 저장을
              users.onboarding_movie_category_ids 하나로 바꾸면서 그 문항들이
              담길 자리가 없어졌다. 없는 것을 "건너뜀"으로 그리면 응답한
              사람도 안 한 것처럼 보인다.
            */}
            {!survey || survey.categories.length === 0 ? (
              <ContentPlaceholderRoot>
                {survey?.status === "COMPLETED"
                  ? "온보딩을 마쳤지만 남은 취향이 없습니다. 고른 카테고리가 지워졌을 수 있습니다."
                  : "아직 취향을 고르지 않았습니다. 추천은 인기작 기반으로 나갑니다."}
              </ContentPlaceholderRoot>
            ) : (
              <div className={styles.surveyChips}>
                {survey.categories.map((c) => (
                  <SurveyChip key={c.code} code={c.code} name={c.name} type={c.type} />
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="reviews">
          <section className={`${ui.card} ${styles.block}`} aria-labelledby="review-title">
            <div className={ui.cardHead}>
              <CardTitle id="review-title">감상평 작성 정보</CardTitle>
              <IconReview size={14} />
            </div>
            <div className={styles.reviewStats}>
              <div>
                <Text as="span" textStyle="t2Regular" color="fg.neutralMuted">
                  작성 수
                </Text>
                <p className={styles.statValue}>{member.review_count}건</p>
              </div>
              <div>
                <Text as="span" textStyle="t2Regular" color="fg.neutralMuted">
                  평균 팝콘점수
                </Text>
                <p className={styles.statValue}>
                  {avgScore != null ? <PopcornScore value={avgScore} size={14} /> : "—"}
                </p>
              </div>
            </div>

            <PageSub as="p">최근 감상평</PageSub>
            {reviews.length === 0 ? (
              <ContentPlaceholderRoot>작성한 감상평이 없습니다.</ContentPlaceholderRoot>
            ) : (
              <ul className={styles.reviewList}>
                {reviews.map((review) => (
                  <li key={review.id} className={styles.reviewItem}>
                    <div className={styles.reviewHead}>
                      <span className={styles.reviewMovie}>{review.movie}</span>
                      <PopcornScore value={review.rating} size={12} />
                    </div>
                    <p className={styles.reviewContent}>{review.content}</p>
                    <div className={styles.reviewFoot}>
                      <span className={ui.caption}>
                        <IconClock size={11} /> {review.created_at}
                      </span>
                      {review.status === "HIDDEN" && <span className={ui.tagNeutral}>숨김</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {reviews.length < member.review_count && (
              <p className={styles.blockNote}>
                <IconTrendUp size={11} /> 전체 {member.review_count}건 중 최근 {reviews.length}건만
                표시합니다.
              </p>
            )}
          </section>
        </TabsContent>

      </TabsRoot>

      {/*
        정지는 되돌릴 수 있지만 그 사이 회원이 로그인하지 못한다.
        무엇이 일어나는지 분명히 적어 한 번 더 묻는다.
      */}
      <ConfirmModal
        open={confirming}
        title={suspended ? "정지 해제" : "회원 정지"}
        description={
          suspended
            ? `“${member.name}” 회원이 다시 로그인할 수 있게 됩니다.`
            : `“${member.name}” 회원의 로그인이 막힙니다. 이미 접속 중이어도 곧 끊깁니다.`
        }
        confirmLabel={suspended ? "정지 해제" : "정지"}
        tone={suspended ? "brand" : "critical"}
        onConfirm={() => void applyStatus()}
        onClose={() => setConfirming(false)}
      />

    </div>
  );
}
