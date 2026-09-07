import type { SVGProps } from "react";

/**
 * POPCORN Badge Icon System
 * ------------------------------------------------------------------
 * 카테고리(관람 상황·장르)별 고유 색상을 갖는 아이콘 세트.
 * 16×16 벡터 원본을 currentColor 로 그려 8 / 12 / 16px 어디서든 또렷하게 대응한다.
 * 출처: Notion "UI 요소/와이어프레임" · popcorn-badge.html
 */

export type CategoryId =
  | "family"
  | "couple"
  | "friends"
  | "solo"
  | "crime"
  | "history"
  | "occult"
  | "social"
  | "sports"
  | "youth-romance"
  | "family-growth";

export interface CategoryMeta {
  id: CategoryId;
  /** 한글 라벨 */
  label: string;
  /** SVG 파일명 (디자인 시스템 기준) */
  file: string;
  /** 카테고리 고유 색상 */
  color: string;
  Icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
}

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps): IconProps => ({
  viewBox: "0 0 16 16",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  ...props,
});

/* -- 아이콘 (모두 currentColor 로 채색) -------------------------------- */

const FamilyIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="5" cy="4.5" r="2" fill="currentColor" />
    <circle cx="11" cy="4.5" r="2" fill="currentColor" />
    <path d="M1.5 13c0-2.2 1.6-3.5 3.5-3.5S8.5 10.8 8.5 13v.5h-7V13Z" fill="currentColor" />
    <path d="M7.5 13c0-2.2 1.6-3.5 3.5-3.5s3.5 1.3 3.5 3.5v.5h-7V13Z" fill="currentColor" />
  </svg>
);

const CoupleIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path
      d="M8 13.5 2.6 8.4a3.2 3.2 0 0 1 4.5-4.5L8 4.8l.9-.9a3.2 3.2 0 1 1 4.5 4.5L8 13.5Z"
      fill="currentColor"
    />
  </svg>
);

const FriendsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="4" cy="5" r="1.8" fill="currentColor" />
    <circle cx="12" cy="5" r="1.8" fill="currentColor" />
    <circle cx="8" cy="4" r="2" fill="currentColor" />
    <path
      d="M2 13c0-1.8 1-2.8 2.4-2.8.6 0 1 .1 1.4.4M14 13c0-1.8-1-2.8-2.4-2.8-.6 0-1 .1-1.4.4M4.5 13c0-2.2 1.5-3.5 3.5-3.5s3.5 1.3 3.5 3.5"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const SoloIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="8" cy="4.5" r="2.4" fill="currentColor" />
    <path d="M3 13.5c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5v.5H3v-.5Z" fill="currentColor" />
  </svg>
);

const CrimeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="6.8" cy="6.8" r="4" stroke="currentColor" strokeWidth="1.6" />
    <path d="m10 10 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const HistoryIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="1.5" y="5" width="13" height="6" rx="1.4" fill="currentColor" />
    <path d="M4.5 5v6M11.5 5v6" stroke="#000" strokeOpacity="0.25" strokeWidth="1" />
    <path d="M1.5 8h13" stroke="#000" strokeOpacity="0.2" strokeWidth="1" />
  </svg>
);

const OccultIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path
      d="M8 3.5C4 3.5 1.6 7 1.6 8s2.4 4.5 6.4 4.5S14.4 9 14.4 8 12 3.5 8 3.5Z"
      fill="currentColor"
      fillOpacity="0.28"
    />
    <circle cx="8" cy="8" r="2.4" fill="currentColor" />
  </svg>
);

const SocialIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2 6.5 11 3v10L2 9.5V6.5Z" fill="currentColor" />
    <path d="M11 5.5c1.6.3 2.5 1.2 2.5 2.5S12.6 10.2 11 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M4 9.5 5 14H3l-.8-3.6" fill="currentColor" />
  </svg>
);

const SportsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 2.5h8V6a4 4 0 0 1-8 0V2.5Z" fill="currentColor" />
    <path d="M4 3.5H2.2C2 5.4 2.9 6.6 4.6 6.9M12 3.5h1.8c.2 1.9-.7 3.1-2.4 3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M8 10v2M5.5 13.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const YouthRomanceIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path
      d="M8 13.5 2.6 8.4a3.2 3.2 0 0 1 4.5-4.5L8 4.8l.9-.9a3.2 3.2 0 1 1 4.5 4.5L8 13.5Z"
      fill="currentColor"
    />
  </svg>
);

const FamilyGrowthIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 14V6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M8 7C6 7 4.5 5.5 4.5 3.5 6.5 3.5 8 5 8 7Z" fill="currentColor" />
    <path d="M8 8.5c2 0 3.5-1.5 3.5-3.5C9.5 5 8 6.5 8 8.5Z" fill="currentColor" />
  </svg>
);

/* -- 카테고리 메타 ---------------------------------------------------- */

export const CATEGORIES: Record<CategoryId, CategoryMeta> = {
  family: { id: "family", label: "가족", file: "family.svg", color: "#F59E42", Icon: FamilyIcon },
  couple: { id: "couple", label: "연인", file: "couple.svg", color: "#EC6B8F", Icon: CoupleIcon },
  friends: { id: "friends", label: "친구", file: "friends.svg", color: "#34C7B5", Icon: FriendsIcon },
  solo: { id: "solo", label: "혼자", file: "solo.svg", color: "#5B8DEF", Icon: SoloIcon },
  crime: { id: "crime", label: "수사범죄", file: "crime-investigation.svg", color: "#3B9EFF", Icon: CrimeIcon },
  history: { id: "history", label: "역사시대극", file: "history-period.svg", color: "#C99A46", Icon: HistoryIcon },
  occult: { id: "occult", label: "오컬트·미스터리·공포", file: "occult-mystery-horror.svg", color: "#7C5CFF", Icon: OccultIcon },
  social: { id: "social", label: "사회고발", file: "social-critique.svg", color: "#F0574E", Icon: SocialIcon },
  sports: { id: "sports", label: "스포츠실화", file: "sports-true-story.svg", color: "#E3B23C", Icon: SportsIcon },
  "youth-romance": { id: "youth-romance", label: "청춘로맨스", file: "youth-romance.svg", color: "#F2789F", Icon: YouthRomanceIcon },
  "family-growth": { id: "family-growth", label: "가족성장", file: "family-growth.svg", color: "#6FBF73", Icon: FamilyGrowthIcon },
};

export const CATEGORY_LIST: CategoryMeta[] = Object.values(CATEGORIES);
