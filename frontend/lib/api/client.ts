import type { HealthStatus, Problem } from "@/lib/api/types";

/**
 * Pop Talk API fetch 클라이언트.
 *
 * - 브라우저: NEXT_PUBLIC_API_BASE_URL(기본 "/be") → Next 리라이트 프록시 경유.
 * - 서버(RSC/route handler): API_ORIGIN 으로 백엔드 직접 호출(CORS 무관).
 * 두 경우 모두 최종 경로는 `<base>/api/v1<path>` 형태가 된다.
 */

const API_PREFIX = "/api/v1";

function apiBase(): string {
  // 서버 사이드: 상대경로 fetch 불가 → 절대 오리진으로 직접 호출
  if (typeof window === "undefined") {
    return (
      process.env.API_ORIGIN ??
      "http://popcorn-private-alb-144239326-fdd5172f3bd6.kr.lb.naverncp.com:3200"
    );
  }
  // 브라우저: 프록시 베이스(같은 오리진) 또는 CORS 허용 시 백엔드 오리진
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "/be";
}

/** API 오류를 표준화한 예외. problem+json 바디를 그대로 담는다. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem?: Problem;

  constructor(status: number, message: string, problem?: Problem) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

/**
 * 인증 토큰 공급자. 인증 연동 확정 전까지는 null.
 * Auth.js/서비스 토큰이 정해지면 이 함수만 교체하면 된다.
 */
let tokenProvider: () => string | null | Promise<string | null> = () => null;

export function setAuthTokenProvider(
  provider: () => string | null | Promise<string | null>,
) {
  tokenProvider = provider;
}

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** 쿼리스트링 (undefined/null 값은 제외) */
  query?: Record<string, QueryValue>;
  /** JSON 바디 (자동 직렬화) */
  body?: unknown;
  /** 인증 헤더 부착 여부 (기본 true, 토큰 없으면 생략) */
  auth?: boolean;
  signal?: AbortSignal;
  /** 추가 헤더 */
  headers?: Record<string, string>;
  /** API_PREFIX(/api/v1) 생략하고 base 바로 아래로 요청 (예: /health) */
  raw?: boolean;
  /** 기본 오리진 대신 특정 오리진으로 요청 (예: catalog 는 별도 백엔드) */
  baseUrl?: string;
}

function buildUrl(
  path: string,
  query?: Record<string, QueryValue>,
  raw?: boolean,
  baseUrl?: string,
) {
  const prefix = raw ? "" : API_PREFIX;
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return `${(baseUrl ?? apiBase()).replace(/\/$/, "")}${prefix}${path}${qs ? `?${qs}` : ""}`;
}

/** 핵심 요청 함수. 2xx면 파싱된 JSON(T), 아니면 ApiError throw. */
export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    method = "GET",
    query,
    body,
    auth = true,
    signal,
    headers = {},
    raw,
    baseUrl,
  } = options;

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };

  if (body !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = await tokenProvider();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query, raw, baseUrl), {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
      credentials: "include",
    });
  } catch (e) {
    // 네트워크·CORS·중단 등
    throw new ApiError(0, e instanceof Error ? e.message : "Network error");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("json");
  const payload = isJson ? await res.json().catch(() => undefined) : await res.text().catch(() => undefined);

  if (!res.ok) {
    const problem = isJson ? (payload as Problem) : undefined;
    const message = problem?.detail || problem?.title || `HTTP ${res.status}`;
    throw new ApiError(res.status, message, problem);
  }

  return payload as T;
}

/** 헬스체크 (백엔드 루트 /health) */
export function checkHealth(signal?: AbortSignal): Promise<HealthStatus> {
  return apiFetch<HealthStatus>("/health", { raw: true, auth: false, signal });
}
