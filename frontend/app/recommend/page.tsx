import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { MovieCard } from "@/components/MovieCard";
import { MoviePoster } from "@/components/MoviePoster";
import { MOVIES } from "@/lib/movies";

export default async function RecommendPage({
  searchParams,
}: PageProps<"/recommend">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";

  const top = MOVIES[0];
  const others = MOVIES.slice(1, 4);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-1 flex-col bg-white shadow-sm dark:bg-black">
      <AppHeader />

      <main className="flex flex-1 flex-col gap-8 px-4 py-6 md:gap-10 md:px-8 md:py-10 lg:px-10 lg:py-12">
        <section>
          <h1 className="text-lg font-bold text-zinc-900 md:text-2xl lg:text-3xl dark:text-zinc-50">
            AI 추천 결과
          </h1>
          {query && (
            <p className="mt-1 line-clamp-2 text-sm text-zinc-500 md:mt-2 md:text-base dark:text-zinc-400">
              “{query}”
            </p>
          )}
        </section>

        {/* 최상위 추천 */}
        <section className="rounded-3xl md:border md:border-zinc-200 md:p-6 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,4fr)] lg:gap-10 lg:p-8 dark:md:border-zinc-800">
          <Link href={`/movie/${top.id}`} className="flex gap-4 md:gap-6">
            <MoviePoster movie={top} className="aspect-[2/3] w-28 shrink-0 md:w-44 lg:w-full lg:max-w-64" />
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-extrabold text-zinc-900 md:text-3xl dark:text-zinc-50">
                {top.title}
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {top.year} · {top.country} · {top.genre}
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {top.runtimeMin}분 · {top.ageRating}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                  AI 신뢰도 {top.aiTrust}%
                </span>
                <span className="inline-flex items-center rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                  검증 완료
                </span>
              </div>
            </div>
          </Link>

          <div className="mt-5 lg:mt-0 lg:self-center">
            <h3 className="mb-2 text-base font-bold text-zinc-900 md:text-lg dark:text-zinc-50">
              추천 이유
            </h3>
            <ul className="flex flex-col gap-2">
              {top.reasons.map((r) => (
                <li
                  key={r}
                  className="flex gap-2 text-[15px] leading-7 text-zinc-700 md:text-base dark:text-zinc-300"
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 다른 추천 영화 */}
        <section>
          <h3 className="mb-3 text-base font-bold text-zinc-900 md:mb-4 md:text-xl dark:text-zinc-50">
            다른 추천 영화
          </h3>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:-mx-8 md:gap-4 md:px-8 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {others.map((m) => (
              <MovieCard key={m.id} movie={m} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
