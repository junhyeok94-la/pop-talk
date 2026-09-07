import { AppHeader } from "@/components/AppHeader";
import { MovieBrowser } from "@/components/MovieBrowser";
import { MovieRail } from "@/components/MovieRail";
import { RecommendInput } from "@/components/RecommendInput";
import { getCatalogMovies } from "@/lib/api";
import { getDisplayCategories } from "@/lib/auth/server";
import { toMovieView, type MovieView } from "@/lib/movie-view";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { movieQuery } = await searchParams;
  const initialMovieQuery = typeof movieQuery === "string" ? movieQuery.trim() : "";
  // 로그인 시 /catalog/display-categories 로 칩을 채우고, 비로그인/실패 시 null → 기본 칩
  const displayCategories = await getDisplayCategories();

  // 카탈로그 30편 — 추천 마퀴(상위 20) + 전체 영화 그리드(30) 공용
  let catalog: MovieView[] = [];
  let catalogError = false;
  try {
    const page = await getCatalogMovies({ size: 30 });
    catalog = page.items.map(toMovieView);
  } catch (e) {
    console.error("[home] 카탈로그 로드 실패:", e);
    catalogError = true;
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-1 flex-col bg-white shadow-sm dark:bg-black">
      <AppHeader />

      <main className="flex min-w-0 flex-1 flex-col gap-12 overflow-hidden px-4 py-6 md:gap-16 md:px-8 md:py-10 lg:px-10 lg:py-12">
        {/* 팝톡 추천 (좌→우 무한 마퀴) — 팝콘 인증(APPROVED) 영화만 */}
        <MovieRail
          reverse
          title="팝톡 추천"
          movies={catalog.filter((m) => m.certified).slice(0, 20)}
          emptyText={
            catalogError
              ? "팝톡 추천을 불러오지 못했어요. 잠시 후 다시 시도해주세요."
              : undefined
          }
        />

        {/* 자연어 추천 */}
        <section className="mx-auto w-full max-w-2xl text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 md:text-3xl lg:text-4xl dark:text-zinc-50">
            오늘은 어떤 영화를 찾고 계신가요?
          </h1>
          <p className="mt-2 text-[15px] text-zinc-500 md:mt-3 md:text-base lg:text-lg dark:text-zinc-400">
            자연어로 원하는 분위기, 취향, 상황을 설명해보세요.
          </p>
          <div className="mt-5 text-left md:mt-7">
            <RecommendInput categories={displayCategories} />
          </div>
        </section>

        {/* 전체 영화 (제목 검색 + 바둑판 그리드) */}
        <section id="all-movies" className="scroll-mt-24">
          <h2 className="mb-3 text-lg font-bold text-zinc-900 md:mb-4 md:text-xl lg:text-2xl dark:text-zinc-50">
            전체 영화
          </h2>
          <MovieBrowser
            key={initialMovieQuery || "all"}
            initial={catalog}
            initialQuery={initialMovieQuery}
          />
        </section>
      </main>
    </div>
  );
}
