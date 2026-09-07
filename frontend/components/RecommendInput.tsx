"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ChatResponse } from "@/lib/chat";
import { QUICK_FILTERS } from "@/lib/movies";
import { MarkdownViewer } from "@/components/MarkdownViewer";

const PLACEHOLDER =
  "아내와 가볍게 볼 수 있는 한국 영화를 찾고 있어요. 2시간 안쪽이고, 잔인한 장면은 없으면 좋겠어요.";

/** 추천 입력 검색어 임시 보관 sessionStorage 키 */
const RECOMMEND_QUERY_KEY = "poptalk:recommendQuery";
/** 라우트 변경(언마운트) 시 삭제 예약 타이머 — StrictMode 재마운트 방어용 */
let recommendClearTimer: ReturnType<typeof setTimeout> | null = null;

/** 추천받기 2 — 라우트 없이 브라우저에서 직접 호출할 채팅 API */
const CHAT_API_URL = `${
  process.env.NEXT_PUBLIC_CHAT_API_ORIGIN ??
  "http://popcorn-private-alb-144239326-fdd5172f3bd6.kr.lb.naverncp.com:8000"
}/api/chat`;

/** 응답 객체에서 answer 문자열을 안전하게 추출 */
function getAnswer(value: unknown): string {
  if (value && typeof value === "object" && "answer" in value) {
    const answer = (value as { answer?: unknown }).answer;
    return typeof answer === "string" ? answer : "";
  }
  return "";
}

/**
 * 자연어 추천 입력 — 원하는 분위기/취향/상황을 문장으로 받아
 * 채팅 API의 답변을 입력창 아래에 표시한다. (칩 클릭 시 프롬프트에 추가)
 */
type Chip = { label: string; value: string };

export function RecommendInput({
  categories = null,
}: {
  /** 로그인 시 /catalog/display-categories 칩 (label=short_label, value=name). 없으면 기본 칩 */
  categories?: Chip[] | null;
}) {
  // 로그인 + 카테고리 응답이 있으면 그걸로, 아니면 상황별 맞춤 프롬프트 사용
  const chips: Chip[] =
    categories && categories.length > 0
      ? categories
      : QUICK_FILTERS.map(({ label, prompt }) => ({ label, value: prompt }));

  const [value, setValue] = useState("");
  const persistReady = useRef(false);

  // sessionStorage 자동 바인딩(복원) + 라우트 변경(언마운트) 시 삭제
  useEffect(() => {
    // 재진입/StrictMode 재마운트: 예약된 삭제 취소
    if (recommendClearTimer) {
      clearTimeout(recommendClearTimer);
      recommendClearTimer = null;
    }
    // 저장된 검색어가 있으면 자동 바인딩 (마운트 1회 · SSR 하이드레이션 안전 패턴)
    const saved = window.sessionStorage.getItem(RECOMMEND_QUERY_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setValue(saved);
    return () => {
      // 라우트가 바뀌어 언마운트되면 삭제 (StrictMode 재마운트면 다음 마운트가 취소)
      recommendClearTimer = setTimeout(() => {
        window.sessionStorage.removeItem(RECOMMEND_QUERY_KEY);
        recommendClearTimer = null;
      }, 0);
    };
  }, []);

  // 입력 변경 시 저장 (첫 렌더는 건너뛰어 복원 이전 빈 값이 덮어쓰는 것 방지)
  useEffect(() => {
    if (!persistReady.current) {
      persistReady.current = true;
      return;
    }
    if (value) window.sessionStorage.setItem(RECOMMEND_QUERY_KEY, value);
    else window.sessionStorage.removeItem(RECOMMEND_QUERY_KEY);
  }, [value]);

  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 추천받기 2 — 원본 응답 그대로 표시
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [rawError, setRawError] = useState("");
  const [rawLoading, setRawLoading] = useState(false);

  async function submitRaw() {
    if (rawLoading) return;
    const q = value.trim() || PLACEHOLDER;

    setRawLoading(true);
    setRawError("");
    setRawResponse(null);

    try {
      // 라우트를 거치지 않고 채팅 API 에 직접 요청 (curl 과 동일한 바디)
      const result = await fetch(CHAT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: q,
          user_id: null,
          exclude_spoilers: true,
          include_trace: true,
        }),
      });

      const payload: unknown = await result.json().catch(() => null);

      // 성공/실패와 무관하게 받은 응답을 그대로 표시
      setRawResponse(
        payload ?? { ok: result.ok, status: result.status, note: "본문이 비어있거나 JSON이 아닙니다." },
      );
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : String(requestError);
      setRawError(
        `직접 호출 실패: ${message} — 브라우저에서 사설 ALB(http) 직접 호출은 CORS·혼합콘텐츠(HTTPS 배포 시)로 막힐 수 있어요.`,
      );
    } finally {
      setRawLoading(false);
    }
  }

  async function submit() {
    if (isLoading) return;

    const q = value.trim() || PLACEHOLDER;

    setIsLoading(true);
    setError("");
    setResponse(null);

    try {
      const result = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, user_id: null, "exclude_spoilers": true, "include_trace": true }),
      });

      const payload = (await result.json()) as ChatResponse | { error?: string };

      if (!result.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "추천 결과를 불러오지 못했습니다.",
        );
      }

      setResponse(payload as ChatResponse);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "추천 결과를 불러오지 못했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    void submit();
  }

  return (
    <div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:p-5 lg:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="relative">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={3}
            placeholder={PLACEHOLDER}
            aria-label="영화 추천 요청"
            className={`w-full resize-none bg-transparent text-[15px] leading-7 text-zinc-800 outline-none placeholder:text-zinc-400 md:text-base md:leading-8 dark:text-zinc-100 dark:placeholder:text-zinc-500 ${
              isLoading ? "opacity-0" : "opacity-100"
            }`}
          />

          {isLoading && (
            <div
              role="status"
              className="absolute inset-0 flex items-center justify-center gap-3 text-sm font-semibold text-amber-700 md:text-base dark:text-amber-400"
            >
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600 dark:border-amber-900 dark:border-t-amber-400" />
              <span>취향에 맞는 영화를 찾고 있어요…</span>
            </div>
          )}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          {/* <button
            type="button"
            onClick={submitRaw}
            disabled={rawLoading}
            className="rounded-lg border border-amber-600 px-5 py-2.5 text-sm font-bold text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 md:px-6 md:py-3 md:text-base dark:border-amber-500 dark:text-amber-400 dark:hover:bg-amber-950/30"
          >
            {rawLoading ? "요청 중…" : "추천받기 2"}
          </button> */}
          <button
            type="button"
            onClick={submit}
            disabled={isLoading}
            className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-400 md:px-6 md:py-3 md:text-base dark:disabled:bg-amber-800"
          >
            {isLoading ? "영화를 찾고 있어요…" : "추천받기"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {chips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => setValue(chip.value)}
            title={chip.value}
            className="rounded-full border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-amber-300 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="mt-5" aria-live="polite" aria-busy={isLoading}>
        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-700 md:p-6 md:text-base dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {response && (
          <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-left shadow-sm md:p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-600 md:text-sm dark:text-amber-400">
              POP TALK의 추천
            </p>
            {/* 뷰어 보여지는곳 */}
            <MarkdownViewer content={response.answer} />
          </section>
        )}
      </div>

      {/* 추천받기 2 — 원본 응답 */}
      <div className="mt-5" aria-live="polite" aria-busy={rawLoading}>
        {rawError && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-700 md:p-6 md:text-base dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
          >
            {rawError}
          </div>
        )}

        {rawResponse != null && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 text-left shadow-sm md:p-6 dark:border-amber-500/20 dark:bg-amber-950/10">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-600 md:text-sm dark:text-amber-400">
              추천받기 2 · 원본 응답
            </p>
            {getAnswer(rawResponse) && (
              <div className="mb-4 whitespace-pre-wrap text-[15px] leading-7 text-zinc-700 md:text-base md:leading-8 dark:text-zinc-200">
                {getAnswer(rawResponse)}
              </div>
            )}
            <pre className="max-h-96 overflow-auto rounded-xl bg-zinc-900 p-4 text-xs leading-5 text-zinc-100 dark:bg-black">
              {JSON.stringify(rawResponse, null, 2)}
            </pre>
          </section>
        )}
      </div>
    </div>
  );
}
