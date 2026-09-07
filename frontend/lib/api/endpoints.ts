import { apiFetch, type QueryParams } from "@/lib/api/client";
import type {
  KMovie,
  KMoviePage,
  Me,
  MovieDetail,
  MovieQuery,
  MovieSummary,
  Paginated,
  RecommendationCategory,
  RecommendationFeedback,
  RecommendationResult,
  Review,
} from "@/lib/api/types";

/* ------------------------------------------------------------------ *
 * 명세: Notion "유저사이드 서비스 API 명세 — Draft v0.1.0"
 * 아직 백엔드 미구현 엔드포인트가 많음(현재 /health 만 라이브). 구현되면 그대로 사용.
 * ------------------------------------------------------------------ */

/* 인증·사용자 */
export const getMe = (signal?: AbortSignal) =>
  apiFetch<Me>("/me", { signal });

/* 카탈로그 영화 — /catalog/movies (WAS 오리진, 공개). 홈 추천 스와이퍼용 */
export const getCatalogMovies = (
  params?: { page?: number; size?: number },
  signal?: AbortSignal,
) =>
  apiFetch<KMoviePage>("/catalog/movies", {
    raw: true,
    auth: false,
    baseUrl:
      process.env.CATALOG_API_ORIGIN ??
      process.env.WAS_API_ORIGIN ??
      "http://popcorn-private-alb-144239326-fdd5172f3bd6.kr.lb.naverncp.com:3200",
    query: params as QueryParams | undefined,
    signal,
  });

/* 영화 — 실제 라이브 엔드포인트 (루트 /movies, /api/v1 아님) */
export const getMovieList = (
  params?: { page?: number; size?: number },
  signal?: AbortSignal,
) =>
  apiFetch<KMoviePage>("/movies", {
    raw: true,
    auth: false,
    query: params as QueryParams | undefined,
    signal,
  });

export const getMovieDetail = (movieId: number | string, signal?: AbortSignal) =>
  apiFetch<KMovie>(`/catalog/movies/${encodeURIComponent(String(movieId))}`, {
    // 공개 카탈로그 상세. /movies/{id} 는 백엔드가 인증을 요구하므로 사용 X
    raw: true,
    auth: false,
    baseUrl:
      process.env.CATALOG_API_ORIGIN ??
      process.env.WAS_API_ORIGIN ??
      "http://popcorn-private-alb-144239326-fdd5172f3bd6.kr.lb.naverncp.com:3200",
    signal,
  });

/* 영화 — 명세(/api/v1) 기반. BE가 /api/v1 로 정리되면 사용 */
export const getMovies = (query?: MovieQuery, signal?: AbortSignal) =>
  apiFetch<Paginated<MovieSummary>>("/movies", {
    query: query as QueryParams | undefined,
    auth: false,
    signal,
  });

export const searchMovies = (query: string, signal?: AbortSignal) =>
  apiFetch<MovieSummary[]>("/movies/search", { query: { query }, auth: false, signal });

export const getMovie = (movieId: string, signal?: AbortSignal) =>
  apiFetch<MovieDetail>(`/movies/${encodeURIComponent(movieId)}`, { auth: false, signal });

export const getSimilarMovies = (movieId: string, signal?: AbortSignal) =>
  apiFetch<MovieSummary[]>(`/movies/${encodeURIComponent(movieId)}/similar`, {
    auth: false,
    signal,
  });

/* 개인화 추천 */
export const getRecommendationCategories = (signal?: AbortSignal) =>
  apiFetch<RecommendationCategory[]>("/recommendation-categories", { signal });

export const getRecommendations = (
  params?: { categoryId?: string; query?: string },
  signal?: AbortSignal,
) => apiFetch<RecommendationResult>("/recommendations", { query: params, signal });

export const getRecommendation = (recommendationId: string, signal?: AbortSignal) =>
  apiFetch<RecommendationResult>(
    `/recommendations/${encodeURIComponent(recommendationId)}`,
    { signal },
  );

export const sendRecommendationFeedback = (
  recommendationId: string,
  feedback: RecommendationFeedback,
) =>
  apiFetch<void>(
    `/recommendations/${encodeURIComponent(recommendationId)}/feedback`,
    { method: "POST", body: { feedback } },
  );

/* 찜 */
export const getFavorites = (signal?: AbortSignal) =>
  apiFetch<Paginated<MovieSummary>>("/me/favorites", { signal });

export const addFavorite = (movieId: string) =>
  apiFetch<void>(`/me/favorites/${encodeURIComponent(movieId)}`, { method: "PUT" });

export const removeFavorite = (movieId: string) =>
  apiFetch<void>(`/me/favorites/${encodeURIComponent(movieId)}`, { method: "DELETE" });

/* 평점·감상평 */
export const getMovieReviews = (movieId: string, signal?: AbortSignal) =>
  apiFetch<Paginated<Review>>(`/movies/${encodeURIComponent(movieId)}/reviews`, {
    auth: false,
    signal,
  });

export const upsertMyReview = (
  movieId: string,
  review: { rating: number; content: string; containsSpoiler?: boolean },
) =>
  apiFetch<Review>(`/movies/${encodeURIComponent(movieId)}/my-review`, {
    method: "PUT",
    body: review,
  });

export const deleteMyReview = (movieId: string) =>
  apiFetch<void>(`/movies/${encodeURIComponent(movieId)}/my-review`, {
    method: "DELETE",
  });
