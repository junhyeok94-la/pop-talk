import type { Movie } from "./mock";

/**
 * 영화 필드 이름을 화면 말로 옮긴다.
 *
 * popcorn_movies_service 뷰가 missing_fields에 컬럼 이름을 그대로 담아 준다
 * (마이그레이션 008). 화면에 'title_original'이라고 띄우면 운영자가 무엇을
 * 채워야 하는지 알 수 없다.
 *
 * 목록에 없는 이름이 오면 원래 값을 그대로 보여준다 — 뷰에 필드가 추가됐는데
 * 여기를 안 고친 경우, 빈칸이 되는 것보다 낫다.
 */
const LABELS: Record<string, string> = {
  kmdb_id: "KMDB 연결",
  title_ko: "한글 제목",
  title_en: "영문 제목",
  title_original: "원제",
  release_date: "개봉일",
  production_year: "제작연도",
  runtime_minutes: "러닝타임",
  movie_type: "영화 구분",
  production_status: "제작 상태",
  production_countries: "제작 국가",
  representative_country: "대표 국가",
  genres: "장르",
  representative_genre: "대표 장르",
  directors: "감독",
  director_names_en: "감독 영문명",
  actors: "출연",
  actor_roles: "배역명",
  production_companies: "제작사",
  viewing_grade: "관람등급",
  poster_url: "포스터",
  plot: "줄거리",
  source_keywords: "키워드",
};

export function fieldLabel(name: string): string {
  return LABELS[name] ?? name;
}

/**
 * 비어 있는 필드 개수.
 *
 * missing_fields가 없을 수도 있다 — 스냅샷과 목 데이터에는 뷰가 붙여 주는
 * 값이 없다. 그때는 0으로 본다. "모르는 것"과 "비지 않은 것"을 구분해야 할
 * 자리에서는 isCompletenessKnown()으로 먼저 확인한다.
 */
export function missingCount(movie: Movie): number {
  return movie.missing_fields?.length ?? 0;
}

/** 완성도를 알 수 있는 데이터인가. 스냅샷·목으로 돌 때는 알 수 없다. */
export function isCompletenessKnown(movie: Movie): boolean {
  return movie.missing_fields !== undefined;
}

/** 화면에 나열할 한글 이름들. */
export function missingLabels(movie: Movie): string[] {
  return (movie.missing_fields ?? []).map(fieldLabel);
}
