import { NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/server";

const ACCESS_COOKIE_MAX_AGE = 15 * 60;
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

function cookieOptions() {
  return {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: false,
  path: "/",
  };
}

export async function readUpstream(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : { value };
  } catch {
    return { detail: text };
  }
}

function nestedValue(data: Record<string, unknown>, snake: string, camel: string) {
  const direct = data[snake] ?? data[camel];
  if (typeof direct === "string") return direct;
  const nested = data.data;
  if (nested && typeof nested === "object") {
    const value = (nested as Record<string, unknown>)[snake] ?? (nested as Record<string, unknown>)[camel];
    if (typeof value === "string") return value;
  }
  return null;
}

export function extractAccessToken(data: Record<string, unknown>) {
  return nestedValue(data, "access_token", "accessToken") ?? nestedValue(data, "token", "token");
}

export function extractRefreshToken(data: Record<string, unknown>, response: Response) {
  const jsonToken = nestedValue(data, "refresh_token", "refreshToken");
  if (jsonToken) return jsonToken;
  return response.headers.get("set-cookie")?.match(/(?:^|,\s*)refresh_token=([^;]+)/i)?.[1] ?? null;
}

export function setAuthCookies(request: Request, response: NextResponse, accessToken: string, refreshToken?: string | null) {
  const options = cookieOptions();
  response.cookies.set(ACCESS_COOKIE, accessToken, { ...options, maxAge: ACCESS_COOKIE_MAX_AGE });
  if (refreshToken) response.cookies.set(REFRESH_COOKIE, refreshToken, { ...options, maxAge: REFRESH_COOKIE_MAX_AGE });
}

export function clearAuthCookies(request: Request, response: NextResponse) {
  const options = cookieOptions();
  response.cookies.set(ACCESS_COOKIE, "", { ...options, maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { ...options, maxAge: 0 });
}

export function errorMessage(data: Record<string, unknown>, fallback: string) {
  const detail = data.detail ?? data.message ?? data.error;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => item && typeof item === "object" && "msg" in item ? String(item.msg) : String(item)).join(" ");
  return fallback;
}
