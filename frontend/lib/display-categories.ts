export const DISPLAY_CATEGORIES = {
  ADAPTED: { id: 11, code: "ADAPTED", name: "원작이 있는 작품" },
  TRUE_STORY: { id: 12, code: "TRUE_STORY", name: "실화" },
  REVENGE: { id: 13, code: "REVENGE", name: "복수·범죄" },
  YOUTH: { id: 14, code: "YOUTH", name: "청춘" },
  PERIOD: { id: 15, code: "PERIOD", name: "시대극" },
  OCCULT: { id: 16, code: "OCCULT", name: "오컬트" },
  BLACKCOM: { id: 17, code: "BLACKCOM", name: "블랙코미디" },
} as const;

export const DISPLAY_CATEGORY_OPTIONS = Object.values(DISPLAY_CATEGORIES);

export type DisplayCategoryId = (typeof DISPLAY_CATEGORY_OPTIONS)[number]["id"];
