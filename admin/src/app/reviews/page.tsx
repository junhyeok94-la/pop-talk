"use client";

import {
  ActionButton,
  ContentPlaceholderRoot,
  Divider,
  TextFieldInput,
  TextFieldPrefixIcon,
  TextFieldRoot,
  VisuallyHidden,
} from "@seed-design/react";
import { useEffect, useRef, useState } from "react";

import { PageSub, PageTitle } from "@/components/typography";
import { DateRangeFilter } from "@/components/date-range-filter";
import { SelectField } from "@/components/select-field";
import { Modal } from "@/components/modal";
import { Pagination } from "@/components/pagination";
import { PopcornScore } from "@/components/popcorn-score";
import { StateBadge, type StateTone } from "@/components/state-badge";
import { SummaryCards, type SummaryItem } from "@/components/summary-cards";
import { useToast } from "@/components/snackbar";
import { fetchReviews, patchReviewStatus } from "@/lib/api";
import { type Review } from "@/lib/mock";
import { IconApprove, IconHidden, IconReview, IconSearch } from "@/lib/icons";
import ui from "@/styles/ui.module.css";
import styles from "./page.module.css";

const STATUS_LABELS: Record<Review["status"], string> = {
  NORMAL: "정상",
  HIDDEN: "숨김",
  DELETED: "삭제됨",
};

const STATUS_TONES: Record<Review["status"], StateTone> = {
  NORMAL: "positive",
  HIDDEN: "neutral",
  DELETED: "critical",
};

/**
 * dev.reviews.source_system을 목록에 보이는 글자로 옮긴다.
 *
 * **비어 있으면 회원이 앱에서 직접 쓴 것이다.** 수집분이 아니라는 뜻이지
 * 값을 모른다는 뜻이 아니다(008의 CHECK가 source_* 셋을 묶어 둔다). 실
 * 데이터에 이미 둘이 섞여 있다 — 2026-08-13 기준 119,206건 중 회원 감상평이
 * 함께 들어와 있어서, 전부 "네이버 영화"로 찍으면 오늘 당장 틀린 표시가 된다.
 *
 * 지금 들어오는 값은 소문자 'naver_movie'다. 그런데 이 문자열을 쓰는 수집기
 * 코드가 이 저장소에 없어 언제 바뀔지 우리가 알 수 없다. 그래서 정확히
 * 맞추지 않고 naver를 품고 있는지로 느슨하게 본다. 모르는 값은 원문을 그대로
 * 내놓는다 — '기타'로 뭉치면 출처가 하나 늘어난 것을 아무도 모른 채 지나간다.
 */
function sourceLabel(source: Review["source_system"]) {
  if (!source) return "팝콘톡";
  return isNaverSource(source) ? "네이버 영화" : source;
}

function isNaverSource(source: Review["source_system"]) {
  return !!source && /naver/i.test(source);
}

/**
 * 출처 한 칸. 네이버 수집분에만 심볼이 붙는다.
 *
 * 심볼은 aria-hidden이다. 바로 옆에 "네이버 영화"가 글자로 있어서, 심볼에도
 * 이름을 달면 읽는 장치가 출처를 두 번 읽는다.
 */
function SourceCell({ source }: { source: Review["source_system"] }) {
  return (
    <span className={styles.source}>
      {isNaverSource(source) && (
        <span className={styles.naverMark} aria-hidden="true">
          N
        </span>
      )}
      {sourceLabel(source)}
    </span>
  );
}

type Filter = "ALL" | "HIDDEN";

const PAGE_SIZE = 10;

export default function ReviewsPage() {
  /*
   * 목 데이터로 첫 화면을 그리지 않는다.
   *
   * 목은 22건이 한 배열에 들어 있는데 서버는 PAGE_SIZE(10)씩 잘라 보낸다.
   * 아래 paginated가 "서버가 이미 잘랐다"는 전제로 자르지 않으므로, 목으로
   * 시작하면 첫 페인트에 22줄이 통째로 그려졌다가 10줄로 바뀐다. 화면이
   * 한 번 접혔다 펴지는 것처럼 보인다.
   *
   * 그래서 빈 목록으로 시작하고, 조회가 끝날 때까지 "불러오는 중"을 둔다.
   *
   * DB가 없을 때 화면이 비지 않게 하려던 원래 의도는 서버가 지킨다 —
   * admin-api 라우트가 DB를 못 읽으면 목을 200으로 내려준다. 그래서 화면은
   * 목을 알 필요가 없다.
   */
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ all: 0, hidden: 0 });
  /** 첫 조회가 끝났는가. 끝나기 전의 빈 목록은 "결과 없음"이 아니다. */
  const [loaded, setLoaded] = useState(false);
  /* 같은 값을 조회 안에서도 읽는다. 상태로 읽으면 조회가 매번 다시 돈다. */
  const loadedRef = useRef(false);
  /** 조회가 실패했을 때 표에 띄울 안내. 성공하면 지운다. */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Review | null>(null);
  /* 저장 중인 감상평 id. 그 줄의 버튼만 잠근다. */
  const [saving, setSaving] = useState<string | null>(null);
  const toast = useToast();
  // 요약 카드(filter)는 "전체·숨김" 빠른 보기고, 아래 statusFilter와는 별개 축이다.
  const [statusFilter, setStatusFilter] = useState("");
  const [createdRange, setCreatedRange] = useState({ from: "", to: "" });

  /*
   * 검색어는 한 박자 늦춰 보낸다.
   *
   * 글자마다 조회를 날리면 "재미있는"을 치는 동안 다섯 번 나간다. 2만 건을
   * 훑는 조회라 서버도 아깝고, 응답이 순서를 바꿔 도착하면 마지막에 친 것과
   * 다른 결과가 남는다.
   */
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /*
   * 거르기와 쪽 나누기를 서버가 한다. 실 DB에 2만 건이 있어 전부 받아
   * 자바스크립트로 거를 수 없다.
   *
   * 조건이 바뀌면 1쪽으로 돌아간다 — 3쪽을 보다 검색어를 넣으면 결과가
   * 세 건뿐일 수 있고, 그때 3쪽은 빈 화면이다.
   */
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setPage(1);
  }, [filter, statusFilter, debouncedSearch, createdRange.from, createdRange.to]);

  useEffect(() => {
    const controller = new AbortController();
    /*
     * 시간 제한을 건다.
     *
     * 로드밸런서가 60초 넘게 놀린 연결을 응답 없이 끊는다. 브라우저가 그 연결을
     * 살아 있다고 믿고 요청하면 응답이 영영 오지 않고, fetch는 스스로 포기하지
     * 않는다. 그러면 화면이 "불러오는 중"에 갇힌다.
     *
     * 12초를 넘기면 우리가 끊고 안내를 띄운다. 새로고침하면 새 연결이라 열린다.
     */
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 12_000);
    fetchReviews(
      {
        page,
        size: PAGE_SIZE,
        q: debouncedSearch,
        // 카드(전체·숨김)가 상태 선택보다 앞선다. 숨김 카드를 누른 상태에서
        // 다른 상태를 고르는 것은 서로 어긋나는 요구다.
        status: filter === "HIDDEN" ? "HIDDEN" : statusFilter,
        from: createdRange.from,
        to: createdRange.to,
      },
      controller.signal,
    ).then((res) => {
      clearTimeout(timer);
      // 화면을 떠나서 끊은 것이면 아무것도 하지 않는다. 시간 초과는 알려야 한다.
      if (controller.signal.aborted && !timedOut) return;
      if (!res) {
        /*
         * 목으로 메우지 않는다.
         *
         * DB가 없는 경우는 서버가 이미 목을 200으로 내려준다(admin-api 라우트).
         * 여기까지 실패가 온 것은 응답 자체를 못 받은 것이므로, 목을 보여주면
         * 실제와 다른 숫자를 사실인 양 띄우게 된다. 앞서 이 화면이 요청이
         * 매달린 채로 목 22건을 보여주고 있어서 실패를 아무도 몰랐다.
         */
        setLoadError(
          timedOut
            ? "감상평을 불러오지 못했습니다. 응답이 없어 12초 만에 끊었습니다. 새로고침해 주세요."
            : "감상평을 불러오지 못했습니다. 새로고침해 주세요.",
        );
        loadedRef.current = true;
        setLoaded(true);
        return;
      }
      setLoadError(null);
      setReviews(res.items);
      setTotal(res.total);
      setCounts(res.counts);
      loadedRef.current = true;
      setLoaded(true);
    });
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [page, filter, statusFilter, debouncedSearch, createdRange.from, createdRange.to]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  // 서버가 이미 잘라 보냈다. 여기서 다시 자르지 않는다.
  const paginated = reviews;

  /*
   * 숨김·되돌리기는 원장에 쓴다. 저장이 끝난 뒤에 화면을 바꾼다 — 영화
   * 인증과 같은 이유다. 실패했는데 "숨김"으로 보이는 순간을 만들지 않는다.
   *
   * 목록이 서버에서 오게 되면서 더 중요해졌다. 화면 상태만 바꾸면 쪽을
   * 넘기거나 검색어를 고치는 순간 목록을 다시 받아 표시가 사라진다.
   *
   * **관리자가 감상평을 지우는 기능은 두지 않는다.** 운영자가 하는 판단은
   * "사용자에게 보일 것인가"이지 기록을 없애는 것이 아니다. 지우면 신고가
   * 다시 들어왔을 때 근거를 확인할 수 없고 되돌릴 수도 없다. Python WAS의
   * 관리자 API도 ACTIVE·HIDDEN 둘만 받는다.
   *
   * DELETED 상태 자체는 화면에 남겨둔다 — 회원이 자기 리뷰를 지우면
   * deleted_at이 세워지므로, admin은 만들지는 못해도 볼 수는 있어야 한다.
   */
  const updateStatus = async (id: string, status: "NORMAL" | "HIDDEN") => {
    setSaving(id);
    const res = await patchReviewStatus(id, status);
    setSaving(null);
    if (!res.ok) {
      toast(res.message, "critical");
      return;
    }
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    /*
     * 숨김 개수가 바뀌었으니 요약 카드도 맞춘다. 목록을 다시 받지 않고
     * 여기서 세는 이유 — 지금 걸린 조건 그대로 다시 받으면, 숨김을 건
     * 감상평이 목록에서 사라져 방금 무엇을 했는지 보이지 않는다.
     */
    setCounts((prev) => ({
      ...prev,
      hidden: prev.hidden + (status === "HIDDEN" ? 1 : -1),
    }));
    toast(status === "HIDDEN" ? "감상평을 숨겼습니다." : "감상평을 다시 노출합니다.", "default");
  };

  const applyFromModal = (status: "NORMAL" | "HIDDEN") => {
    if (!selected) return;
    void updateStatus(selected.id, status);
    setSelected(null);
  };

  const summary: SummaryItem[] = [
    {
      key: "ALL",
      label: "전체",
      value: counts.all,
      caption: "등록된 감상평",
      icon: IconReview,
      tone: "brand",
      active: filter === "ALL",
      onClick: () => setFilter("ALL"),
    },
    {
      key: "HIDDEN",
      label: "숨김 처리됨",
      value: counts.hidden,
      caption: "노출 제외",
      icon: IconHidden,
      tone: "neutral",
      active: filter === "HIDDEN",
      onClick: () => setFilter("HIDDEN"),
    },
  ];

  return (
    <div className={ui.pageTight}>
      <div className={ui.pageHead}>
        <div>
          <PageTitle>감상평 관리</PageTitle>
          <PageSub>사용자 감상평 관리</PageSub>
        </div>
        <PageSub as="span">총 {total.toLocaleString()}건</PageSub>
      </div>

      <SummaryCards items={summary} />

      <div className={ui.filterBar}>
        <TextFieldRoot className={ui.filterSearch} value={search} onValueChange={setSearch} size="medium">
          <TextFieldPrefixIcon svg={<IconSearch />} />
          <TextFieldInput id="review-search" type="search" placeholder="작성자, 영화, 내용 검색" aria-label="작성자, 영화, 내용 검색" />
        </TextFieldRoot>

        <Divider orientation="vertical" />

        <SelectField
          id="review-status"
          className={ui.filterSelect}
          ariaLabel="상태 필터"
          placeholder="상태 전체"
          value={statusFilter}
          options={(Object.keys(STATUS_LABELS) as Review["status"][]).map((s) => ({
            value: s,
            label: STATUS_LABELS[s],
          }))}
          onChange={setStatusFilter}
        />

        <Divider orientation="vertical" />

        <DateRangeFilter
          label="작성일"
          from={createdRange.from}
          to={createdRange.to}
          onChange={setCreatedRange}
        />
      </div>

      <div className={ui.card}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th>작성자</th>
              <th>출처</th>
              <th>영화</th>
              <th>팝콘점수</th>
              <th>내용</th>
              <th>작성일</th>
              <th>상태</th>
              <th>
                <VisuallyHidden asChild>
                <span>동작</span>
              </VisuallyHidden>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr>
                <td colSpan={8}>
                  {/* 첫 조회 전의 빈 목록은 "없음"이 아니라 "아직 안 옴"이다. */}
                  {/* 셋을 가른다 — 아직 안 옴 / 못 불러옴 / 정말 없음. */}
                  <ContentPlaceholderRoot>
                    {!loaded
                      ? "감상평을 불러오는 중입니다."
                      : (loadError ?? "검색 결과가 없습니다.")}
                  </ContentPlaceholderRoot>
                </td>
              </tr>
            )}
            {paginated.map((review) => (
              <tr key={review.id} className={review.status === "HIDDEN" ? styles.dimmed : undefined}>
                <td>
                  <div className={styles.author}>
                    <span className={styles.authorName}>{review.author}</span>
                  </div>
                </td>
                <td>
                  <SourceCell source={review.source_system} />
                </td>
                <td className={styles.movie}>{review.movie}</td>
                <td>
                  <PopcornScore value={review.rating} />
                </td>
                <td>
                  <button type="button" className={styles.content} onClick={() => setSelected(review)}>
                    {review.content}
                  </button>
                </td>
                <td className={ui.muted}>{review.created_at}</td>
                <td>
                  <StateBadge tone={STATUS_TONES[review.status]}>
                    {STATUS_LABELS[review.status]}
                  </StateBadge>
                </td>
                <td>
                  <div className={styles.actions}>
                    {review.status === "HIDDEN" ? (
                      <button
                        type="button"
                        className={ui.textButton}
                        aria-label={`${review.author} 감상평 정상 처리`}
                        disabled={saving === review.id}
                        onClick={() => void updateStatus(review.id, "NORMAL")}
                      >
                        <IconApprove size={12} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={ui.textButton}
                        aria-label={`${review.author} 감상평 숨김`}
                        disabled={saving === review.id}
                        onClick={() => void updateStatus(review.id, "HIDDEN")}
                      >
                        <IconHidden size={12} />
                      </button>
                    )}
                    <button
                      type="button"
                      className={ui.textButton}
                      aria-label={`${review.author} 감상평 전문 보기`}
                      onClick={() => setSelected(review)}
                    >
                      <IconReview size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Pagination
          page={currentPage}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onChange={setPage}
        />
      </div>

      <Modal open={selected !== null} title="감상평 전문" onClose={() => setSelected(null)} width="32rem"
        footer={
          <>
            {/* footer는 open 여부와 무관하게 평가되므로 selected가 없을 수 있다. */}
            {selected?.status === "HIDDEN" ? (
              <ActionButton
                type="button"
                variant="neutralWeak"
                size="medium"
                onClick={() => applyFromModal("NORMAL")}
              >
                <IconApprove size={13} />
                정상 처리
              </ActionButton>
            ) : (
              <ActionButton
                type="button"
                variant="neutralWeak"
                size="medium"
                onClick={() => applyFromModal("HIDDEN")}
              >
                <IconHidden size={13} />
                숨김 처리
              </ActionButton>
            )}
          </>
        }
      >
        {selected && (
          <>
            <div className={styles.modalHead}>
              <div className={styles.author}>
                <div>
                  <div className={styles.authorName}>{selected.author}</div>
                  <div className={ui.muted}>
                    {selected.created_at} · {selected.movie}
                  </div>
                </div>
              </div>
              <div className={styles.modalMeta}>
                <PopcornScore value={selected.rating} size={16} />
              </div>
            </div>

            <blockquote className={styles.quote}>{selected.content}</blockquote>

          </>
        )}
      </Modal>
    </div>
  );
}
