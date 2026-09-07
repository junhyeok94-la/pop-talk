"use client";

import { useEffect, useRef, useState } from "react";
import { MovieThumb } from "@/components/MovieThumb";
import { toMovieView, type MovieView } from "@/lib/movie-view";
import type { KMovie } from "@/lib/api/types";

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 1_000;

/**
 * 전체 영화 — 제목 검색 + 바둑판 그리드.
 * 검색은 /api/catalog/movies?q= (서버 프록시) 로 카탈로그 전체를 대상으로 한다.
 */
export function MovieBrowser({
  initial,
  initialQuery = "",
}: {
  initial: MovieView[];
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [movies, setMovies] = useState<MovieView[]>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(Boolean(initialQuery));

  useEffect(() => {
    // 초기 렌더는 SSR 데이터(initial) 사용 → 첫 실행은 건너뜀
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const q = query.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ size: String(PAGE_SIZE) });
        if (q) params.set("q", q);
        const res = await fetch(`/api/catalog/movies?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data: unknown = await res.json().catch(() => null);
        if (!res.ok) throw new Error("검색에 실패했어요.");
        const items =
          data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)
            ? ((data as { items: KMovie[] }).items)
            : [];
        setMovies(items.map(toMovieView));
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("검색에 실패했어요. 잠시 후 다시 시도해주세요.");
      } finally {
        setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div>
      <div className="relative mb-4 md:mb-6">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="영화 제목으로 검색"
          aria-label="영화 제목 검색"
          className="w-full rounded-xl border border-zinc-200 bg-white py-3 pl-11 pr-4 text-[15px] text-zinc-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 md:max-w-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <svg
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : movies.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {loading ? "검색 중…" : "검색 결과가 없어요."}
        </p>
      ) : (
        <div
          className={`grid grid-cols-2 gap-x-3 gap-y-5 transition-opacity sm:grid-cols-3 md:grid-cols-4 md:gap-x-4 lg:grid-cols-5 xl:grid-cols-6 ${
            loading ? "opacity-60" : ""
          }`}
        >
          {movies.map((m) => (
            <MovieThumb key={m.id} movie={m} />
          ))}
        </div>
      )}
    </div>
  );
}
