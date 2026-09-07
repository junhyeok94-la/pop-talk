"use client";

import {
  ActionButton,
  CalloutContent,
  CalloutDescription,
  CalloutRoot,
  CheckboxControl,
  CheckboxHiddenInput,
  CheckboxIndicator,
  CheckboxLabel,
  CheckboxRoot,
  ContentPlaceholderRoot,
  FieldHeader,
  FieldLabel,
  FieldRoot,
  SliderControl,
  SliderHiddenInput,
  SliderRange,
  SliderRoot,
  SliderThumb,
  SliderTrack,
  TextFieldInput,
  TextFieldRoot,
  TextFieldTextarea,
  VisuallyHidden,
} from "@seed-design/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { PageSub, PageTitle } from "@/components/typography";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/snackbar";
import { MoviePoster } from "@/components/movie-poster";
import { APPROVAL_CONFIG, SERVICE_CONFIG, StatusBadge } from "@/components/status-badge";
import { StateBadge } from "@/components/state-badge";
import { isCompletenessKnown, missingLabels } from "@/lib/movie-fields";
import { fetchCategories, fetchMovie, putMovieCategories } from "@/lib/api";
import { SummaryCards, type SummaryItem } from "@/components/summary-cards";
import { useAdminStore } from "@/lib/admin-store";
import {
  directorOf,
  releaseYearOf,
  type EmbeddingStatus,
  type Movie,
  type MovieCategory,
  type MovieEmbedding,
} from "@/lib/mock";
import type { LogAction } from "@/lib/mock";
import {
  IconApprove,
  IconMovie,
  IconTrendUp,
  IconData,
  IconChevronLeft,
  IconEdit,
  IconExternal,
  IconRefresh,
  IconUncertify,
} from "@/lib/icons";
import ui from "@/styles/ui.module.css";
import styles from "./page.module.css";

type ModalType = "edit" | "reject" | null;

const ACTION_LABELS: Record<LogAction, string> = {
  APPROVE: "인증완료",
  EDIT: "정보 수정",
  RESTORE: "재검토 복귀",
  REJECT: "반려",
};

const ACTION_DOTS: Record<LogAction, string> = {
  APPROVE: styles.dotPositive,
  EDIT: styles.dotInformative,
  RESTORE: styles.dotMagic,
  REJECT: styles.dotNeutral,
};

const EMBEDDING_LABELS: Record<EmbeddingStatus, string> = {
  PENDING: "대기",
  PROCESSING: "생성 중",
  READY: "완료",
  FAILED: "실패",
  // 원문이 바뀌어 재생성이 필요한 상태.
  STALE: "재생성 필요",
};

const EMBEDDING_TONES: Record<EmbeddingStatus, string> = {
  PENDING: styles.dotNeutral,
  PROCESSING: styles.dotInformative,
  READY: styles.dotPositive,
  FAILED: styles.embeddingFailed,
  STALE: styles.dotNeutral,
};

export default function MovieDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const { movies, embeddings, logs, approveMovie, rejectMovie, restoreMovie, editMovie } =
    useAdminStore();

  /*
   * 영화에 붙는 것은 **카테고리**다(movie_categories). 전에는 스토어의
   * 화면 문구(display_categories)를 체크박스로 나열하고 있었는데, 009에서
   * 문구의 name을 챗봇 프롬프트 문장으로 바꾸자 라벨이
   * "퇴근하고 편하게 쉬면서 볼 영화가 필요해요."로 바뀌어 버렸다.
   *
   * 문구는 카테고리를 사용자에게 보여주는 말이라 영화와 직접 관계가 없다.
   * 꺼진 카테고리는 새로 붙일 수 없게 뺀다.
   */
  const [movieCategories, setMovieCategories] = useState<MovieCategory[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetchCategories(controller.signal).then((list) => {
      if (!controller.signal.aborted && list) setMovieCategories(list.filter((c) => c.is_active));
    });
    return () => controller.abort();
  }, []);

  /*
   * 목록이 쪽 단위로 오게 되면서 스토어에 이 영화가 없을 수 있다. 전에는
   * 300편이 다 들어 있어 여기서 찾으면 됐다.
   *
   * 스토어에 있으면 그것으로 먼저 그리고(즉시 보인다), 서버에서 받아오면
   * 갈아끼운다 — 상세는 목록이 안 주는 media·plot까지 필요하다.
   */
  const stored = movies.find((m) => String(m.id) === params.id);
  const [fetched, setFetched] = useState<{ movie: Movie; embeddings: MovieEmbedding[] } | null>(
    null,
  );
  /* 아직 기다리는 중인가. 없는 영화와 구분해야 한다. */
  const [loading, setLoading] = useState(true);

  /*
   * 주소의 id가 정수가 아니면 부르지 않는다. 서버도 422로 막지만 헛걸음을
   * 만들 이유가 없다. 렌더 중에 판단해 effect가 곧바로 setState 하지 않게 한다.
   */
  const numericId = Number(params.id);
  const validId = Number.isInteger(numericId) && numericId > 0;

  useEffect(() => {
    if (!validId) return;
    const controller = new AbortController();
    fetchMovie(numericId, controller.signal).then((res) => {
      if (controller.signal.aborted) return;
      if (res) setFetched(res);
      setLoading(false);
    });
    return () => controller.abort();
  }, [numericId, validId]);

  const movie = fetched?.movie ?? stored;

  const [modal, setModal] = useState<ModalType>(null);
  /* 판정이 원장에 저장되는 동안. 버튼을 잠가 두 번 눌리지 않게 한다. */
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editForm, setEditForm] = useState({
    pop_talk_score: movie?.pop_talk_score ?? 0,
    categories: movie?.categories ?? [],
    plot: movie?.plot ?? "",
  });

  const movieLogs = useMemo(
    () => (movie ? logs.filter((l) => l.movie === movie.title_ko) : []),
    [logs, movie],
  );

  /*
   * 기다리는 동안 "찾을 수 없다"고 말하지 않는다. 목록에 없는 영화를 주소로
   * 열면 첫 렌더에서 stored가 비어 있다 — 그때 없다고 단정하면 멀쩡한 영화가
   * 잠깐 사라진 것처럼 보인다.
   */
  if (!movie) {
    return (
      <div className={ui.page}>
        <PageTitle>{loading && validId ? "불러오는 중…" : "영화를 찾을 수 없습니다"}</PageTitle>
        <div className={ui.card}>
          <ContentPlaceholderRoot>
            {loading && validId ? "잠시만 기다려 주세요." : "요청하신 영화가 없습니다."}
          </ContentPlaceholderRoot>
        </div>
        <div>
          <ActionButton type="button" variant="neutralWeak" size="medium" onClick={() => router.push("/review")}>
            서비스 영화로 돌아가기
          </ActionButton>
        </div>
      </div>
    );
  }

  const isPending = movie.approval_status === "PENDING";
  const isApproved = movie.approval_status === "APPROVED";
  const isRejected = movie.approval_status === "REJECTED";
  // 비어 있는 필드의 한글 이름. 뷰가 준 컬럼 이름을 옮긴 것이다.
  const missing = missingLabels(movie);
  // 받아온 것을 먼저 본다. 스토어 것은 목록에 있던 영화에만 있다.
  const embedding =
    fetched?.embeddings.find((e) => e.movie_id === movie.id) ??
    embeddings.find((e) => e.movie_id === movie.id);
  // 뷰가 is_embedded를 계산해 준다. 목 데이터에는 없어 임베딩 행 상태로 대체한다.
  const isEmbedded = movie.is_embedded ?? embedding?.status === "READY";

  const openEdit = () => {
    setEditForm({
      pop_talk_score: movie.pop_talk_score ?? 0,
      categories: [...movie.categories],
      plot: movie.plot ?? "",
    });
    setEditNote("");
    setModal("edit");
  };

  const submitReject = async () => {
    // DB CHECK 제약상 반려에는 사유가 반드시 있어야 한다. 빈 값이면 막는다.
    const reason = note.trim();
    if (!reason) return;

    // 저장이 끝나기 전에는 화면을 떠나지 않는다. 실패하면 모달을 열어둔 채
    // 이유를 알려, 사용자가 다시 시도하거나 사유를 고칠 수 있게 한다.
    setSaving(true);
    const res = await rejectMovie(movie.id, reason);
    setSaving(false);
    if (!res.ok) {
      toast(res.message, "critical");
      return;
    }

    setModal(null);
    setNote("");
    toast(`“${movie.title_ko}”을(를) 반려했습니다.`, "critical");
    router.push("/review");
  };

  /*
   * 카테고리는 원장에 쓰고, 나머지는 아직 화면 상태로만 둔다.
   *
   * 팝콘점수와 줄거리는 저장할 컬럼이 없다 — pop_talk_score는 지워진
   * dev.movies에만 있던 값이고, 줄거리 수정은 movie_editorial.plot_override가
   * 받지만 아직 붙이지 않았다. 둘을 저장한 것처럼 보이게 두지 않으려고
   * 안내 문구를 다르게 준다.
   */
  const submitEdit = async () => {
    setSaving(true);
    const res = await putMovieCategories(movie.id, editForm.categories);
    setSaving(false);

    if (!res.ok) {
      toast(res.message, "critical");
      return;
    }

    editMovie(
      movie.id,
      {
        pop_talk_score: editForm.pop_talk_score,
        categories: res.categories,
        plot: editForm.plot,
      },
      editNote.trim() || "정보 수정",
    );
    setModal(null);
    toast("카테고리를 저장했습니다.", "positive");
  };

  // 다른 화면과 같은 규칙 — 상단에 이 영화의 핵심 지표를 요약 카드로 얹는다.
  const summary: SummaryItem[] = [
    {
      key: "approval",
      label: "인증 상태",
      value: APPROVAL_CONFIG[movie.approval_status].label,
      caption: movie.approved_by ? `${movie.approved_by} 처리` : "미처리",
      icon: IconApprove,
      tone: movie.approval_status === "APPROVED" ? "positive"
        : movie.approval_status === "REJECTED" ? "critical" : "neutral",
    },
    {
      key: "service",
      label: "노출 상태",
      value: SERVICE_CONFIG[movie.service_status].label,
      caption: movie.service_status === "PUBLISHED" ? "사용자 화면 노출 중" : "노출 안 됨",
      icon: IconMovie,
      tone: movie.service_status === "PUBLISHED" ? "positive" : "neutral",
    },
    {
      key: "score",
      label: "팝콘점수",
      value: movie.pop_talk_score ?? "—",
      caption: movie.pop_talk_score != null ? "/ 100" : "아직 집계 전",
      icon: IconTrendUp,
      tone: "brand",
    },
    {
      key: "embedding",
      label: "추천 임베딩",
      value: isEmbedded ? "완료" : EMBEDDING_LABELS[embedding?.status ?? "PENDING"],
      caption: isEmbedded ? "추천 대상" : "추천에 안 잡힘",
      icon: IconData,
      tone: isEmbedded ? "positive" : embedding?.status === "FAILED" ? "critical" : "neutral",
    },
  ];

  const handleApprove = async () => {
    setSaving(true);
    const res = await approveMovie(movie.id);
    setSaving(false);
    if (!res.ok) {
      toast(res.message, "critical");
      return;
    }
    toast(`“${movie.title_ko}”을(를) 인증했습니다.`, "positive");
    router.push("/review");
  };

  /*
   * 반려를 되돌린다. 스토어에 있으면서 화면에는 연결돼 있지 않아, 반려된
   * 영화는 어떤 방법으로도 되살릴 수 없었다.
   *
   * 바로 인증하지 않고 인증대기로 보낸다 — 되돌리는 것과 인증하는 것은
   * 다른 판단이고, 검수 목록을 거치는 편이 이력이 분명하다.
   */
  const handleRestore = async () => {
    setSaving(true);
    const res = await restoreMovie(movie.id);
    setSaving(false);
    if (!res.ok) {
      toast(res.message, "critical");
      return;
    }
    toast(`“${movie.title_ko}”을(를) 인증대기로 되돌렸습니다.`, "default");
  };

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <button type="button" className={styles.back} aria-label="뒤로" onClick={() => router.back()}>
          <IconChevronLeft size={16} />
        </button>
        <div>
          <h1 className={styles.headerTitle}>{movie.title_ko}</h1>
          <p className={ui.caption}>
            {movie.title_en} · {movie.kofic_movie_cd}
          </p>
        </div>
        <div className={styles.headerRight}>
          {/* 상태는 요약 카드가 보여주므로 헤더에서는 뺀다. */}
        </div>
      </header>

      <div className={styles.summary}>
        <SummaryCards items={summary} />
      </div>

      <div className={styles.body}>
        <div className={styles.info}>
          <div className={styles.hero}>
            <MoviePoster movie={movie} width="160px" className={styles.heroPoster} />
            <div className={styles.heroMain}>
              <div>
                <h2 className={styles.movieTitle}>{movie.title_ko}</h2>
                <PageSub>{movie.title_en}</PageSub>
              </div>

              <dl className={styles.specs}>
                <div>
                  <dt>개봉</dt>
                  <dd>{releaseYearOf(movie)}년</dd>
                </div>
                <div>
                  <dt>러닝타임</dt>
                  <dd>{movie.runtime_minutes ?? "—"}분</dd>
                </div>
                <div>
                  <dt>관람등급</dt>
                  <dd>{movie.viewing_grade ?? "—"}</dd>
                </div>
                <div>
                  <dt>감독</dt>
                  <dd>{directorOf(movie)}</dd>
                </div>
              </dl>

              <div>
                <span className={styles.label}>출연</span>
                <div className={ui.tagRow}>
                  {movie.actors.map((actor) => (
                    <span key={actor} className={ui.tagNeutral}>
                      {actor}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className={styles.label}>장르</span>
                <div className={ui.tagRow}>
                  {movie.genres.map((genre) => (
                    <span key={genre} className={styles.genreTag}>
                      {genre}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <section>
            <h3 className={styles.sectionTitle}>줄거리</h3>
            <p className={styles.synopsis}>{movie.plot}</p>
          </section>

          <div className={styles.kmdb}>
            <span>
              KOFIC <code className={styles.mono}>{movie.kofic_movie_cd}</code>
              {movie.kmdb_id && <> · KMDB <code className={styles.mono}>{movie.kmdb_id}</code></>}
            </span>
            <button type="button" className={ui.textButton}>
              <IconExternal size={11} />
              KMDB 원본
            </button>
          </div>
        </div>

        <aside className={styles.panel}>
          {/* 추천은 CLOVA 분류가 아니라 bge-m3 임베딩 벡터 검색 기반이다.
              영화가 바뀌면 트리거가 임베딩 작업을 큐에 넣고, 이 패널은 그 결과를 보여준다. */}
          <section className={`${ui.card} ${styles.panelCard}`}>
            <div className={styles.panelHead}>
              <h3 className={styles.sectionTitle}>추천 임베딩</h3>
              <button type="button" className={ui.textButton}>
                <IconRefresh size={10} />
                재생성
              </button>
            </div>

            {!embedding ? (
              <p className={ui.caption}>
                {isEmbedded
                  ? "임베딩이 생성되어 있습니다."
                  : "아직 생성된 임베딩이 없습니다."}
              </p>
            ) : (
              <dl className={styles.embedding}>
                <div>
                  <dt>상태</dt>
                  <dd>
                    <span className={`${styles.embeddingTag} ${EMBEDDING_TONES[embedding.status]}`}>
                      {EMBEDDING_LABELS[embedding.status]}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>모델</dt>
                  <dd>
                    <code className={styles.mono}>{embedding.embedding_model}</code>
                  </dd>
                </div>
                <div>
                  <dt>시도</dt>
                  <dd>{embedding.attempts}회</dd>
                </div>
                <div>
                  <dt>생성일시</dt>
                  <dd>{embedding.embedded_at ?? "—"}</dd>
                </div>
              </dl>
            )}
            {embedding?.last_error && <p className={styles.embeddingError}>{embedding.last_error}</p>}
          </section>

          {/*
            정보 완성도. popcorn_movies_service 뷰가 세어 준다(마이그레이션 008).

            영화 정보를 KOFIC과 KMDB 두 곳에서 모아 합치는데 어느 쪽에도 없는
            값이 남는다. 무엇이 비었는지 보여야 운영자가 채우거나, 이 상태로
            인증해도 되는지 판단할 수 있다.

            **지금은 보여주기만 한다.** 인증을 막지 않는다 — 5,285편이 미완성
            이라 막으면 검수 자체가 멈춘다. 현황을 보고 기준을 조정한 뒤에
            조이는 것이 순서다.

            스냅샷·목으로 돌 때는 이 값이 없다. 그때는 "완성"이라고 잘못
            말하지 않고 아예 감춘다.
          */}
          {isCompletenessKnown(movie) && (
            <section className={`${ui.card} ${styles.panelCard}`}>
              <div className={styles.panelHead}>
                <h3 className={styles.sectionTitle}>정보 완성도</h3>
                <StateBadge tone={missing.length === 0 ? "positive" : "warning"}>
                  {missing.length === 0 ? "완성" : `${missing.length}개 부족`}
                </StateBadge>
              </div>
              {missing.length === 0 ? (
                <p className={ui.caption}>모든 항목이 채워져 있습니다.</p>
              ) : (
                <div className={ui.tagRow}>
                  {missing.map((label) => (
                    <span key={label} className={ui.tag}>
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {/*
            자동 분류 — 별칭이 만든 값이다(마이그레이션 007).

            아래 '카테고리'와 나란히 두되 섞지 않는다. 그쪽은 운영자가 손으로
            붙인 것이고 이쪽은 규칙이 만든 것이라, 한 자리에 합치면 무엇을
            사람이 정했는지 알 수 없다. 별칭을 고쳐 목록이 바뀌었을 때도
            어디를 봐야 하는지 분명해야 한다.

            분류된 것이 없으면 아예 감춘다 — 지금 키워드가 있는 영화가
            1,077편(20%)뿐이라 대부분 비어 있고, 빈 패널만 늘어놓으면
            화면이 무거워진다.
          */}
          {(movie.auto_categories?.length ?? 0) > 0 && (
            <section className={`${ui.card} ${styles.panelCard}`}>
              <div className={styles.panelHead}>
                <h3 className={styles.sectionTitle}>자동 분류</h3>
                <span className={ui.caption}>별칭 기준</span>
              </div>
              <div className={ui.tagRow}>
                {movie.auto_categories?.map((c) => (
                  <span key={c.code} className={ui.tag} title={`${c.type} · ${c.code}`}>
                    {c.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className={`${ui.card} ${styles.panelCard}`}>
            <div className={styles.panelHead}>
              <h3 className={styles.sectionTitle}>카테고리</h3>
            </div>
            <div className={ui.tagRow}>
              {movie.categories.length === 0 && (
                <span className={ui.caption}>분류된 카테고리가 없습니다.</span>
              )}
              {movie.categories.map((code) => (
                <span key={code} className={ui.tag}>
                  {movieCategories.find((c) => c.code === code)?.name ?? code}
                </span>
              ))}
            </div>
          </section>

          <section className={`${ui.card} ${styles.panelCard}`}>
            <h3 className={styles.sectionTitle}>검증 이력</h3>
            {movieLogs.length === 0 ? (
              <p className={ui.caption}>검증 이력이 없습니다.</p>
            ) : (
              <ol className={styles.timeline}>
                {movieLogs.map((log) => {
                  const [date, time] = log.time.split(" ");
                  return (
                    <li key={log.id} className={styles.timelineItem}>
                      <span className={`${styles.dot} ${ACTION_DOTS[log.action]}`} aria-hidden="true" />
                      <div>
                        <div className={styles.timelineHead}>
                          <span className={styles.timelineAction}>{ACTION_LABELS[log.action]}</span>
                          <span className={ui.caption}>{log.admin}</span>
                        </div>
                        <div className={styles.timelineTime}>
                          {date} <span className={styles.mono}>{time}</span>
                        </div>
                        {log.note && <div className={styles.timelineNote}>“{log.note}”</div>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className={`${ui.card} ${styles.panelCard}`}>
            <h3 className={styles.sectionTitle}>판정 액션</h3>

            {/*
              세 상태 모두에서 다음 판정이 보여야 한다.

              전에는 인증완료면 반려 버튼 하나만 남고 정보 수정까지 사라졌고,
              반려된 영화에는 버튼이 아예 없어 되돌릴 방법이 없었다.
              이제 각 상태에서 갈 수 있는 곳을 모두 둔다 —
                인증대기 → 인증 · 반려
                인증완료 → 반려          (이미 인증된 것을 또 인증하지는 않는다)
                반려     → 인증대기로 되돌리기
              정보 수정은 어느 상태에서든 할 수 있다.
            */}
            <div className={styles.actions}>
              {isPending && (
                <ActionButton
                  type="button"
                  variant="brandSolid"
                  size="medium"
                  onClick={handleApprove}
                  disabled={saving}
                >
                  <IconApprove size={15} />
                  인증
                </ActionButton>
              )}

              {isRejected && (
                <ActionButton
                  type="button"
                  variant="brandSolid"
                  size="medium"
                  onClick={handleRestore}
                  disabled={saving}
                >
                  <IconApprove size={15} />
                  인증대기로 되돌리기
                </ActionButton>
              )}

              {(isPending || isApproved) && (
                <ActionButton
                  type="button"
                  variant="neutralOutline"
                  size="medium"
                  disabled={saving}
                  onClick={() => {
                    setNote("");
                    setModal("reject");
                  }}
                >
                  <IconUncertify size={15} />
                  반려
                </ActionButton>
              )}

              <ActionButton
                type="button"
                variant="neutralWeak"
                size="medium"
                onClick={openEdit}
                disabled={saving}
              >
                <IconEdit size={13} />
                정보 수정
              </ActionButton>
            </div>

            {/* 왜 그 버튼들뿐인지 설명한다. 버튼이 빠진 것처럼 보이지 않게. */}
            <div className={styles.settled}>
              <StatusBadge status={movie.approval_status} />
              <p className={ui.caption}>
                {isPending
                  ? "검토 후 인증하거나 반려하세요."
                  : isApproved
                    ? "사용자 화면에 인증 마크가 표시됩니다."
                    : (movie.rejection_reason ?? "반려된 영화입니다.")}
              </p>
            </div>
          </section>
        </aside>
      </div>

      <Modal open={modal === "reject"} title="인증 반려" onClose={() => setModal(null)}
        footer={
          <>
        <ActionButton type="button" variant="neutralWeak" size="medium" onClick={() => setModal(null)}>
          취소
        </ActionButton>
        <ActionButton
          type="button"
          variant="criticalSolid"
          size="medium"
          disabled={note.trim() === "" || saving}
          onClick={submitReject}
        >
          {saving ? "저장 중…" : "반려"}
        </ActionButton>
          </>
        }
      >
        <p>
          “<strong>{movie.title_ko}</strong>”을(를) 반려합니다. 반려 사유는 필수입니다.
        </p>
        <CalloutRoot tone="neutral">
          <CalloutContent>
            {/*
              전에는 "반려하면 서비스 상태도 함께 중단됩니다"라고 적혀 있었는데
              사실이 아니었다. 판정 API는 approval_status·approved_by·
              rejection_reason만 건드리고 service_status는 그대로 둔다.

              그리고 그것이 맞는 동작이다. 이 서비스는 수집된 영화를 전부
              보여주고, 인증은 fe에 인증 마크를 붙이는 축이다 — WAS의
              /catalog/movies도 approval_status를 기본 필터로 쓰지 않는다.
              반려는 "내리는 것"이 아니라 "마크를 안 붙이는 것"이다.
            */}
            <CalloutDescription>
              반려해도 영화는 서비스에 계속 보입니다. 인증 마크만 붙지 않습니다.
              사유는 DB에 저장되며 비워둘 수 없습니다.
            </CalloutDescription>
          </CalloutContent>
        </CalloutRoot>
        <VisuallyHidden asChild>
          <label htmlFor="reject-note">반려 사유</label>
        </VisuallyHidden>
        <TextFieldRoot value={note} onValueChange={setNote}>
          <TextFieldTextarea placeholder="반려 사유를 입력하세요 (필수)" />
        </TextFieldRoot>
      </Modal>

      <Modal open={modal === "edit"} title="영화 정보 수정" onClose={() => setModal(null)} width="32rem"
        footer={
          <>
        <ActionButton type="button" variant="neutralWeak" size="medium" onClick={() => setModal(null)}>
          취소
        </ActionButton>
        <ActionButton type="button" variant="brandSolid" size="medium" onClick={submitEdit}>
          저장
        </ActionButton>
          </>
        }
      >
        <CalloutRoot tone="informative">
          <CalloutContent>
            <CalloutDescription>
              저장해도 검수 상태는 그대로 유지됩니다. 변경 사항은 검증 로그에 기록됩니다.
            </CalloutDescription>
          </CalloutContent>
        </CalloutRoot>

        <FieldRoot>
          <FieldHeader>
            <FieldLabel>팝콘점수</FieldLabel>
          </FieldHeader>
          <div className={styles.sliderRow}>
            <SliderRoot
              id="edit-score"
              min={0}
              max={100}
              step={0.5}
              values={[editForm.pop_talk_score]}
              onValuesChange={(next) =>
                setEditForm((f) => ({ ...f, pop_talk_score: next[0] ?? f.pop_talk_score }))
              }
            >
              <SliderControl>
                <SliderTrack>
                  <SliderRange />
                </SliderTrack>
                <SliderThumb thumbIndex={0}>
                  <SliderHiddenInput thumbIndex={0} aria-label="팝콘점수" />
                </SliderThumb>
              </SliderControl>
            </SliderRoot>
            <span className={ui.score}>{editForm.pop_talk_score}</span>
          </div>
        </FieldRoot>

        <FieldRoot>
          <FieldHeader>
            <FieldLabel>카테고리</FieldLabel>
          </FieldHeader>
          <div className={styles.checkList}>
            {movieCategories.length === 0 && (
              <span className={ui.caption}>등록된 카테고리가 없습니다.</span>
            )}
            {movieCategories.map((category) => (
              <CheckboxRoot
                key={category.id}
                checked={editForm.categories.includes(category.code)}
                onCheckedChange={(checked) =>
                  setEditForm((f) => ({
                    ...f,
                    categories: checked
                      ? [...f.categories, category.code]
                      : f.categories.filter((c) => c !== category.code),
                  }))
                }
              >
                <CheckboxControl>
                  <CheckboxIndicator checked={<IconApprove />} />
                </CheckboxControl>
                <CheckboxLabel>{category.name}</CheckboxLabel>
                <CheckboxHiddenInput />
              </CheckboxRoot>
            ))}
          </div>
          <p className={ui.caption}>
            운영자가 직접 붙이는 분류입니다. 별칭으로 자동 분류된 것과는 별개로 저장됩니다.
          </p>
        </FieldRoot>

        <FieldRoot>
          <FieldHeader>
            <FieldLabel>줄거리</FieldLabel>
          </FieldHeader>
          <TextFieldRoot
            value={editForm.plot}
            onValueChange={(v) => setEditForm((f) => ({ ...f, plot: v }))}
          >
            <TextFieldTextarea />
          </TextFieldRoot>
        </FieldRoot>

        <FieldRoot>
          <FieldHeader>
            <FieldLabel>수정 메모 (선택)</FieldLabel>
          </FieldHeader>
          <TextFieldRoot value={editNote} onValueChange={setEditNote}>
            <TextFieldInput placeholder="수정 이유를 간략히 입력하세요" />
          </TextFieldRoot>
        </FieldRoot>

      </Modal>
    </div>
  );
}
