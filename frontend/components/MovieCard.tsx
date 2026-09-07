import Link from "next/link";
import type { Movie } from "@/lib/movies";
import { MoviePoster } from "@/components/MoviePoster";

/** 추천 영화 카드 — 세로 포스터 + 제목. 클릭 시 상세로 이동. */
export function MovieCard({
  movie,
  className = "",
}: {
  movie: Movie;
  className?: string;
}) {
  return (
    <Link
      href={`/movie/${movie.id}`}
      className={`group block w-[132px] shrink-0 md:w-[168px] lg:w-full ${className}`}
    >
      <MoviePoster
        movie={movie}
        className="aspect-[2/3] w-full transition-transform group-hover:-translate-y-0.5 group-hover:shadow-lg"
      />
      <p className="mt-2 truncate text-sm font-semibold text-zinc-900 md:mt-3 md:text-base dark:text-zinc-100">
        {movie.title}
      </p>
    </Link>
  );
}
