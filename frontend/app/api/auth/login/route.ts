import { NextResponse } from "next/server";
import { getWasOrigin, userFromAccessToken } from "@/lib/auth/server";
import { errorMessage, extractAccessToken, extractRefreshToken, readUpstream, setAuthCookies } from "@/lib/auth/route-utils";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "로그인 정보를 확인해주세요." }, { status: 400 });
  try {
    const upstream = await fetch(`${getWasOrigin()}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    const data = await readUpstream(upstream);
    if (!upstream.ok) return NextResponse.json({ error: errorMessage(data, "이메일 또는 비밀번호를 확인해주세요.") }, { status: upstream.status });
    const accessToken = extractAccessToken(data);
    if (!accessToken) return NextResponse.json({ error: "인증 서버 응답에서 액세스 토큰을 찾지 못했습니다." }, { status: 502 });
    const response = NextResponse.json({ user: userFromAccessToken(accessToken) });
    setAuthCookies(request, response, accessToken, extractRefreshToken(data, upstream));
    return response;
  } catch {
    return NextResponse.json({ error: "인증 서버에 연결할 수 없습니다." }, { status: 502 });
  }
}
