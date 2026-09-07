import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getWasOrigin, REFRESH_COOKIE } from "@/lib/auth/server";
import { clearAuthCookies, errorMessage, extractAccessToken, extractRefreshToken, readUpstream, setAuthCookies } from "@/lib/auth/route-utils";

export async function POST(request: Request) {
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const upstream = await fetch(`${getWasOrigin()}/auth/refresh`, { method: "POST", headers: { Cookie: `refresh_token=${refreshToken}` }, cache: "no-store" });
    const data = await readUpstream(upstream);
    if (!upstream.ok) {
      const response = NextResponse.json({ error: errorMessage(data, "세션이 만료되었습니다.") }, { status: 401 });
      clearAuthCookies(request, response);
      return response;
    }
    const accessToken = extractAccessToken(data);
    if (!accessToken) return NextResponse.json({ error: "인증 서버 응답에서 액세스 토큰을 찾지 못했습니다." }, { status: 502 });
    const response = NextResponse.json({ ok: true });
    setAuthCookies(request, response, accessToken, extractRefreshToken(data, upstream) ?? refreshToken);
    return response;
  } catch {
    return NextResponse.json({ error: "인증 서버에 연결할 수 없습니다." }, { status: 502 });
  }
}
