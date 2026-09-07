import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/** 위로 올라가며 workspaces를 선언한 package.json을 찾는다. 없으면 앱 폴더. */
function findWorkspaceRoot(from: string): string {
  let dir = from;
  for (let i = 0; i < 5; i++) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
    const pkg = path.join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, "utf8")).workspaces) return dir;
      } catch {
        /* 읽을 수 없으면 계속 올라간다 */
      }
    }
  }
  return from;
}

const workspaceRoot = findWorkspaceRoot(path.resolve(import.meta.dirname));

const nextConfig: NextConfig = {
  /*
   * 개발 서버를 localhost가 아닌 주소로 열 때 필요하다.
   *
   * Next 16은 개발용 JS 청크를 localhost 외의 origin에 내주지 않는다. 막히면
   * HTML은 서버가 그려 보내니 화면은 멀쩡해 보이는데 자바스크립트가 하나도
   * 실행되지 않는다 — 버튼이 안 눌리고 상태 표시가 초기값에서 멈춘다.
   *
   * 같은 공유기 안의 다른 기기에서 보거나, LAN 주소로 열어 확인할 때를 위해
   * 사설 대역을 열어둔다. 개발 서버에만 적용되고 배포본과는 무관하다.
   */
  // CIDR은 못 쓴다(string[]이다). 와일드카드로 사설 대역을 덮는다.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*", "*.local"],

  /*
   * NCP 서버에 직접 올리려면 실행에 필요한 것만 추린 번들이 필요하다.
   * standalone은 .next/standalone에 node_modules까지 담아 통째로 옮길 수 있게 한다.
   *
   * 다만 Vercel에서는 켜면 안 된다. Vercel이 출력 형식을 자기 방식으로 만드는데
   * standalone과 겹쳐 .next/next-server.js.nft.json을 못 찾고 빌드가 죽는다.
   * NCP로 완전히 옮기면 이 분기는 지워도 된다.
   */
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  /*
   * 모노레포에서는 yarn이 node_modules를 저장소 루트로 끌어올린다.
   * 여기를 앱 폴더로 고정하면 next 패키지조차 못 찾는다.
   * 반대로 단독 저장소에서는 홈 디렉터리의 lock 파일을 루트로 오인하므로
   * 워크스페이스 루트가 있으면 그곳을, 없으면 앱 폴더를 쓴다.
   */
  turbopack: { root: workspaceRoot },
  // standalone 번들이 호이스팅된 의존성까지 담도록 같은 곳을 가리킨다.
  outputFileTracingRoot: workspaceRoot,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },

  /*
   * 브라우저가 api를 직접 부르지 않고 admin을 거치게 한다.
   *
   *   브라우저 → admin/api/health → (admin 서버가) → api/health
   *
   * 브라우저 입장에서는 같은 주소 하나만 부르므로 CORS가 생기지 않는다.
   * 직접 부르게 두면 화면을 여는 주소가 늘 때마다 api의 CORS_ORIGINS에
   * 그 주소를 추가하고 재시작해야 한다 — localhost·LAN·공인 LB 세 번 겪었다.
   *
   * 로그인이 붙으면 더 중요해진다. api가 리프레시 토큰을 httpOnly 쿠키로
   * 주는데, 다른 주소끼리 쿠키를 주고받으려면 SameSite=None; Secure가 필요하고
   * Secure는 HTTPS를 요구한다. 지금은 전부 평문 HTTP다. 같은 주소로 중계하면
   * 이 문제가 아예 없다.
   *
   * 구성도의 web → 내부 LB → WAS 구조와도 맞는다. api는 뒤에 숨는 자리다.
   *
   * 목적지는 admin 서버가 부르는 주소라 브라우저와 무관하다. 서버 안에서
   * 부르므로 localhost가 맞고, api가 다른 서버로 갈라지면 그때
   * API_PROXY_TARGET으로 지정한다. NEXT_PUBLIC_이 아닌 이유 — 이 값은
   * 브라우저에 나가지 않는다.
   */
  rewrites() {
    const target =
      process.env.API_PROXY_TARGET ??
      "http://popcorn-private-alb-144239326-fdd5172f3bd6.kr.lb.naverncp.com:3200";
    return [{ source: "/api/:path*", destination: `${target}/:path*` }];
  },
};

export default nextConfig;
