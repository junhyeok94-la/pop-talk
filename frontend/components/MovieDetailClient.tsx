"use client";

import { useQuery } from "@tanstack/react-query";
import { MovieRail } from "@/components/MovieRail";
import { MovieReviewList } from "@/components/MovieReviewList";
import { ReviewForm, type ExistingReview } from "@/components/ReviewForm";
import type { KMovie, KMoviePage } from "@/lib/api/types";
import { gradeMeta, moviePoster, toMovieView, type MovieView } from "@/lib/movie-view";

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  for (const key of ["name", "title", "name_ko", "title_ko", "label"]) {
    if (typeof item[key] === "string") return item[key];
  }
  return "";
}

function toTextList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(toText).filter(Boolean) : [];
}

async function readJson(response: Response) {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function fetchMovie(movieId: string): Promise<KMovie> {
  const response = await fetch(`/api/catalog/movies/${encodeURIComponent(movieId)}`, {
    cache: "no-store",
  });
  return await readJson(response) as KMovie;
}

async function fetchRecommendations(movieId: string): Promise<MovieView[]> {
  const response = await fetch("/api/catalog/movies?size=10", { cache: "no-store" });
  const data = await readJson(response) as KMoviePage;
  const items = Array.isArray(data.items) ? data.items : [];
  return items
    .flatMap((movie) => {
      try {
        return [toMovieView(movie)];
      } catch {
        return [];
      }
    })
    .filter((movie) => movie.id !== movieId);
}

async function fetchMyReview(movieId: number): Promise<{
  isAuthenticated: boolean;
  review: ExistingReview | null;
}> {
  const response = await fetch("/api/me/reviews", { cache: "no-store" });
  if (response.status === 401) return { isAuthenticated: false, review: null };
  const data = await readJson(response) as { items?: Array<Record<string, unknown>> };
  const items = Array.isArray(data.items) ? data.items : [];
  const found = items.find((item) => Number(item.movie_id) === movieId);
  if (!found) return { isAuthenticated: true, review: null };
  return {
    isAuthenticated: true,
    review: {
      id: String(found.id),
      rating: Number(found.rating),
      content: toText(found.content),
      contains_spoiler: Boolean(found.contains_spoiler),
    },
  };
}

export function MovieDetailClient({ movieId }: { movieId: string }) {
  const movieQuery = useQuery({
    queryKey: ["catalog-movie", movieId],
    queryFn: () => fetchMovie(movieId),
    retry: 1,
  });

  if (movieQuery.isPending) return <MovieDetailSkeleton />;
  if (movieQuery.error || !movieQuery.data) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-20">
        <section className="w-full max-w-md rounded-3xl border border-zinc-200 p-8 text-center dark:border-zinc-800">
          <div className="text-3xl" aria-hidden>🍿</div>
          <h1 className="mt-4 text-xl font-extrabold text-zinc-900 dark:text-zinc-50">영화 정보를 불러오지 못했어요</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{movieQuery.error instanceof Error ? movieQuery.error.message : "잠시 후 다시 시도해주세요."}</p>
          <button type="button" onClick={() => void movieQuery.refetch()} className="mt-5 rounded-xl bg-amber-600 px-5 py-3 text-sm font-extrabold text-white">다시 시도</button>
        </section>
      </main>
    );
  }

  return <MovieDetailContent movie={movieQuery.data} routeMovieId={movieId} />;
}

function MovieDetailContent({ movie, routeMovieId }: { movie: KMovie; routeMovieId: string }) {
  const recommendations = useQuery({
    queryKey: ["catalog-movie-recommendations", routeMovieId],
    queryFn: () => fetchRecommendations(routeMovieId),
  });
  const myReview = useQuery({
    queryKey: ["my-review", movie.id],
    queryFn: () => fetchMyReview(movie.id),
    retry: false,
  });

  const poster = moviePoster(movie);
  const title = toText(movie.title_ko) || "제목 미정";
  const subtitle = toText(movie.title_en) || toText(movie.title_original);
  const plot = toText(movie.plot);
  const genres = toTextList(movie.genres);
  const countries = toTextList(movie.production_countries);
  const directors = toTextList(movie.directors);
  const actors = toTextList(movie.actors);
  const companies = toTextList(movie.production_companies);
  const viewingGrade = toText(movie.viewing_grade);
  const representativeCountry = toText(movie.representative_country);
  const representativeGenre = toText(movie.representative_genre);
  const grade = gradeMeta(viewingGrade);
  const meta = [movie.production_year, representativeCountry, representativeGenre, movie.runtime_minutes ? `${movie.runtime_minutes}분` : "", viewingGrade].filter(Boolean).join(" · ");
  const infoRows = [
    ["개봉일", toText(movie.release_date) || "미정"],
    ["제작연도", movie.production_year ? `${movie.production_year}년` : "미정"],
    ["국가", countries.join(", ") || representativeCountry || "미정"],
    ["장르", genres.join(", ") || representativeGenre || "미정"],
    ["러닝타임", movie.runtime_minutes ? `${movie.runtime_minutes}분` : "미정"],
    ["관람등급", viewingGrade || "미정"],
    ["유형", toText(movie.movie_type) || "미정"],
  ];

  return (
    <>
      <div className="relative h-48 w-full overflow-hidden md:h-72 lg:h-80">
        {/* 외부 영화 포스터 오리진이 가변적이라 원본 URL을 그대로 사용한다. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {poster ? <img src={poster} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" /> : null}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white dark:to-black" />
      </div>
      <main className="flex-1 px-4 md:px-8 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-12 lg:px-10">
        <div className="relative -mt-24 w-32 self-start overflow-hidden rounded-2xl bg-zinc-200 shadow-lg ring-4 ring-white md:-mt-40 md:w-52 lg:-mt-44 lg:w-full dark:bg-zinc-800 dark:ring-black">
          <div className="relative aspect-[2/3] w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {poster ? <img src={poster} alt={title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-zinc-400">이미지 없음</div>}
            <span className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: grade.color }}>{grade.label}</span>
          </div>
        </div>
        <div className="min-w-0 lg:-mt-16">
          <h1 className="mt-4 text-2xl font-extrabold text-zinc-900 md:text-4xl lg:mt-0 lg:text-5xl dark:text-zinc-50">{title}</h1>
          {subtitle && subtitle !== title ? <p className="mt-1 text-sm text-zinc-400 md:text-base">{subtitle}</p> : null}
          <p className="mt-2 text-sm text-zinc-500 md:text-base dark:text-zinc-400">{meta}</p>
          {genres.length ? <div className="mt-3 flex flex-wrap gap-2">{genres.map((genre) => <span key={genre} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">{genre}</span>)}</div> : null}
          {plot ? <section className="mt-6 md:mt-8"><h2 className="mb-2 text-base font-bold text-zinc-900 md:text-xl dark:text-zinc-50">줄거리</h2><p className="whitespace-pre-line text-[15px] leading-7 text-zinc-700 md:text-base md:leading-8 dark:text-zinc-300">{plot}</p></section> : null}
          {myReview.isPending ? <div className="mt-6 h-40 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" /> : <ReviewForm movieId={movie.id} isAuthenticated={myReview.data?.isAuthenticated ?? false} existingReview={myReview.data?.review ?? null} />}
          <MovieReviewList movieId={movie.id} />
          <div className="md:grid md:grid-cols-2 md:gap-6">
            <InfoSection rows={infoRows} />
            <section className="mt-6 rounded-2xl border border-zinc-200 p-5 md:mt-8 md:p-6 dark:border-zinc-800"><h2 className="mb-3 font-bold text-zinc-900 dark:text-zinc-50">출연·제작</h2><div className="flex flex-col gap-3 text-[15px]"><CreditRow label="감독" people={directors} /><CreditRow label="출연" people={actors} /><CreditRow label="제작사" people={companies} /></div></section>
          </div>
        </div>
      </main>
      <div className="min-w-0 overflow-hidden px-4 pb-12 pt-8 md:px-8 md:pb-16 md:pt-12 lg:px-10 lg:pt-16"><MovieRail title="이런 영화는 어때요?" movies={recommendations.data ?? []} emptyText={recommendations.isError ? "추천 영화를 불러오지 못했어요." : undefined} /></div>
    </>
  );
}

function InfoSection({ rows }: { rows: string[][] }) {
  return <section className="mt-6 rounded-2xl border border-zinc-200 p-5 md:mt-8 md:p-6 dark:border-zinc-800"><h2 className="mb-2 font-bold text-zinc-900 dark:text-zinc-50">정보</h2><dl>{rows.map(([label, value], index) => <div key={label} className={`flex justify-between gap-4 py-2.5 text-[15px] ${index ? "border-t border-zinc-100 dark:border-zinc-800" : ""}`}><dt className="shrink-0 text-zinc-500">{label}</dt><dd className="text-right font-semibold text-zinc-800 dark:text-zinc-100">{value}</dd></div>)}</dl></section>;
}

function CreditRow({ label, people }: { label: string; people: string[] }) {
  if (!people.length) return null;
  return <div className="flex gap-3"><span className="w-14 shrink-0 text-zinc-500">{label}</span><span className="flex-1 font-medium text-zinc-800 dark:text-zinc-100">{people.join(", ")}</span></div>;
}

function MovieDetailSkeleton() {
  return <main role="status" aria-label="영화 정보를 불러오는 중" className="flex-1 animate-pulse px-4 py-8 md:px-8 lg:px-10"><div className="h-64 rounded-3xl bg-zinc-200 dark:bg-zinc-900" /><div className="mt-8 h-10 w-2/3 rounded bg-zinc-200 dark:bg-zinc-900" /><div className="mt-4 h-5 w-1/2 rounded bg-zinc-200 dark:bg-zinc-900" /><div className="mt-10 h-40 rounded-2xl bg-zinc-200 dark:bg-zinc-900" /><span className="sr-only">불러오는 중입니다.</span></main>;
}
