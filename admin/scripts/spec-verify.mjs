/**
 * 직접 만든 백엔드가 명세를 지키는지 검사한다.
 *
 *   npm run docs:verify                          기본 http://127.0.0.1:9000
 *   npm run docs:verify -- --upstream http://... 다른 주소
 *   npm run docs:verify -- --token "$JWT"        인증이 필요한 서버
 *   npm run docs:verify -- --all                 GET 외 메서드까지 (데이터를 바꾼다)
 *
 * 동작 —
 *   prism proxy를 백엔드 앞에 세우고 GET 엔드포인트를 하나씩 두드린다.
 *   prism이 응답을 명세와 대조해 어긋나면 sl-violations 헤더로 알린다.
 *   필드가 빠졌거나 · 타입이 다르거나 · enum에 없는 값이 오면 여기서 잡힌다.
 *
 * 기본 포트 9000은 아키텍처 문서를 따랐다 (popcorn-backend-acg inbound 9000,
 * 내부 로드밸런서 popcorn-lb-pri1의 타겟 HTTP 9000).
 *
 * 한계 — prism이 못 보는 것은 이 검사도 못 본다. 값의 의미(팝콘점수가 0~100인지),
 * 페이지네이션이 실제로 맞는지, 권한이 제대로 갈리는지는 별도 테스트가 필요하다.
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { resolveSpecPath } from "./spec-path.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const UPSTREAM = opt("upstream", "http://127.0.0.1:9000");
const PORT = Number(opt("proxy-port", 4030));
const TOKEN = opt("token", "verify");
const ALL = args.includes("--all");
const SPEC = resolveSpecPath();

const spec = YAML.parse(await readFile(SPEC, "utf8"));

/** 경로 변수는 1로 채운다. 없는 id면 404가 오는데, 그것도 명세에 있으면 통과다. */
const fill = (path) => path.replace(/\{[^}]+\}/g, "1");

const probes = [];
for (const [path, item] of Object.entries(spec.paths ?? {})) {
  for (const [method, op] of Object.entries(item)) {
    if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
    if (!ALL && method !== "get") continue;
    if (path.startsWith("/auth")) continue; // 로그인은 실제 자격증명이 필요하다
    probes.push({ method: method.toUpperCase(), path, url: fill(path), id: op.operationId });
  }
}

console.log(`\n명세 준수 검사`);
console.log(`  명세    ${SPEC}`);
console.log(`  백엔드  ${UPSTREAM}`);
console.log(`  검사    ${probes.length}개 엔드포인트${ALL ? " (쓰기 포함)" : " (읽기만)"}\n`);

// ── 백엔드가 살아 있는지 먼저 본다 ────────────────────────
try {
  await fetch(UPSTREAM, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(`백엔드에 닿지 못했습니다: ${UPSTREAM}`);
  console.error(`  서버를 먼저 띄우거나 --upstream 으로 주소를 지정하세요.\n`);
  process.exit(2);
}

// ── prism proxy를 띄운다 ────────────────────────────────
const prism = spawn(
  "npx",
  ["--yes", "@stoplight/prism-cli@5", "proxy", SPEC, UPSTREAM, "-p", String(PORT), "--errors", "-v", "error"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
const prismLog = [];
prism.stdout.on("data", (d) => prismLog.push(String(d)));
prism.stderr.on("data", (d) => prismLog.push(String(d)));

const ready = await (async () => {
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(1000) });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
})();

if (!ready) {
  prism.kill();
  console.error("prism proxy가 뜨지 않았습니다.\n" + prismLog.join(""));
  process.exit(2);
}

// ── 하나씩 두드린다 ─────────────────────────────────────
const violations = [];
const ok = [];
const others = [];

for (const p of probes) {
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${PORT}${p.url}`, {
      method: p.method,
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    violations.push({ ...p, why: `요청 실패: ${e.message}` });
    continue;
  }

  const text = await res.text();

  /*
   * prism은 명세 위반을 500 + `sl-violations` 헤더로 알린다.
   * 상태 코드로 가르면 백엔드가 스스로 낸 500과 구별되지 않으므로 헤더를 본다.
   * 백엔드 자신의 4xx·5xx는 구현 버그일 수는 있어도 명세 위반은 아니다.
   */
  const header = res.headers.get("sl-violations");
  if (header) {
    let list = [];
    try {
      list = JSON.parse(header);
    } catch {
      try {
        list = JSON.parse(text).validation ?? [];
      } catch {
        /* 파싱이 안 되면 원문을 그대로 보여준다 */
      }
    }
    const say = (v) => `${(v.location ?? []).join(".") || "?"} — ${v.message}`;
    const errors = list.filter((v) => v.severity === "Error").map(say);
    const warns = list.filter((v) => v.severity !== "Error").map(say);

    if (errors.length) {
      violations.push({ ...p, why: errors, count: errors.length });
    } else if (warns.length) {
      // 대개 "이 상태 코드는 명세에 없다" 류다. 구현이 틀린 건 아니라 실패로 세지 않는다.
      others.push({ ...p, status: res.status, warns });
    } else {
      violations.push({ ...p, why: [text.slice(0, 300)], count: 1 });
    }
  } else if (res.status >= 200 && res.status < 300) {
    ok.push({ ...p, status: res.status });
  } else {
    // 명세는 지켰지만 백엔드가 오류를 냈다. 검사 실패로 세지 않고 눈에만 띄게 한다.
    others.push({ ...p, status: res.status });
  }
}

prism.kill();

// ── 결과 ────────────────────────────────────────────────
for (const o of ok) console.log(`  ✅ ${o.method.padEnd(6)} ${o.path.padEnd(38)} ${o.status}`);
for (const o of others) console.log(`  ·  ${o.method.padEnd(6)} ${o.path.padEnd(38)} ${o.status}  ${o.warns ? `— ${o.warns[0]}` : "(백엔드 응답, 명세 위반 아님)"}`);
for (const v of violations) console.log(`  🚨 ${v.method.padEnd(6)} ${v.path.padEnd(38)} 위반 ${v.count}건`);

if (violations.length) {
  console.log(`\n🚨 명세와 다른 응답 ${violations.length}개 엔드포인트\n`);
  for (const v of violations) {
    console.log(`  ${v.method} ${v.path}   (${v.id})`);
    for (const line of v.why) console.log(`      ${line}`);
    console.log("");
  }
  console.log("명세를 고칠지 구현을 고칠지 정하세요. 둘 중 하나는 틀렸습니다.\n");
} else if (ok.length) {
  console.log(`\n2xx를 낸 ${ok.length}개 엔드포인트가 모두 명세와 일치합니다.\n`);
} else {
  console.log(`\n2xx를 낸 엔드포인트가 없습니다. 아직 구현 전이거나 경로가 다릅니다.\n`);
}

process.exit(violations.length ? 1 : 0);
