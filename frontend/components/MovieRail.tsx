import { MovieThumb } from "@/components/MovieThumb";
import type { MovieView } from "@/lib/movie-view";

/** 카드 1장당 롤링 시간(초) — Swiper speed(5s/slide)와 동일한 체감 속도 */
const SECONDS_PER_CARD = 5;

/**
 * 영화 썸네일 무한 롤링 레일 (공통).
 * CSS 마퀴 방식: 목록을 2배 복제하고 한 벌(-50%)만큼 등속 이동해
 * 이음새 없이 무한 롤링한다(Swiper loop 의 재배치 튐 제거). hover 시 정지.
 * reverse=true 면 좌→우, 아니면 우→좌.
 */
export function MovieRail({
  title,
  movies,
  emptyText = "표시할 영화가 없어요.",
  reverse = false,
}: {
  title?: string;
  movies: MovieView[];
  emptyText?: string;
  /** true 면 좌→우, 기본은 우→좌 */
  reverse?: boolean;
}) {
  const durationSec = Math.max(20, movies.length * SECONDS_PER_CARD);

  return (
    <section className="min-w-0 overflow-hidden">
      {title && (
        <h2 className="mb-3 text-lg font-bold text-zinc-900 md:mb-4 md:text-xl lg:text-2xl dark:text-zinc-50">
          {title}
        </h2>
      )}

      {movies.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyText}</p>
      ) : (
        <div className="movie-marquee overflow-hidden">
          <ul
            className="movie-marquee-track flex w-max"
            style={{
              animationDuration: `${durationSec}s`,
              animationDirection: reverse ? "reverse" : "normal",
            }}
          >
            {/* 목록을 2벌 렌더 → 이음새 없는 루프 (각 카드 우측 마진으로 간격 균일) */}
            {[...movies, ...movies].map((m, i) => (
              <li
                key={`${m.id}-${i}`}
                className="mr-3 w-[132px] shrink-0 md:mr-4 md:w-[168px] lg:w-[184px]"
                aria-hidden={i >= movies.length}
              >
                <MovieThumb movie={m} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
