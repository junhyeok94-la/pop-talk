import type { CategoryId } from "@/lib/categories";

/** 카드에 얹는 "관람 상황" 무드 태그 (솔리드 필) */
export type MoodId = "date" | "light" | "family" | "critic" | "healing";

export interface MoodMeta {
  id: MoodId;
  label: string;
  /** 배경/전경 색 */
  bg: string;
  fg: string;
}

export const MOODS: Record<MoodId, MoodMeta> = {
  date: { id: "date", label: "데이트 무비", bg: "#EF5B6E", fg: "#ffffff" },
  light: { id: "light", label: "가볍게 보기", bg: "#C77B33", fg: "#ffffff" },
  family: { id: "family", label: "가족과 함께", bg: "#3F4A5C", fg: "#ffffff" },
  critic: { id: "critic", label: "평론가 호평", bg: "#7C5CFF", fg: "#ffffff" },
  healing: { id: "healing", label: "퇴근 후 힐링", bg: "#2F9E70", fg: "#ffffff" },
};

export interface Movie {
  id: string;
  title: string;
  year: number;
  country: string;
  genre: string;
  runtimeMin: number;
  ageRating: string;
  /** 포스터 대체 그라디언트 (from → to) */
  poster: [string, string];
  mood: MoodId;
  /** 팝콘 배지로 노출할 카테고리 */
  categories: CategoryId[];
  matchPct: number;
  star: number;
  aiTrust: number;
  reasons: string[];
  verification: { label: string; passed: boolean }[];
}

export const MOVIES: Movie[] = [
  {
    id: "honest-candidate",
    title: "정직한 후보",
    year: 2020,
    country: "한국",
    genre: "코미디",
    runtimeMin: 104,
    ageRating: "12세 관람가",
    poster: ["#F6C177", "#D98A1E"],
    mood: "date",
    categories: ["couple", "family"],
    matchPct: 92,
    star: 4.2,
    aiTrust: 92,
    reasons: [
      "가볍게 즐길 수 있는 한국 코미디예요",
      "상영 시간이 2시간 이내예요",
      "잔인한 장면에 대한 부담이 낮아요",
      "편안한 데이트 상황에 적합해요",
    ],
    verification: [
      { label: "콘텐츠 안전성 검증", passed: true },
      { label: "러닝타임 검증", passed: true },
      { label: "취향 적합도 검증", passed: true },
    ],
  },
  {
    id: "luck-key",
    title: "육사오",
    year: 2022,
    country: "한국",
    genre: "코미디",
    runtimeMin: 113,
    ageRating: "12세 관람가",
    poster: ["#F7B733", "#E58A1E"],
    mood: "light",
    categories: ["friends", "family"],
    matchPct: 88,
    star: 4.0,
    aiTrust: 88,
    reasons: [
      "부담 없이 웃으며 볼 수 있어요",
      "친구와 함께 보기 좋은 코미디예요",
      "상영 시간이 2시간 남짓이에요",
    ],
    verification: [
      { label: "콘텐츠 안전성 검증", passed: true },
      { label: "러닝타임 검증", passed: true },
      { label: "취향 적합도 검증", passed: true },
    ],
  },
  {
    id: "exit",
    title: "엑시트",
    year: 2019,
    country: "한국",
    genre: "액션·코미디",
    runtimeMin: 103,
    ageRating: "12세 관람가",
    poster: ["#66A6FF", "#3B7DE0"],
    mood: "family",
    categories: ["family", "youth-romance"],
    matchPct: 86,
    star: 4.1,
    aiTrust: 86,
    reasons: [
      "온 가족이 함께 즐기기 좋아요",
      "긴장과 유머가 균형 잡혀 있어요",
      "잔인한 장면에 대한 부담이 낮아요",
    ],
    verification: [
      { label: "콘텐츠 안전성 검증", passed: true },
      { label: "러닝타임 검증", passed: true },
      { label: "취향 적합도 검증", passed: true },
    ],
  },
  {
    id: "perfect-others",
    title: "완벽한 타인",
    year: 2018,
    country: "한국",
    genre: "드라마·코미디",
    runtimeMin: 115,
    ageRating: "15세 관람가",
    poster: ["#B18CFF", "#7C5CFF"],
    mood: "date",
    categories: ["couple", "friends"],
    matchPct: 84,
    star: 4.3,
    aiTrust: 84,
    reasons: [
      "관계에 대한 통찰이 담긴 이야기예요",
      "연인·친구와 대화 나누기 좋아요",
      "평론가 평이 두루 좋아요",
    ],
    verification: [
      { label: "콘텐츠 안전성 검증", passed: true },
      { label: "러닝타임 검증", passed: true },
      { label: "취향 적합도 검증", passed: true },
    ],
  },
  {
    id: "exhuma",
    title: "파묘",
    year: 2024,
    country: "한국",
    genre: "오컬트·미스터리",
    runtimeMin: 134,
    ageRating: "15세 관람가",
    poster: ["#6B5B3E", "#2C2416"],
    mood: "critic",
    categories: ["occult", "friends"],
    matchPct: 81,
    star: 4.4,
    aiTrust: 81,
    reasons: [
      "몰입도 높은 오컬트 미스터리예요",
      "친구와 함께 보기 좋은 장르예요",
      "평론가 호평을 두루 받았어요",
    ],
    verification: [
      { label: "콘텐츠 안전성 검증", passed: true },
      { label: "러닝타임 검증", passed: true },
      { label: "취향 적합도 검증", passed: false },
    ],
  },
];

export const MOVIES_BY_ID: Record<string, Movie> = Object.fromEntries(
  MOVIES.map((m) => [m.id, m]),
);

export function getMovie(id: string): Movie | undefined {
  return MOVIES_BY_ID[id];
}

/** 홈 화면 빠른 추천 칩과 검색창에 입력할 맞춤형 프롬프트 */
export const QUICK_FILTERS = [
  {
    label: "퇴근 후 힐링",
    prompt: "퇴근 후 지친 마음을 편안하게 달래줄 수 있는 따뜻하고 잔잔한 힐링 영화를 추천해줘. 너무 무겁거나 자극적인 작품은 제외해줘.",
  },
  {
    label: "기분 전환",
    prompt: "답답한 기분을 시원하게 전환할 수 있는 유쾌하고 몰입감 좋은 영화를 추천해줘. 보고 나서 기분이 밝아지는 작품이면 좋겠어.",
  },
  {
    label: "가족과 함께",
    prompt: "온 가족이 함께 편안하게 볼 수 있는 영화를 추천해줘. 선정적이거나 잔인한 장면은 적고, 세대와 관계없이 즐길 수 있는 작품이면 좋겠어.",
  },
  {
    label: "연인과 데이트",
    prompt: "연인과 데이트하며 함께 보기 좋은 영화를 추천해줘. 로맨스나 코미디처럼 분위기가 좋고, 영화를 본 뒤 이야기를 나누기 좋은 작품이면 좋겠어.",
  },
  {
    label: "영화 다시보기",
    prompt: "한 번 봤어도 새로운 디테일을 발견하며 다시 즐길 수 있는 명작 영화를 추천해줘. 완성도가 높고 여러 번 볼수록 재미있는 작품이면 좋겠어.",
  },
] as const;
