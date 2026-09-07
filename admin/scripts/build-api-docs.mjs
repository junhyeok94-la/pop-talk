/**
 * OpenAPI 명세를 정적 HTML 두 장으로 만든다.
 *
 *   /api-docs.html     Redoc    — 읽기용. 스키마가 펼쳐져 있어 훑기 좋다
 *   /api-swagger.html  Swagger UI — 두드려보기용. Try it out으로 실제 호출한다
 *
 * 둘 다 CDN을 쓰지 않는다. redocly build-docs가 만드는 HTML은 번들과 웹폰트를
 * CDN에서 불러오는데, 그러면 CDN이 죽거나 사내망에서 막히면 문서가 통째로 안 열린다.
 * 로컬 번들과 명세를 인라인해 외부 요청을 0으로 만든다.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { resolveSpecPath } from "./spec-path.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = resolveSpecPath();

/*
 * 번들 위치를 직접 조립하면 안 된다. 모노레포에서 yarn이 node_modules를 저장소
 * 루트로 끌어올리기 때문에 apps/admin/node_modules에는 없을 수 있다.
 * createRequire.resolve가 Node의 실제 해석 규칙을 그대로 따라 어디에 있든 찾아준다.
 */
const require = createRequire(import.meta.url);
const REDOC = require.resolve("redoc/bundles/redoc.standalone.js");
const SWAGGER_JS = require.resolve("swagger-ui-dist/swagger-ui-bundle.js");
const SWAGGER_CSS = require.resolve("swagger-ui-dist/swagger-ui.css");

const [specText, redocJs, swaggerJs, swaggerCss] = await Promise.all([
  readFile(SPEC, "utf8"),
  readFile(REDOC, "utf8"),
  readFile(SWAGGER_JS, "utf8"),
  readFile(SWAGGER_CSS, "utf8"),
]);

const spec = YAML.parse(specText);
const version = spec.info?.version ?? "0.0.0";
const paths = Object.keys(spec.paths ?? {}).length;
const operations = Object.values(spec.paths ?? {}).reduce(
  (n, item) =>
    n + Object.keys(item).filter((k) => ["get", "post", "put", "patch", "delete"].includes(k)).length,
  0,
);

// </script>가 명세 문자열 안에 있으면 스크립트 태그가 일찍 닫힌다.
const specJson = JSON.stringify(spec).replace(/</g, "\\u003c");

/**
 * 두 문서가 같은 머리띠를 쓴다. 서로를 오갈 수 있어야 한 쌍으로 읽힌다.
 * Redoc과 Swagger UI 모두 라이트 테마 전용이라 배경을 흰색으로 고정한다.
 * 비워두면 브라우저 다크 모드가 비쳐 어두운 배경 위에 어두운 글씨가 된다.
 */
const chrome = `
  :root { color-scheme: light; }
  html, body { background: #fff; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif; }
  .bar {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 10px 20px; background: #1f2937; color: #f9fafb; font-size: 13px;
  }
  .bar strong { font-size: 14px; }
  .bar a { color: #fdba74; text-decoration: none; }
  .bar a:hover { text-decoration: underline; }
  .bar .here { color: #f9fafb; font-weight: 600; text-decoration: none; cursor: default; }
  .bar .sp { margin-left: auto; opacity: .7; }
`;

const bar = (active) => `<div class="bar">
  <strong>🍿 팝콘톡 Admin API</strong>
  <span>v${version} · 엔드포인트 ${operations}개 / 경로 ${paths}개</span>
  ${active === "redoc" ? '<span class="here">읽기</span>' : '<a href="/api-docs.html">읽기</a>'}
  ${active === "swagger" ? '<span class="here">두드려보기</span>' : '<a href="/api-swagger.html">두드려보기</a>'}
  <a href="/">← 관리자 콘솔</a>
  <span class="sp">이 문서는 배포 시점의 명세입니다</span>
</div>`;

const redocHtml = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>팝콘톡 Admin API</title>
<meta name="robots" content="noindex" />
<style>${chrome}</style>
</head>
<body>
${bar("redoc")}
<div id="redoc"></div>
<script>${redocJs}</script>
<script>
  Redoc.init(
    ${specJson},
    { hideDownloadButton: false, expandResponses: "200", theme: { colors: { primary: { main: "#e14d00" } } } },
    document.getElementById("redoc"),
  );
</script>
</body>
</html>
`;

const swaggerHtml = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>팝콘톡 Admin API — 두드려보기</title>
<meta name="robots" content="noindex" />
<style>${swaggerCss}</style>
<style>
${chrome}
  /* topbar(스펙 URL 입력창)는 StandalonePreset에만 있다. 여기선 애초에 안 그려진다. */
  .swagger-ui .info { margin: 24px 0; }
  .note {
    padding: 10px 20px; background: #fff7ed; border-bottom: 1px solid #fed7aa;
    font-size: 13px; line-height: 1.6; color: #7c2d12;
  }
  .note code {
    padding: 1px 5px; border-radius: 4px; background: #ffedd5;
    font-family: ui-monospace, monospace; font-size: 12px;
  }
</style>
</head>
<body>
${bar("swagger")}
<div class="note">
  <strong>Try it out</strong>을 쓰려면 호출할 서버가 있어야 합니다. 백엔드가 아직 없으니
  목 서버를 띄우고 위쪽 <em>Servers</em>에서 <code>http://localhost:4010</code>을 고르세요 —
  <code>npx @stoplight/prism-cli mock docs/openapi.yaml -p 4010</code>.
  <code>Authorize</code>에 아무 문자열이나 넣으면 인증을 통과합니다.
</div>
<div id="swagger"></div>
<script>${swaggerJs}</script>
<script>
  SwaggerUIBundle({
    spec: ${specJson},
    dom_id: "#swagger",
    deepLinking: true,
    docExpansion: "none",
    defaultModelsExpandDepth: 0,
    tryItOutEnabled: true,
    persistAuthorization: true,
    filter: true,
  });
</script>
</body>
</html>
`;

await mkdir(path.join(root, "public"), { recursive: true });
await Promise.all([
  writeFile(path.join(root, "public/api-docs.html"), redocHtml),
  writeFile(path.join(root, "public/api-swagger.html"), swaggerHtml),
]);

const mb = (s) => (s.length / 1024 / 1024).toFixed(1);
console.log(
  `경로 ${paths}개 · 엔드포인트 ${operations}개\n` +
    `  api-docs.html    ${mb(redocHtml)}MB (Redoc)\n` +
    `  api-swagger.html ${mb(swaggerHtml)}MB (Swagger UI)`,
);
