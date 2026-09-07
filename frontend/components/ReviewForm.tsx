"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AUTH_OPEN_EVENT } from "@/lib/auth/types";
import { movieReviewsKey } from "@/lib/reviews/query";
import { PopcornIcon } from "@/components/PopcornIcon";

export type ExistingReview = {
  id: string;
  rating: number;
  content: string;
  contains_spoiler: boolean;
};

export function ReviewForm({
  movieId,
  isAuthenticated,
  existingReview = null,
}: {
  movieId: number;
  isAuthenticated: boolean;
  existingReview?: ExistingReview | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(existingReview?.rating ?? 5);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  if (!isAuthenticated) {
    return (
      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 md:mt-8 md:p-6 dark:border-amber-900/60 dark:bg-amber-950/20">
        <h2 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50">이 영화는 어떠셨나요?</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">로그인하면 평점과 리뷰를 남길 수 있어요.</p>
        <button type="button" onClick={() => window.dispatchEvent(new Event(AUTH_OPEN_EVENT))} className="mt-4 rounded-xl bg-amber-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-amber-700">로그인하고 평점 남기기</button>
      </section>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      rating,
      content: form.get("content"),
      contains_spoiler: form.get("contains_spoiler") === "on",
    };
    const isEdit = Boolean(existingReview);
    const response = await fetch(
      isEdit ? `/api/reviews/${existingReview!.id}` : "/api/reviews",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? payload : { movie_id: movieId, ...payload }),
      },
    ).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    setPending(false);
    if (!response?.ok) {
      return setMessage({
        kind: "error",
        text: typeof result.error === "string" ? result.error : "평점을 등록하지 못했습니다.",
      });
    }
    setMessage({ kind: "success", text: isEdit ? "리뷰가 수정되었습니다." : "평점과 리뷰가 등록되었습니다." });
    if (isEdit) {
      setEditing(false);
    } else {
      event.currentTarget?.reset();
      setRating(5);
    }
    await queryClient.invalidateQueries({ queryKey: movieReviewsKey(movieId) });
    await queryClient.invalidateQueries({ queryKey: ["my-review", movieId] });
    router.refresh();
  }

  async function remove() {
    if (!existingReview) return;
    setPending(true);
    setMessage(null);
    const response = await fetch(`/api/reviews/${existingReview.id}`, { method: "DELETE" }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    setPending(false);
    if (!response?.ok) {
      return setMessage({
        kind: "error",
        text: typeof result.error === "string" ? result.error : "리뷰를 삭제하지 못했습니다.",
      });
    }
    setEditing(false);
    await queryClient.invalidateQueries({ queryKey: movieReviewsKey(movieId) });
    await queryClient.invalidateQueries({ queryKey: ["my-review", movieId] });
    router.refresh();
  }

  // 이미 작성한 리뷰가 있고, 수정 중이 아니면 → 읽기 전용으로 노출
  if (existingReview && !editing) {
    return (
      <section className="mt-6 rounded-2xl border border-zinc-200 p-5 md:mt-8 md:p-6 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50">내 평점</h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setMessage(null); setRating(existingReview.rating); setEditing(true); }} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900">수정</button>
            <button type="button" onClick={remove} disabled={pending} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30">삭제</button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((v) => (
            <PopcornIcon key={v} fill={popcornFill(existingReview.rating, v)} className="h-6 w-6" />
          ))}
          <span className="ml-2 font-bold text-amber-600">{existingReview.rating.toFixed(1)}</span>
        </div>
        {existingReview.contains_spoiler ? (
          <span className="mt-2 inline-flex rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-950/40 dark:text-red-300">스포일러</span>
        ) : null}
        <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-zinc-700 dark:text-zinc-300">{existingReview.content}</p>
        {message ? (
          <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm ${message.kind === "success" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"}`}>{message.text}</p>
        ) : null}
      </section>
    );
  }

  const isEdit = Boolean(existingReview);
  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 p-5 md:mt-8 md:p-6 dark:border-zinc-800">
      <h2 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50">{isEdit ? "내 평점 수정" : "평점 남기기"}</h2>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-sm font-bold text-zinc-700 dark:text-zinc-300">평점 {rating}점</legend>
          <div className="flex gap-1.5" role="radiogroup" aria-label={`5점 만점에 ${rating}점`}>
            {[1, 2, 3, 4, 5].map((value) => (
              <span key={value} className="relative inline-flex h-9 w-9 transition-transform hover:scale-110">
                <PopcornIcon fill={popcornFill(rating, value)} className="h-9 w-9" />
                <button type="button" role="radio" aria-label={`${value - 0.5}점`} aria-checked={rating === value - 0.5} onClick={() => setRating(value - 0.5)} className="absolute inset-y-0 left-0 w-1/2 rounded-l focus-visible:outline-2 focus-visible:outline-amber-500" />
                <button type="button" role="radio" aria-label={`${value}점`} aria-checked={rating === value} onClick={() => setRating(value)} className="absolute inset-y-0 right-0 w-1/2 rounded-r focus-visible:outline-2 focus-visible:outline-amber-500" />
              </span>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-2 text-sm font-bold text-zinc-700 dark:text-zinc-300">리뷰
          <textarea name="content" required maxLength={3000} rows={4} defaultValue={existingReview?.content ?? ""} placeholder="영화에 대한 감상을 남겨주세요." className="resize-y rounded-xl border border-zinc-200 bg-white p-4 font-normal text-zinc-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50" />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"><input type="checkbox" name="contains_spoiler" defaultChecked={existingReview?.contains_spoiler ?? false} className="h-4 w-4 accent-amber-600" />스포일러가 포함되어 있어요</label>
        {message ? <p role="status" className={`rounded-xl px-4 py-3 text-sm ${message.kind === "success" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"}`}>{message.text}</p> : null}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className="h-12 flex-1 rounded-xl bg-amber-600 font-extrabold text-white hover:bg-amber-700 disabled:cursor-wait disabled:opacity-60">{pending ? "저장 중..." : isEdit ? "평점 수정" : "평점 등록"}</button>
          {isEdit ? <button type="button" onClick={() => { setEditing(false); setMessage(null); }} disabled={pending} className="h-12 rounded-xl border border-zinc-300 px-5 font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900">취소</button> : null}
        </div>
      </form>
    </section>
  );
}

function popcornFill(rating: number, position: number) {
  if (rating >= position) return "full" as const;
  if (rating >= position - 0.5) return "half" as const;
  return "empty" as const;
}
