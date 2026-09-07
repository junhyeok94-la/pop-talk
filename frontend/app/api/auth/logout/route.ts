import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getWasOrigin, REFRESH_COOKIE } from "@/lib/auth/server";
import { clearAuthCookies } from "@/lib/auth/route-utils";

export async function POST(request: Request) {
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  try {
    await fetch(`${getWasOrigin()}/auth/logout`, { method: "POST", headers: refreshToken ? { Cookie: `refresh_token=${refreshToken}` } : {}, cache: "no-store" });
  } catch {
    // 원격 로그아웃 실패 여부와 관계없이 현재 브라우저 세션은 종료한다.
  }
  const response = NextResponse.json({ ok: true });
  clearAuthCookies(request, response);
  return response;
}
