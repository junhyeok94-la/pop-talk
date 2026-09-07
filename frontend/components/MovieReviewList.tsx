"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PopcornIcon } from "@/components/PopcornIcon";
import { movieReviewsKey } from "@/lib/reviews/query";

const PAGE_SIZE = 5;

type MovieReview = {
  id: string;
  rating: number;
  content: string;
  contains_spoiler: boolean;
  source_system: string | null;
  created_at: string;
};

type ReviewPage = {
  page: number;
  size: number;
  total: number;
  items: MovieReview[];
};

function isReviewPage(value: unknown): value is ReviewPage {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return typeof data.page === "number" && typeof data.total === "number" && Array.isArray(data.items);
}

export function MovieReviewList({ movieId }: { movieId: number }) {
  const [page, setPage] = useState(1);
  const { data, error, isPending, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: [...movieReviewsKey(movieId), page],
    queryFn: async (): Promise<ReviewPage> => {
      const response = await fetch(`/api/movies/${movieId}/reviews?page=${page}`, { cache: "no-store" });
      const result: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = result && typeof result === "object" && "error" in result
          ? String((result as { error: unknown }).error)
          : "리뷰 목록을 불러오지 못했습니다.";
        throw new Error(message);
      }
      if (!isReviewPage(result)) throw new Error("리뷰 응답 형식이 올바르지 않습니다.");
      return result;
    },
    placeholderData: keepPreviousData,
  });

  function moveToPage(nextPage: number) {
    setPage(nextPage);
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <section aria-busy={isFetching} className="mt-6 rounded-2xl border border-zinc-200 p-5 md:mt-8 md:p-6 dark:border-zinc-800">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50">관람객 리뷰</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">총 {data?.total ?? 0}개</p>
      </div>

      {isPending ? <ReviewListSkeleton /> : null}
      {!isPending && error ? (
        <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
          <p role="alert">{error instanceof Error ? error.message : "리뷰 목록을 불러오지 못했습니다."}</p>
          <button type="button" onClick={() => void refetch()} className="mt-2 font-bold underline">다시 시도</button>
        </div>
      ) : null}
      {!isPending && !error && data?.items.length === 0 ? (
        <p className="mt-4 rounded-xl bg-zinc-50 p-6 text-center text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">아직 등록된 리뷰가 없습니다. 첫 리뷰를 남겨보세요.</p>
      ) : null}
      {!isPending && !error && data?.items.length ? (
        <div className={`relative mt-4 divide-y divide-zinc-100 transition-opacity dark:divide-zinc-800 ${isPlaceholderData ? "opacity-50" : "opacity-100"}`}>
          {isPlaceholderData ? <div role="status" aria-label="다음 리뷰 페이지를 불러오는 중" className="absolute inset-x-0 top-0 z-10 h-1 animate-pulse rounded-full bg-amber-500" /> : null}
          {data.items.map((review) => <ReviewItem key={review.id} review={review} />)}
        </div>
      ) : null}

      {!error && totalPages > 1 ? (
        <nav className="mt-6 flex items-center justify-center gap-2" aria-label="리뷰 페이지">
          <PageButton disabled={isFetching || page <= 1} onClick={() => moveToPage(page - 1)}>이전</PageButton>
          <span className="min-w-16 text-center text-sm font-semibold text-zinc-600 dark:text-zinc-300">{page} / {totalPages}</span>
          <PageButton disabled={isFetching || page >= totalPages} onClick={() => moveToPage(page + 1)}>다음</PageButton>
        </nav>
      ) : null}
    </section>
  );
}

function ReviewItem({ review }: { review: MovieReview }) {
  const [showSpoiler, setShowSpoiler] = useState(false);
  const date = new Date(review.created_at);
  return (
    <article className="py-5 first:pt-1 last:pb-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5" aria-label={`5점 만점에 ${review.rating}점`}>
            {[1, 2, 3, 4, 5].map((value) => <PopcornIcon key={value} fill={review.rating >= value ? "full" : review.rating >= value - 0.5 ? "half" : "empty"} className="h-5 w-5" />)}
          </div>
          <strong className="text-sm text-amber-600">{review.rating.toFixed(1)}</strong>
          {review.source_system === "naver_movie" ? <NaverSourceBadge /> : null}
        </div>
        <time dateTime={review.created_at} className="text-xs text-zinc-400">{Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ko-KR")}</time>
      </div>
      {review.contains_spoiler && !showSpoiler ? (
        <button type="button" onClick={() => setShowSpoiler(true)} className="mt-3 w-full rounded-xl bg-zinc-100 px-4 py-4 text-sm font-bold text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">스포일러가 포함된 리뷰입니다. 눌러서 보기</button>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-7 text-zinc-700 dark:text-zinc-300">{review.content}</p>
      )}
    </article>
  );
}

function NaverSourceBadge() {
  return (
    <span
      title="네이버 영화 리뷰"
      aria-label="네이버 영화 출처"
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#03C75A] text-[13px] font-black leading-none text-white"
    >
      N
    </span>
  );
}

function PageButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: string }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900">{children}</button>;
}

function ReviewListSkeleton() {
  return (
    <div role="status" aria-label="리뷰를 불러오는 중" className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
      {Array.from({ length: PAGE_SIZE }, (_, index) => (
        <div key={index} className="animate-pulse py-5 first:pt-1 last:pb-1">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="h-5 w-28 rounded-md bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-4 w-8 rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
            <div className="h-3 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="mt-4 h-4 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="mt-2 h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      ))}
      <span className="sr-only">리뷰를 불러오는 중입니다.</span>
    </div>
  );
}
