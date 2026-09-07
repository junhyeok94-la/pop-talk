import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import type { AuthUser } from "@/lib/auth/types";

export const ACCESS_COOKIE = "pop_talk_access_token";
export const REFRESH_COOKIE = "pop_talk_refresh_token";

type JwtPayload = Record<string, unknown> & { exp?: number };

function decodeJwt(token: string): JwtPayload | null {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return null;
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as JwtPayload;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function userFromAccessToken(token: string): AuthUser | null {
  const payload = decodeJwt(token);
  if (!token) return null;

  // 인증 여부는 백엔드가 Bearer 토큰으로 최종 검증한다. 액세스 토큰이
  // opaque 형식이거나 JWT claim 구성이 달라도 프론트 세션은 유지한다.
  if (!payload) {
    return { id: null, email: null, nickname: null, role: null };
  }

  const expiration = typeof payload.exp === "number"
    ? payload.exp > 10_000_000_000 ? payload.exp : payload.exp * 1000
    : null;
  if (expiration && expiration <= Date.now()) return null;
  return {
    id: asString(payload.sub) ?? asString(payload.user_id) ?? asString(payload.member_id),
    email: asString(payload.email),
    nickname: asString(payload.nickname) ?? asString(payload.name),
    role: asString(payload.role),
  };
}

export const getAuthSession = cache(async () => {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const user = userFromAccessToken(token);
  return user ? { token, user } : null;
});

export function getWasOrigin() {
  return (
    process.env.WAS_API_ORIGIN ??
    "http://popcorn-private-alb-144239326-fdd5172f3bd6.kr.lb.naverncp.com:3200"
  ).replace(/\/$/, "");
}

export type MyReview = {
  id: string;
  movie_id: number;
  rating: number;
  content: string;
  contains_spoiler: boolean;
  created_at?: string;
  updated_at?: string;
};

/** 로그인 사용자의 특정 영화 리뷰를 /me/reviews 에서 찾아 반환 (없으면 null) */
export async function getMyReviewForMovie(movieId: number): Promise<MyReview | null> {
  const session = await getAuthSession();
  if (!session) return null;
  try {
    const res = await fetch(`${getWasOrigin()}/me/reviews`, {
      headers: { Authorization: `Bearer ${session.token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data: unknown = await res.json().catch(() => null);
    const items =
      data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).items)
        ? ((data as Record<string, unknown>).items as Array<Record<string, unknown>>)
        : [];
    const found = items.find((r) => Number(r.movie_id) === Number(movieId));
    if (!found) return null;
    return {
      id: String(found.id),
      movie_id: Number(found.movie_id),
      rating: Number(found.rating),
      content: typeof found.content === "string" ? found.content : "",
      contains_spoiler: Boolean(found.contains_spoiler),
      created_at: typeof found.created_at === "string" ? found.created_at : undefined,
      updated_at: typeof found.updated_at === "string" ? found.updated_at : undefined,
    };
  } catch {
    return null;
  }
}

export type DisplayChip = { label: string; value: string };

/**
 * display-categories 응답 → 칩 배열.
 * label = short_label(없으면 name) · value = name(없으면 short_label).
 * is_active === false 는 제외하고 sort_order 로 정렬한다.
 */
type ChipWithCodes = DisplayChip & { codes: string[] };

function catalogOrigin() {
  return (
    process.env.CATALOG_API_ORIGIN ??
    process.env.WAS_API_ORIGIN ??
    getWasOrigin()
  ).replace(/\/$/, "");
}

function extractItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const arr = o.items ?? o.data ?? o.categories;
    if (Array.isArray(arr)) return arr;
  }
  return [];
}

function toDisplayChips(value: unknown): ChipWithCodes[] {
  const source = extractItems(value);

  const chips: Array<ChipWithCodes & { order: number }> = [];
  for (const item of source) {
    if (typeof item === "string") {
      chips.push({ label: item, value: item, order: 0, codes: [] });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (o.is_active === false) continue;
    const short = typeof o.short_label === "string" ? o.short_label : "";
    const name = typeof o.name === "string" ? o.name : "";
    const label = short || name || (typeof o.label === "string" ? o.label : "");
    if (!label) continue;
    const codes = Array.isArray(o.category_codes)
      ? o.category_codes.filter((c): c is string => typeof c === "string")
      : [];
    chips.push({
      label,
      value: name || short || label,
      order: typeof o.sort_order === "number" ? o.sort_order : 0,
      codes,
    });
  }
  chips.sort((a, b) => a.order - b.order);
  return chips.map(({ label, value, codes }) => ({ label, value, codes }));
}

/** /catalog/movie-categories → Map<id(string), code> */
async function getCategoryIdToCode(token: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetch(`${catalogOrigin()}/catalog/movie-categories`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return map;
    for (const it of extractItems(await res.json().catch(() => null))) {
      if (it && typeof it === "object") {
        const o = it as Record<string, unknown>;
        if (
          (typeof o.id === "number" || typeof o.id === "string") &&
          typeof o.code === "string"
        ) {
          map.set(String(o.id), o.code);
        }
      }
    }
  } catch {
    /* 매핑 실패 시 빈 맵 */
  }
  return map;
}

function readMovieCategoryIds(data: unknown): Array<number | string> {
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const candidates = [
    o.movie_category_ids,
    (o.data as Record<string, unknown> | undefined)?.movie_category_ids,
    (o.preferences as Record<string, unknown> | undefined)?.movie_category_ids,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c.filter(
        (v): v is number | string => typeof v === "number" || typeof v === "string",
      );
    }
  }
  return [];
}

/**
 * 사용자 선호 카테고리 코드 집합.
 * /me/preferences.movie_category_ids(숫자 id)를 movie-categories 로 code 변환.
 * null = 조회 실패(필터 미적용), 빈 Set = 선호 없음(필터 미적용).
 */
async function getPreferredCategoryCodes(token: string): Promise<Set<string> | null> {
  let ids: Array<number | string> = [];
  try {
    const res = await fetch(`${getWasOrigin()}/me/preferences`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    ids = readMovieCategoryIds(await res.json().catch(() => null));
  } catch {
    return null;
  }
  if (ids.length === 0) return new Set();
  const idToCode = await getCategoryIdToCode(token);
  const codes = new Set<string>();
  for (const v of ids) {
    const mapped = idToCode.get(String(v));
    if (mapped) codes.add(mapped);
    else if (typeof v === "string") codes.add(v); // 이미 code 형태일 수도
  }
  return codes;
}

/**
 * 로그인 시 노출할 카테고리 칩.
 * GET /catalog/display-categories 응답을 칩으로 정규화하고,
 * 사용자 선호(/me/preferences.movie_category_ids)와 매칭되는(category_codes 교집합) 칩만 남긴다.
 * 선호 없음/조회 실패 시 전체 칩, 매칭 0개면 null → 호출 측에서 기본 칩으로 폴백.
 */
export async function getDisplayCategories(): Promise<DisplayChip[] | null> {
  const session = await getAuthSession();
  if (!session) return null;
  try {
    const [dcRes, prefCodes] = await Promise.all([
      fetch(`${catalogOrigin()}/catalog/display-categories`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${session.token}` },
        cache: "no-store",
      }),
      getPreferredCategoryCodes(session.token),
    ]);
    if (!dcRes.ok) return null;
    const chipsWithCodes = toDisplayChips(await dcRes.json().catch(() => null));

    // 선호가 있으면 교집합 필터, 없으면(빈 Set/실패) 전체 노출
    const chips =
      prefCodes && prefCodes.size > 0
        ? chipsWithCodes.filter((c) => c.codes.some((code) => prefCodes.has(code)))
        : chipsWithCodes;

    const result = chips.map(({ label, value }) => ({ label, value }));
    return result.length > 0 ? result : null;
  } catch {
    return null;
  }
}
