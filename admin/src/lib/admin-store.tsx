"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  CURRENT_ADMIN,
  MOCK_BATCH_RUNS,
  MOCK_CATEGORIES,
  MOCK_MEMBERS,
  MOCK_LOGS,
  MOCK_MOVIES,
  type BatchRun,
  type Category,
  type Member,
  type Movie,
  type MovieEmbedding,
  type MovieApprovalStatus,
  type VerificationLog,
} from "@/lib/mock";
import { patchApproval, type ApprovalAction } from "@/lib/api";
import type { MovieSource } from "@/lib/movies-source.types";
import type { MovieCounts } from "@/lib/api";

type AdminStore = {
  movies: Movie[];
  source: MovieSource;
  capturedAt?: string;
  embeddings: MovieEmbedding[];
  /* 배치 실행 이력. layout이 서버에서 읽어 넘긴다. */
  batchRuns: BatchRun[];
  /* 회원. 대시보드 카드가 쓴다 — 회원 화면은 자기가 따로 받아온다. */
  members: Member[];
  /* 감상평 총 건수. 회원별 작성 수를 더하면 감상평 화면과 어긋난다. */
  reviewTotal: number;
  /*
   * 영화 수치. movies는 300편만 담고 있어 그것으로 세면 안 된다 —
   * 검수 화면은 서버에서 5,312를 받아오므로 두 화면이 어긋난다.
   * DB가 없으면 null이고, 그때는 화면이 movies로 대신 센다.
   */
  movieCounts: MovieCounts | null;
  logs: VerificationLog[];
  categories: Category[];
  pendingCount: number;
  setCategories: (categories: Category[]) => void;
  /*
   * 판정 셋은 원장에 쓰므로 결과를 기다려야 한다. 화면은 실패를 사용자에게
   * 알려야 하고, 그러려면 무엇이 잘못됐는지 받아야 한다.
   */
  approveMovie: (id: number) => Promise<TransitionResult>;
  /** DB 제약상 반려에는 사유가 반드시 있어야 한다. */
  rejectMovie: (id: number, reason: string) => Promise<TransitionResult>;
  restoreMovie: (id: number) => Promise<TransitionResult>;
  editMovie: (id: number, changes: Partial<Movie>, note: string) => void;
};

/** 판정 결과. 실패하면 화면이 사용자에게 보여줄 문구를 담는다. */
export type TransitionResult = { ok: true } | { ok: false; message: string };

const AdminStoreContext = createContext<AdminStore | null>(null);

const pad = (n: number) => String(n).padStart(2, "0");

function formatLogTime(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function AdminStoreProvider({
  children,
  initialMovies,
  initialEmbeddings = [],
  initialBatchRuns,
  initialMembers,
  initialReviewTotal,
  initialMovieCounts,
  initialCategories,
  source = "mock",
  capturedAt,
}: {
  children: React.ReactNode;
  /** 서버(layout)에서 실 DB 또는 스냅샷으로 채워 넘긴다. 없으면 목 데이터로 돈다. */
  initialMovies?: Movie[];
  initialEmbeddings?: MovieEmbedding[];
  initialBatchRuns?: BatchRun[];
  initialMembers?: Member[];
  initialReviewTotal?: number;
  initialMovieCounts?: MovieCounts;
  /** 화면 문구. layout이 서버에서 읽어 넘긴다. */
  initialCategories?: Category[];
  /** 이 데이터가 어디서 왔는지. GNB에 표시한다. */
  source?: MovieSource;
  capturedAt?: string;
}) {
  const [movies, setMovies] = useState<Movie[]>(initialMovies ?? MOCK_MOVIES);

  /*
   * 서버가 새 데이터를 보내면 화면 상태를 갈아끼운다.
   *
   * GNB의 새로고침이 router.refresh()를 부르면 layout이 서버에서 다시
   * 읽어 새 props로 내려온다. 그런데 useState는 **초기값을 한 번만** 쓴다 —
   * Next 문서도 refresh가 "useState를 잃지 않고 병합한다"고 못 박는다.
   * 그냥 두면 서버는 새로 읽어 왔는데 화면은 옛 데이터를 계속 보여준다.
   *
   * 렌더 중에 맞추는 것이 React가 권하는 방법이다. useEffect로 하면 옛
   * 데이터로 한 번 그린 뒤 다시 그려 화면이 깜빡인다.
   *
   * 판정으로 바꾼 내용이 날아갈 걱정은 없다. 판정은 원장에 저장되므로
   * 서버가 새로 읽어온 값이 곧 방금 저장한 값이다.
   */
  const [seenMovies, setSeenMovies] = useState(initialMovies);
  if (initialMovies !== seenMovies) {
    setSeenMovies(initialMovies);
    setMovies(initialMovies ?? MOCK_MOVIES);
  }

  /*
   * 이 둘은 화면에서 바꾸지 않는다. 상태로 담아둘 이유가 없고, props를
   * 그대로 쓰면 새로고침에도 저절로 최신이 된다.
   */
  const embeddings = initialEmbeddings;
  const batchRuns = initialBatchRuns ?? MOCK_BATCH_RUNS;
  const members = initialMembers ?? MOCK_MEMBERS;
  // 목으로 돌 때는 회원별 작성 수를 더한다. 그때는 그것이 유일한 근거다.
  const reviewTotal =
    initialReviewTotal ?? MOCK_MEMBERS.reduce((sum, m) => sum + m.review_count, 0);
  const movieCounts = initialMovieCounts ?? null;

  const [logs, setLogs] = useState<VerificationLog[]>(MOCK_LOGS);
  const [categories, setCategories] = useState<Category[]>(initialCategories ?? MOCK_CATEGORIES);

  /*
   * 서버가 새 문구를 보내면 갈아끼운다. movies와 같은 이유다 — useState는
   * 초기값을 한 번만 쓰므로 새로고침해도 옛 목록이 남는다.
   */
  const [seenCategories, setSeenCategories] = useState(initialCategories);
  if (initialCategories !== seenCategories) {
    setSeenCategories(initialCategories);
    setCategories(initialCategories ?? MOCK_CATEGORIES);
  }

  const addLog = useCallback(
    (
      movieTitle: string,
      action: VerificationLog["action"],
      before: MovieApprovalStatus,
      after: MovieApprovalStatus,
      note: string,
    ) => {
      setLogs((prev) => [
        {
          id: prev.length + 1,
          time: formatLogTime(new Date()),
          admin: CURRENT_ADMIN.name,
          movie: movieTitle,
          action,
          before,
          after,
          note,
        },
        ...prev,
      ]);
    },
    [],
  );

  /*
   * 판정 세 가지는 모두 같은 모양이다: 원장에 쓰고, 성공하면 화면을 맞추고,
   * 로그를 남긴다.
   *
   * **먼저 저장하고 나중에 화면을 바꾼다.** 반대로 하면(낙관적 갱신) 저장이
   * 실패했을 때 화면에는 이미 "인증완료"가 떠 있다. 되돌릴 수는 있지만 그
   * 사이에 사용자가 본 것은 거짓이다. 판정은 자주 일어나는 일이 아니고 DB는
   * 같은 망 안에 있어, 기다리는 편이 낫다.
   *
   * 화면 상태를 응답으로 받은 행으로 **통째로 교체한다.** 여기서 추측해
   * 만든 값(승인 시각 같은 것)을 넣으면 DB에 실제로 저장된 값과 어긋난다.
   *
   * addLog는 setMovies 업데이터 밖에서 호출한다 — 업데이터 안에서 다른
   * state를 건드리면 StrictMode의 이중 호출에 로그가 두 번 쌓인다.
   */
  const transition = useCallback(
    async (
      id: number,
      action: VerificationLog["action"],
      apiAction: ApprovalAction,
      next: MovieApprovalStatus,
      note: string,
    ): Promise<TransitionResult> => {
      const movie = movies.find((m) => m.id === id);
      if (!movie) return { ok: false, message: "영화를 찾을 수 없습니다" };

      const res = await patchApproval(id, apiAction, {
        reason: note || undefined,
        admin: CURRENT_ADMIN.name,
      });
      if (!res.ok) return res;

      setMovies((prev) =>
        prev.map((m) => (m.id === id ? ((res.movie as Movie | null) ?? m) : m)),
      );
      addLog(movie.title_ko, action, movie.approval_status, next, note);
      return { ok: true };
    },
    [movies, addLog],
  );

  // 노출(service_status)은 별개 축이다. 판정이 노출 설정을 덮어쓰지 않는다.
  const approveMovie = useCallback(
    (id: number) => transition(id, "APPROVE", "APPROVE", "APPROVED", ""),
    [transition],
  );

  const rejectMovie = useCallback(
    (id: number, reason: string) => transition(id, "REJECT", "REJECT", "REJECTED", reason),
    [transition],
  );

  const restoreMovie = useCallback(
    (id: number) => transition(id, "RESTORE", "RESTORE", "PENDING", ""),
    [transition],
  );

  const editMovie = useCallback(
    (id: number, changes: Partial<Movie>, note: string) => {
      const movie = movies.find((m) => m.id === id);
      if (!movie) return;
      setMovies((prev) => prev.map((m) => (m.id === id ? { ...m, ...changes } : m)));
      addLog(movie.title_ko, "EDIT", movie.approval_status, movie.approval_status, note);
    },
    [movies, addLog],
  );


  const value = useMemo<AdminStore>(
    () => ({
      movies,
      embeddings,
      batchRuns,
      members,
      reviewTotal,
      movieCounts,
      source,
      capturedAt,
      logs,
      categories,
      // 서버가 센 값을 먼저 쓴다. movies는 300편뿐이라 실제 대기 수와 다를 수 있다.
      pendingCount:
        movieCounts?.pending ?? movies.filter((m) => m.approval_status === "PENDING").length,
      setCategories,
      approveMovie,
      restoreMovie,
      editMovie,
      rejectMovie,
    }),
    [movies, embeddings, batchRuns, members, reviewTotal, movieCounts, source, capturedAt, logs, categories, approveMovie, rejectMovie, restoreMovie, editMovie],
  );

  return <AdminStoreContext.Provider value={value}>{children}</AdminStoreContext.Provider>;
}

export function useAdminStore() {
  const store = useContext(AdminStoreContext);
  if (!store) throw new Error("useAdminStore must be used within AdminStoreProvider");
  return store;
}
