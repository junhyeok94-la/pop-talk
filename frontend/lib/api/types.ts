/**
 * Pop Talk 유저사이드 API 타입.
 * 출처: Notion "유저사이드 서비스 API 명세 — Draft v0.1.0" (v0.1.0, 초안이라 변경될 수 있음)
 */

/** 공통 페이지네이션 응답 */
export interface Paginated<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

/** RFC 9457 problem+json 오류 바디 */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: { field: string; reason: string }[];
}

export interface HealthStatus {
  status: string;
  database?: string;
  timestamp?: string;
}

/** 영화 요약 (목록/추천 카드용) */
export interface MovieSummary {
  id: string;
  title: string;
  posterUrl?: string | null;
  runtimeMinutes?: number;
  contentRating?: string;
  releaseYear?: number;
  genre?: string;
}

/** 영화 상세 */
export interface MovieDetail extends MovieSummary {
  overview?: string;
  country?: string;
  directors?: Person[];
  actors?: Person[];
  genres?: string[];
}

export interface Person {
  type?: "ACTOR" | "DIRECTOR";
  name: string;
}

/** 추천 결과 아이템 (추천 이유 + 검증 포함) */
export interface RecommendationItem {
  movie: MovieSummary;
  reasons: string[];
  verification?: {
    verified: boolean;
    confidence: number;
    checks?: Record<string, boolean>;
  };
}

export interface RecommendationResult {
  recommendationId: string;
  query?: string;
  items: RecommendationItem[];
}

export interface RecommendationCategory {
  id: string;
  label: string;
  description?: string;
}

/** 내 프로필 · 온보딩 상태 */
export type OnboardingStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "SKIPPED";

export interface Me {
  id: string;
  email?: string;
  name?: string;
  onboardingStatus: OnboardingStatus;
}

export interface Review {
  id: string;
  movieId: string;
  author?: string;
  rating: number;
  content: string;
  containsSpoiler?: boolean;
  createdAt?: string;
}

/** 영화 검색·목록 쿼리 파라미터 */
export interface MovieQuery {
  query?: string;
  genre?: string;
  contentRating?: string;
  runtimeMax?: number;
  releaseYear?: number;
  actor?: string;
  director?: string;
  sort?: string;
  page?: number;
  size?: number;
}

export type RecommendationFeedback =
  | "LIKE"
  | "DISLIKE"
  | "NOT_INTERESTED"
  | "ALREADY_WATCHED";

/* ------------------------------------------------------------------ *
 * 실제 백엔드 응답 (KOFIC + KMDB 기반, snake_case)
 * 라이브 엔드포인트: GET /movies (루트, /api/v1 아님)
 * ------------------------------------------------------------------ */

export interface KMovieMedia {
  url: string;
  type: "POSTER" | "STILL" | string;
  order: number;
  primary: boolean;
}

export interface KMovie {
  id: number;
  kofic_movie_cd: string;
  kmdb_id: string | null;
  kmdb_matched: boolean;
  title_ko: string;
  title_en: string | null;
  title_original: string | null;
  release_date: string | null; // YYYY-MM-DD
  production_year: number;
  runtime_minutes: number;
  movie_type: string;
  production_status: string;
  production_countries: string[];
  representative_country: string;
  genres: string[];
  representative_genre: string;
  directors: string[];
  director_names_en: string[];
  actors: string[];
  actor_roles: string[];
  production_companies: string[];
  viewing_grade: string;
  poster_url: string | null;
  plot: string | null;
  source_keywords: string[];
  service_status: string;
  approval_status: string;
  is_embedded: boolean;
  media: KMovieMedia[];
  // 운영 메타 (FE 선택적)
  created_at?: string;
  updated_at?: string;
  source_system?: string;
}

/** GET /movies 페이지네이션 래퍼 (snake_case total_pages 주의) */
export interface KMoviePage {
  page: number;
  size: number;
  total: number;
  total_pages?: number;
  items: KMovie[];
  summary?: unknown;
}
