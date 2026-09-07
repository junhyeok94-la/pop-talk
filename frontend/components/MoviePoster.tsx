import type { Movie } from "@/lib/movies";
import { MoodTag } from "@/components/MoodTag";
import { MatchPill } from "@/components/MatchPill";
import { PopcornBadge } from "@/components/PopcornBadge";

/**
 * 영화 포스터 프레임 — 그라디언트 배경 위에
 * 무드 태그 + 러닝타임 필(좌상단), 매칭 점수(우하단)를 얹는다.
 * `showCategories` 를 켜면 팝콘 카테고리 배지 오버레이를 노출한다.
 */
export function MoviePoster({
  movie,
  className = "",
  rounded = "rounded-2xl",
  showRuntime = true,
  showCategories = false,
}: {
  movie: Movie;
  className?: string;
  rounded?: string;
  showRuntime?: boolean;
  showCategories?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden ${rounded} ${className}`}
      style={{
        backgroundImage: `linear-gradient(155deg, ${movie.poster[0]}, ${movie.poster[1]})`,
      }}
    >
      {/* 좌상단: 무드 + 러닝타임 (또는 팝콘 카테고리 배지) */}
      <div className="absolute left-2 top-2 flex flex-col items-start gap-1.5">
        {showCategories ? (
          <div className="flex flex-wrap gap-1">
            {movie.categories.map((c) => (
              <PopcornBadge key={c} category={c} size="sm" variant="overlay" />
            ))}
          </div>
        ) : (
          <>
            <MoodTag mood={movie.mood} />
            {showRuntime && (
              <span className="inline-flex items-center rounded-md bg-blue-500 px-2 py-1 text-xs font-bold leading-none text-white shadow-sm">
                {movie.runtimeMin <= 120 ? "120분 이내" : `${movie.runtimeMin}분`}
              </span>
            )}
          </>
        )}
      </div>

      {/* 우하단: 매칭 점수 */}
      <div className="absolute bottom-2 right-2">
        <MatchPill value={movie.matchPct} />
      </div>
    </div>
  );
}
