import type { KMovie } from "@/lib/api/types";
import type { CategoryId } from "@/lib/categories";

/* ------------------------------------------------------------------ *
 * C. 관람등급(viewing_grade) → UI 배지 라벨 매핑
 * 백엔드는 KOFIC 한글 등급 문자열을 그대로 준다. 카드/상세 배지는 축약형을 쓴다.
 * ------------------------------------------------------------------ */

export interface GradeMeta {
  label: string; // 배지 축약 라벨
  color: string; // 배지 색
}

export const VIEWING_GRADE_MAP: Record<string, GradeMeta> = {
  전체관람가: { label: "전체", color: "#2F9E70" },
  "12세이상관람가": { label: "12세", color: "#3B82C4" },
  "15세이상관람가": { label: "15세", color: "#E0932F" },
  청소년관람불가: { label: "청불", color: "#E8423E" },
  제한상영가: { label: "제한", color: "#8B5CF6" },
};

const UNKNOWN_GRADE: GradeMeta = { label: "미정", color: "#9CA3AF" };

/** 등급 메타(라벨+색) 조회. 미매핑/누락 시 원문 라벨을 그대로 노출. */
export function gradeMeta(grade?: string | null): GradeMeta {
  if (!grade) return UNKNOWN_GRADE;
  return VIEWING_GRADE_MAP[grade] ?? { label: grade, color: UNKNOWN_GRADE.color };
}

/** 등급 축약 라벨만 필요할 때 */
export function gradeLabel(grade?: string | null): string {
  return gradeMeta(grade).label;
}

/* ------------------------------------------------------------------ *
 * KMovie(실제 응답) → 카드/목록용 경량 뷰 모델
 * ------------------------------------------------------------------ */

export interface MovieView {
  id: string; // 라우팅용 (String(km.id))
  title: string;
  posterUrl: string | null;
  runtimeMinutes: number;
  genre: string;
  year: number;
  grade: GradeMeta;
  categories: CategoryId[];
  /** approval_status === "APPROVED" → 팝콘인증 */
  certified: boolean;
}

const CATEGORY_RULES: Array<{
  id: CategoryId;
  keywords: string[];
}> = [
  { id: "crime", keywords: ["범죄", "수사", "형사", "탐정", "느와르"] },
  { id: "history", keywords: ["사극", "시대극", "역사", "전쟁"] },
  {
    id: "occult",
    keywords: ["오컬트", "미스터리", "공포", "호러", "괴담", "퇴마"],
  },
  { id: "social", keywords: ["사회", "고발", "정치", "인권", "노동"] },
  {
    id: "sports",
    keywords: ["스포츠", "축구", "야구", "농구", "복싱", "선수", "실화"],
  },
  {
    id: "youth-romance",
    keywords: ["청춘", "로맨스", "멜로", "연애", "첫사랑"],
  },
  {
    id: "family-growth",
    keywords: ["가족", "성장", "아동", "애니메이션"],
  },
];

/** 영화 메타데이터를 POPCORN 아이콘 카테고리(최대 2개)로 변환한다. */
export function movieCategories(km: KMovie): CategoryId[] {
  const corpus = [
    km.title_ko,
    km.representative_genre ?? "",
    ...(km.genres ?? []),
    ...(km.source_keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();

  const matched = CATEGORY_RULES.filter(({ keywords }) =>
    keywords.some((keyword) => corpus.includes(keyword)),
  ).map(({ id }) => id);

  const contextRules: Array<{ id: CategoryId; keywords: string[] }> = [
    { id: "couple", keywords: ["로맨스", "멜로", "연애"] },
    { id: "family", keywords: ["가족", "아동", "애니메이션"] },
    { id: "friends", keywords: ["액션", "코미디", "스릴러", "공포"] },
    { id: "solo", keywords: ["드라마", "다큐멘터리"] },
  ];

  for (const { id, keywords } of contextRules) {
    if (matched.length >= 2) break;
    if (!matched.includes(id) && keywords.some((keyword) => corpus.includes(keyword))) {
      matched.push(id);
    }
  }

  return matched.slice(0, 2);
}

/** media 에서 대표 포스터를 우선 선택, 없으면 poster_url 폴백 */
export function moviePoster(km: KMovie): string | null {
  const media = Array.isArray(km.media) ? km.media : [];
  const primary = media.find((m) => m?.type === "POSTER" && m.primary);
  return primary?.url ?? km.poster_url ?? media[0]?.url ?? null;
}

export function toMovieView(km: KMovie): MovieView {
  return {
    id: String(km.id),
    title: km.title_ko,
    posterUrl: moviePoster(km),
    runtimeMinutes: km.runtime_minutes,
    genre: km.representative_genre ?? km.genres?.[0] ?? "영화",
    year: km.production_year,
    grade: gradeMeta(km.viewing_grade),
    categories: movieCategories(km),
    certified: km.approval_status === "APPROVED",
  };
}
