import type { NextConfig } from "next";

/**
 * 백엔드 오리진. 서버 사이드 프록시(리라이트) 대상이자,
 * 서버 컴포넌트에서 직접 호출할 때의 베이스로 쓴다.
 * 값은 .env(API_ORIGIN)로 덮어쓸 수 있다.
 */
const API_ORIGIN =
  process.env.API_ORIGIN ??
  "http://popcorn-private-alb-144239326-fdd5172f3bd6.kr.lb.naverncp.com:3200";

const nextConfig: NextConfig = {
  async rewrites() {
    // 브라우저는 같은 오리진 `/be/*` 로 호출 → Next 서버가 백엔드로 프록시.
    // CORS · 혼합 콘텐츠(HTTPS→HTTP) 문제를 함께 회피한다.
    return [
      {
        source: "/be/:path*",
        destination: `${API_ORIGIN}/:path*`,
      },
    ];
  },
};

export default nextConfig;
