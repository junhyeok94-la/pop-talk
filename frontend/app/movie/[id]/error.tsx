"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function MovieDetailError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[movie-detail] 상세페이지 렌더링 실패", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl items-center justify-center bg-white px-4 dark:bg-black">
      <section className="w-full max-w-md rounded-3xl border border-zinc-200 p-8 text-center shadow-sm dark:border-zinc-800">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl dark:bg-amber-950/50" aria-hidden>🍿</div>
        <h1 className="mt-5 text-xl font-extrabold text-zinc-900 dark:text-zinc-50">영화 정보를 불러오지 못했어요</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">서버 응답이 잠시 불안정할 수 있어요. 다시 시도하면 대부분 정상적으로 열립니다.</p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <Link href="/" className="rounded-xl border border-zinc-200 px-4 py-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900">홈으로</Link>
          <button type="button" onClick={retry} className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-amber-700">다시 시도</button>
        </div>
        {error.digest ? <p className="mt-4 text-xs text-zinc-400">오류 코드: {error.digest}</p> : null}
      </section>
    </main>
  );
}
