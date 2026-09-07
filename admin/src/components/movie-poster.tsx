import { ImageFrame } from "@seed-design/react";

import { posterOf, type Movie } from "@/lib/mock";
import { IconMovie } from "@/lib/icons";
import styles from "./movie-poster.module.css";

/**
 * 실 데이터에는 포스터가 없는 영화가 32%다. 빈 문자열을 src에 넘기면 브라우저가
 * 현재 페이지를 다시 내려받으므로, URL이 없으면 아예 img를 그리지 않고 자리만 채운다.
 */
export function MoviePoster({
  movie,
  width = "28px",
  className,
}: {
  movie: Movie;
  width?: string;
  className?: string;
}) {
  const url = posterOf(movie);

  if (!url) {
    return (
      <div
        className={`${styles.empty} ${className ?? ""}`}
        style={{ width }}
        role="img"
        aria-label={`${movie.title_ko} 포스터 없음`}
      >
        <IconMovie size={14} />
      </div>
    );
  }

  return <ImageFrame className={className} src={url} alt="" ratio={3 / 4} width={width} />;
}
