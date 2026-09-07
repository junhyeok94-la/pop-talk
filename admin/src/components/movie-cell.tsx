import { directorOf, releaseYearOf, type Movie } from "@/lib/mock";
import { MoviePoster } from "./movie-poster";
import styles from "./movie-cell.module.css";

/** 목록 화면들이 공통으로 쓰는 "포스터 + 제목 + 감독·연도" 셀. */
export function MovieCell({ movie }: { movie: Movie }) {
  return (
    <div className={styles.cell}>
      <MoviePoster movie={movie} />
      <div>
        <div className={styles.title}>{movie.title_ko}</div>
        <div className={styles.meta}>
          {directorOf(movie)} · {releaseYearOf(movie)}
        </div>
      </div>
    </div>
  );
}

/** 담당자 표시. 값이 없으면 em dash. */
export function AdminChip({ name }: { name?: string }) {
  if (!name) return <span className={styles.none}>—</span>;
  return <span className={styles.adminName}>{name}</span>;
}
