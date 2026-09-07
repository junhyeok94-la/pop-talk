import Link from "next/link";
import { PopcornBadge } from "@/components/PopcornBadge";
import { PopcornIcon } from "@/components/PopcornIcon";
import type { MovieView } from "@/lib/movie-view";

/**
 * 실데이터(KMovie) 기반 영화 썸네일 카드.
 * 포스터 이미지 + 관람등급 + 카테고리 아이콘 + 러닝타임, 클릭 시 상세로 이동.
 * (포스터는 http 원본 — 로컬(http) dev 에선 정상, HTTPS 배포 시 이미지 프록시 필요)
 */
export function MovieThumb({ movie }: { movie: MovieView }) {
  return (
    <Link
      href={`/movie/${movie.id}`}
      className="group block w-full"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-zinc-200 dark:bg-zinc-800">
        {/* 팝콘인증 (approval_status APPROVED) — 우측 상단 팝콘 아이콘 */}
        {movie.certified && (
          <span
            title="팝콘인증"
            className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-sm ring-1 ring-red-500/40 dark:bg-zinc-900/90"
          >
            <PopcornIcon fill="full" className="h-4 w-4" />
          </span>
        )}
        {movie.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={movie.posterUrl}
            alt={movie.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
            이미지 없음
          </div>
        )}

        {/* 관람등급 배지 */}
        <span
          className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm"
          style={{ backgroundColor: movie.grade.color }}
        >
          {movie.grade.label}
        </span>

        {/* POPCORN 카테고리 아이콘 */}
        {movie.categories.length > 0 && (
          <div className="absolute bottom-2 left-2 flex gap-1">
            {movie.categories.map((category) => (
              <PopcornBadge
                key={category}
                category={category}
                size="sm"
                variant="icon"
                className="h-6 w-6 rounded-full bg-black/65 shadow-sm ring-1 ring-white/15 backdrop-blur-sm"
              />
            ))}
          </div>
        )}

        {/* 러닝타임 */}
        <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          {movie.runtimeMinutes}분
        </span>
      </div>

      <p className="mt-2 truncate text-sm font-semibold text-zinc-900 md:mt-3 md:text-base dark:text-zinc-100">
        {movie.title}
      </p>
      <p className="truncate text-xs text-zinc-500 md:text-sm dark:text-zinc-400">
        {movie.year} · {movie.genre}
      </p>
    </Link>
  );
}
