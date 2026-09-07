"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PopcornIcon } from "@/components/PopcornIcon";

type Review = {
  id?: number | string;
  movie_id?: number | string;
  movie_title?: string;
  movie_poster?: string | null;
  rating?: number | string;
  content?: string;
  contains_spoiler?: boolean;
  created_at?: string;
};

function toReviews(value: unknown): Review[] {
  if (Array.isArray(value)) return value as Review[];
  if (value && typeof value === "object") {
    const data = value as Record<string, unknown>;
    for (const key of ["items", "reviews", "data"]) {
      if (Array.isArray(data[key])) return data[key] as Review[];
    }
  }
  return [];
}

export function MyReviews() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/me/reviews", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) {
          setError(
            typeof result.error === "string"
              ? result.error
              : "리뷰를 불러오지 못했습니다.",
          );
        } else {
          setReviews(toReviews(result));
        }
      })
      .catch(() => {
        if (active) setError("리뷰를 불러오지 못했습니다.");
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <p
        role="alert"
        className="rounded-2xl bg-red-50 p-5 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300"
      >
        {error}
      </p>
    );
  }
  if (!reviews) {
    return (
      <p className="animate-pulse rounded-2xl bg-zinc-100 p-5 text-sm text-zinc-500 dark:bg-zinc-900">
        내 리뷰를 불러오는 중...
      </p>
    );
  }
  if (reviews.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
        아직 남긴 평점이 없습니다.
      </p>
    );
  }

  return (
    <ul className="grid gap-4">
      {reviews.map((review, index) => (
        <li key={review.id ?? `${review.movie_id}-${index}`}>
          <ReviewCard review={review} />
        </li>
      ))}
    </ul>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const title = review.movie_title ?? `영화 #${review.movie_id ?? "-"}`;
  const ratingNum =
    typeof review.rating === "number" ? review.rating : Number(review.rating);

  const inner = (
    <article className="flex gap-4 rounded-2xl border border-zinc-200 p-4 transition-colors group-hover:border-amber-300 dark:border-zinc-800 dark:group-hover:border-amber-500/40">
      {review.movie_poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={review.movie_poster}
          alt=""
          aria-hidden
          className="h-24 w-16 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[10px] text-zinc-400 dark:bg-zinc-800">
          이미지 없음
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="truncate font-bold text-zinc-900 dark:text-zinc-50">
            {title}
          </h3>
          <span className="flex shrink-0 items-center gap-1 font-bold text-amber-600">
            <PopcornIcon fill="full" className="h-4 w-4" />
            {Number.isFinite(ratingNum) ? ratingNum.toFixed(1) : "-"}
          </span>
        </div>

        {review.contains_spoiler ? (
          <span className="mt-1 inline-flex rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-950/40 dark:text-red-300">
            스포일러
          </span>
        ) : null}

        {review.content ? (
          <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {review.content}
          </p>
        ) : null}

        {review.created_at ? (
          <time className="mt-2 block text-xs text-zinc-400">
            {new Date(review.created_at).toLocaleDateString("ko-KR")}
          </time>
        ) : null}
      </div>
    </article>
  );

  return review.movie_id != null ? (
    <Link href={`/movie/${review.movie_id}`} className="group block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
