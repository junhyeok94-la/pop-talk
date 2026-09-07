import type {
  Category,
  Member,
  MemberSurvey,
  Movie,
  MovieCategory,
  MovieEmbedding,
  Review,
} from "./mock";

/**
 * admin이 백엔드(apps/api)를 부르는 자리.
 *
 * 브라우저에서 부르는 것만 여기 둔다. 서버에서 읽는 것(영화·배치)은
 * lib/movies-source.ts·lib/batch-runs.ts에 있다 — layout이 화면을 그리기 전에
 * 읽어 스토어에 넣어주므로 브라우저가 따로 물을 필요가 없다.
 *
 * 카테고리·회원은 아직 lib/mock.ts에서 온다.
 *
 * 브라우저는 api를 직접 부르지 않는다. admin의 /api로 부르면 admin 서버가
 * 뒤에서 api에 넘긴다 (next.config.ts의 rewrites).
 *
 *   브라우저 → /api/health → (admin 서버) → Private ALB:3200/health
 *
 * 그래서 주소가 상대경로다. 화면을 어느 주소로 열든 — localhost든 LAN이든
 * 공인 LB든 — 자기 자신을 부르므로 어긋날 일이 없고, 다른 주소를 부르지
 * 않으니 CORS도 생기지 않는다.
 *
 * 목적지를 바꾸려면 admin 서버의 API_PROXY_TARGET을 쓴다. 그 값은 서버에서만
 * 읽히고 브라우저에 나가지 않는다.
 */
const API_BASE = "/api";

/** apps/api의 GET /health 응답. 구현을 그대로 따른다. */
export type Health = {
  status: "ok" | "degraded";
  database: "connected" | "unreachable";
  timestamp: string;
};

/**
 * 응답을 기다리는 한계. 넘으면 끊고 실패로 본다.
 *
 * 헬스체크가 5초 넘게 걸리는 서버는 이미 정상이 아니다.
 */
const TIMEOUT_MS = 5_000;

/**
 * 헬스체크. 서버가 응답하지 않으면 null을 준다.
 *
 * 던지지 않는 이유 — 부르는 쪽이 GNB의 점 하나다. 서버가 죽은 것도
 * 보여줘야 할 상태이지 예외가 아니다. 화면이 try/catch로 뒤덮이지 않게 한다.
 *
 * DB가 끊겨도 api는 200에 status: "degraded"를 담아 보낸다. 상태 코드만 보면
 * 정상으로 오해하므로 본문을 읽는다.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<Health | null> {
  /*
   * 제한 시간이 꼭 필요하다.
   *
   * 연결은 받아들이면서 아무것도 돌려주지 않는 서버가 있다 — DB 잠금,
   * 스레드 고갈, 네트워크 중간 끊김이 모두 이렇게 보인다. 제한이 없으면
   * fetch가 영원히 매달리고, 부르는 쪽은 응답을 받은 뒤에야 다음 점검을
   * 예약하므로 폴링이 통째로 멈춘다. 서버가 살아나도 영영 모른다.
   *
   * "죽었다"보다 나쁘다. 죽으면 즉시 실패로 잡히지만 이건 아무 말도 없다.
   *
   * 바깥 signal(화면을 떠남)과 시간 초과 둘 다 같은 컨트롤러로 끊는다.
   */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const abortFromOuter = () => controller.abort();
  signal?.addEventListener("abort", abortFromOuter);

  try {
    const res = await fetch(`${API_BASE}/health`, {
      signal: controller.signal,
      // 헬스체크는 매번 새로 물어야 한다. 캐시된 "정상"은 의미가 없다.
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Health;
  } catch {
    // 서버가 없거나 · 응답이 없거나 · 네트워크가 끊겼거나 · CORS에 막혔거나
    // · 화면을 떠났다. 어느 쪽이든 화면에서는 "확인할 수 없음"으로 같다.
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromOuter);
  }
}

/**
 * 영화 인증 판정을 원장에 쓴다.
 *
 * 지금까지 판정은 화면 상태만 바꿨다 — 새로고침하면 되돌아가고 사용자
 * 화면에 인증 마크가 붙지 않았다. 이 함수가 실제로 저장한다.
 *
 * fetchHealth와 달리 실패를 감추지 않고 이유를 돌려준다.
 * 조회는 못 읽으면 목으로 대신할 수 있지만, "저장했다"고 알린 뒤 아무 일도
 * 없는 것은 대신할 방법이 없다. 화면이 사용자에게 알려야 한다.
 */
export type ApprovalAction = "APPROVE" | "REJECT" | "RESTORE";

export type ApprovalResult =
  | { ok: true; movie: Movie | null }
  | { ok: false; message: string };

export async function patchApproval(
  id: number,
  action: ApprovalAction,
  options: { reason?: string; admin?: string } = {},
): Promise<ApprovalResult> {
  try {
    const res = await fetch(`/admin-api/movies/${id}/approval`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...options }),
    });

    if (!res.ok) {
      // 라우트가 { title, detail }로 내려준다. 없으면 상태 코드라도 보여준다.
      const problem = (await res.json().catch(() => null)) as {
        title?: string;
        detail?: string;
      } | null;
      return {
        ok: false,
        message: problem?.title ?? `저장하지 못했습니다 (${res.status})`,
      };
    }

    const data = (await res.json()) as { movie: Movie | null };
    return { ok: true, movie: data.movie };
  } catch {
    // 네트워크가 끊겼거나 서버가 없다. 어느 쪽이든 저장되지 않았다.
    return { ok: false, message: "서버에 닿지 못했습니다" };
  }
}

/** 감상평 목록. 거르기·쪽 나누기를 서버가 한다 — 실 DB에 2만 건이 있다. */
export type ReviewQuery = {
  page?: number;
  size?: number;
  q?: string;
  status?: string;
  from?: string;
  to?: string;
};

export type ReviewPage = {
  items: Review[];
  total: number;
  page: number;
  size: number;
  /** 요약 카드용. 지금 걸린 조건과 무관한 전체 수치다. */
  counts: { all: number; hidden: number };
  source: "db" | "mock";
};

export async function fetchReviews(
  params: ReviewQuery,
  signal?: AbortSignal,
): Promise<ReviewPage | null> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    // 빈 값은 조건이 아니다. 보내면 서버가 "빈 문자열로 거르기"로 읽는다.
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  try {
    const res = await fetch(`/admin-api/reviews?${sp}`, { signal, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ReviewPage;
  } catch {
    // 화면을 떠났거나 서버에 닿지 못했다. 부르는 쪽이 이전 목록을 유지한다.
    return null;
  }
}

/**
 * 감상평 노출 상태를 원장에 쓴다.
 *
 * 숨김과 되돌리기만이다. 삭제는 아직 저장할 경로가 없다 — 라우트 주석에
 * 이유를 적어뒀다.
 *
 * patchApproval과 같이 실패를 감추지 않는다. "숨겼다"고 알린 뒤 아무 일도
 * 없는 것은 대신할 방법이 없다.
 */
export async function patchReviewStatus(
  id: string,
  status: "NORMAL" | "HIDDEN",
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/admin-api/reviews/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const problem = (await res.json().catch(() => null)) as { title?: string } | null;
      return { ok: false, message: problem?.title ?? `저장하지 못했습니다 (${res.status})` };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "서버에 닿지 못했습니다" };
  }
}

/**
 * 카테고리(movie_categories). 온보딩 설문 선택지와 화면 문구의 분류가 되는
 * 우리 표준 어휘다.
 *
 * 낱말(match_keywords)을 붙이면 영화가 자동으로 이 카테고리에 붙는다 — 수집처가 준
 * 낱말과 우리 코드를 잇는 것이 별칭이다.
 */
export type CategoryPayload = {
  code?: string;
  name?: string;
  type?: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
  /** 자동 분류용 낱말. aliases(WAS의 의미 검색어)와 다른 칸이다. */
  match_keywords?: string[];
  admin?: string;
};

export type CategoryResult =
  | { ok: true; category: MovieCategory }
  | { ok: false; message: string };

/** 실패하면 이유를 문장으로 만든다. title만으로 부족한 것들이 있다. */
async function problemMessage(res: Response): Promise<string> {
  const problem = (await res.json().catch(() => null)) as {
    title?: string;
    detail?: string;
  } | null;
  if (!problem?.title) return `저장하지 못했습니다 (${res.status})`;
  // 코드 중복·별칭 겹침은 무엇과 부딪혔는지가 detail에 있다. 그게 핵심이다.
  return problem.detail ? `${problem.title} — ${problem.detail}` : problem.title;
}

export async function fetchCategories(
  signal?: AbortSignal,
): Promise<MovieCategory[] | null> {
  try {
    const res = await fetch("/admin-api/movie-categories", { signal, cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { items: MovieCategory[] }).items;
  } catch {
    return null;
  }
}

export async function createCategory(body: CategoryPayload): Promise<CategoryResult> {
  try {
    const res = await fetch("/admin-api/movie-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, message: await problemMessage(res) };
    return { ok: true, category: ((await res.json()) as { category: MovieCategory }).category };
  } catch {
    return { ok: false, message: "서버에 닿지 못했습니다" };
  }
}

export async function patchCategory(
  id: number,
  body: CategoryPayload,
): Promise<CategoryResult> {
  try {
    const res = await fetch(`/admin-api/movie-categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, message: await problemMessage(res) };
    return { ok: true, category: ((await res.json()) as { category: MovieCategory }).category };
  } catch {
    return { ok: false, message: "서버에 닿지 못했습니다" };
  }
}

export async function deleteCategory(
  id: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/admin-api/movie-categories/${id}`, { method: "DELETE" });
    if (!res.ok) return { ok: false, message: await problemMessage(res) };
    return { ok: true };
  } catch {
    return { ok: false, message: "서버에 닿지 못했습니다" };
  }
}

/**
 * 회원(dev.users). 읽기만 한다 — 화면에 상태를 바꾸는 동작이 없다.
 *
 * 거르기·쪽 나누기는 화면에서 한다. 감상평(2만 건)과 달리 회원은 관리자가
 * 훑을 수 있는 규모다.
 */
export async function fetchMembers(signal?: AbortSignal): Promise<Member[] | null> {
  try {
    const res = await fetch("/admin-api/members", { signal, cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { items: Member[] }).items;
  } catch {
    return null;
  }
}

export type MemberDetail = {
  member: Member;
  reviews: Review[];
  survey: MemberSurvey | null;
};

/** 회원 정보·감상평·설문을 한 번에. 화면이 셋을 함께 보여준다. */
export async function fetchMemberDetail(
  id: string,
  signal?: AbortSignal,
): Promise<MemberDetail | null> {
  try {
    const res = await fetch(`/admin-api/members/${id}`, { signal, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as MemberDetail;
  } catch {
    return null;
  }
}

/**
 * 회원 이용 상태를 원장에 쓴다.
 *
 * 정지시키면 실제로 서비스를 못 쓰게 된다 — WAS가 로그인과 토큰 갱신에서
 * 이 값을 보고 403으로 막는다. 화면 표시가 아니다.
 *
 * 탈퇴는 받지 않는다. 회원 본인이 하는 처리다.
 */
export async function patchMemberStatus(
  id: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/admin-api/members/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return { ok: false, message: await problemMessage(res) };
    return { ok: true };
  } catch {
    return { ok: false, message: "서버에 닿지 못했습니다" };
  }
}

/**
 * 영화 목록. 거르기·쪽 나누기를 서버가 한다.
 *
 * 전에는 layout이 300편만 읽어 스토어에 넣고 화면이 거기서 걸렀다 —
 * 5,312편 중 300편만 보였다는 뜻이다. 전부 보내면 11MB(그중 media가 7MB)라
 * 감상평과 같은 방식으로 바꿨다.
 */
export type MovieQueryParams = {
  page?: number;
  size?: number;
  status?: string;
  genre?: string;
  q?: string;
  exposure?: string;
  complete?: string;
  syncedFrom?: string;
  syncedTo?: string;
  approvedFrom?: string;
  approvedTo?: string;
};

export type MovieCounts = {
  all: number;
  pending: number;
  approved: number;
  rejected: number;
  published: number;
  lastSyncedAt: string | null;
};

export type MoviePage = {
  items: Movie[];
  total: number;
  page: number;
  size: number;
  /** 지금 걸린 조건과 무관한 전체 수치. 요약 카드가 쓴다. */
  counts: MovieCounts;
  /** 장르 필터 선택지. 20종뿐이라 목록과 함께 온다. */
  genres: string[];
};

export async function fetchMovies(
  params: MovieQueryParams,
  signal?: AbortSignal,
): Promise<MoviePage | null> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  try {
    const res = await fetch(`/admin-api/movies?${sp}`, { signal, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as MoviePage;
  } catch {
    return null;
  }
}

/** 영화 상세. 목록에 없는 영화도 주소로 열 수 있어야 한다. */
export async function fetchMovie(
  id: number,
  signal?: AbortSignal,
): Promise<{ movie: Movie; embeddings: MovieEmbedding[] } | null> {
  try {
    const res = await fetch(`/admin-api/movies/${id}`, { signal, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as { movie: Movie; embeddings: MovieEmbedding[] };
  } catch {
    return null;
  }
}

/**
 * 화면 문구(display_categories). 서비스 홈의 알약이다.
 *
 * 두 글자가 다른 일을 한다 —
 *   short_label   알약 버튼에 **보이는** 짧은 이름 (4~7자)
 *   name          누르면 입력창에 **채워져 챗봇에게 보내지는** 문장
 *
 * 담기는 영화는 카테고리가 정한다 — 문구에 영화를 직접 붙이지 않는다.
 */
export type DisplayCategoryPayload = {
  name?: string;
  /** 빈 문자열을 보내면 알약에서 내린다(서버가 null로 저장한다). */
  short_label?: string;
  /**
   * 이 문구가 묶는 카테고리 코드들. 통째로 갈아끼운다.
   *
   * FK가 아니라 배열이라 DB가 존재를 보장하지 않는다 — 서버가 저장 전에
   * 검사하고, 없는 코드가 있으면 422로 돌려준다.
   */
  category_codes?: string[];
  description?: string;
  sort_order?: number;
  is_active?: boolean;
  admin?: string;
};

export type DisplayCategoryResult =
  | { ok: true; category: Category }
  | { ok: false; message: string };

export async function fetchDisplayCategories(
  signal?: AbortSignal,
): Promise<Category[] | null> {
  try {
    const res = await fetch("/admin-api/display-categories", { signal, cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { items: Category[] }).items;
  } catch {
    return null;
  }
}

export async function createDisplayCategory(
  body: DisplayCategoryPayload,
): Promise<DisplayCategoryResult> {
  try {
    const res = await fetch("/admin-api/display-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, message: await problemMessage(res) };
    return { ok: true, category: ((await res.json()) as { category: Category }).category };
  } catch {
    return { ok: false, message: "서버에 닿지 못했습니다" };
  }
}

export async function patchDisplayCategory(
  id: number,
  body: DisplayCategoryPayload,
): Promise<DisplayCategoryResult> {
  try {
    const res = await fetch(`/admin-api/display-categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, message: await problemMessage(res) };
    return { ok: true, category: ((await res.json()) as { category: Category }).category };
  } catch {
    return { ok: false, message: "서버에 닿지 못했습니다" };
  }
}

export async function deleteDisplayCategory(
  id: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/admin-api/display-categories/${id}`, { method: "DELETE" });
    if (!res.ok) return { ok: false, message: await problemMessage(res) };
    return { ok: true };
  } catch {
    return { ok: false, message: "서버에 닿지 못했습니다" };
  }
}

/**
 * 영화에 붙은 카테고리를 통째로 교체한다.
 *
 * 영화 상세의 '정보 수정'이 쓴다. 전에는 저장하는 곳이 없어 화면 상태로만
 * 돌았고, 새로고침하면 사라졌다.
 *
 * 서버가 없는 코드를 조용히 버릴 수 있어 실제로 저장된 목록을 돌려준다 —
 * 화면은 보낸 것이 아니라 이것으로 갱신해야 어긋나지 않는다.
 */
export async function putMovieCategories(
  id: number,
  codes: string[],
): Promise<{ ok: true; categories: string[] } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/admin-api/movies/${id}/categories`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ codes }),
    });
    const data = (await res.json()) as {
      categories?: string[];
      title?: string;
      detail?: string;
    };
    if (!res.ok) {
      return { ok: false, message: data.detail ? `${data.title} — ${data.detail}` : (data.title ?? "저장에 실패했습니다") };
    }
    return { ok: true, categories: data.categories ?? [] };
  } catch {
    return { ok: false, message: "서버에 연결할 수 없습니다" };
  }
}
