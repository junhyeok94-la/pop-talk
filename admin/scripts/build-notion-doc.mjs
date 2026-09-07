/**
 * openapi.yaml에서 Notion에 붙여넣을 마크다운을 만든다.
 *
 *   npm run docs:notion   →  docs/notion-api.md
 *
 * 왜 생성하는가 —
 *   Notion에 손으로 옮기면 명세가 바뀔 때마다 어긋난다. 어긋난 문서는 없는 것보다 나쁘다.
 *   명세를 고치면 이 명령을 다시 돌리고 통째로 다시 붙여넣는다.
 *
 * Notion은 마크다운 표·제목·코드블록·인용을 그대로 받아들인다.
 * 토글이나 콜아웃은 표준 마크다운에 없어 쓰지 않는다.
 */
import { readFile, writeFile } from "node:fs/promises";
import YAML from "yaml";

import { resolveSpecPath } from "./spec-path.mjs";

const SPEC = resolveSpecPath();
const OUT = "docs/notion-api.md";
const METHODS = ["get", "post", "put", "patch", "delete"];

const spec = YAML.parse(await readFile(SPEC, "utf8"));

/** 로컬 $ref를 따라가 실제 스키마를 얻는다. */
const deref = (node, depth = 0) => {
  if (!node || typeof node !== "object" || depth > 20) return node;
  if (typeof node.$ref === "string") {
    let t = spec;
    for (const k of node.$ref.replace(/^#\//, "").split("/")) t = t?.[k];
    return deref(t, depth + 1);
  }
  return node;
};

/** $ref면 스키마 이름을, 아니면 형태를 짧게 적는다. */
const schemaName = (s) => {
  if (!s) return "—";
  if (typeof s.$ref === "string") return `\`${s.$ref.split("/").pop()}\``;
  if (s.allOf) {
    const named = s.allOf.filter((b) => b.$ref).map((b) => `\`${b.$ref.split("/").pop()}\``);
    return named.length ? `${named.join(" + ")} + 목록` : "객체";
  }
  if (s.type === "array") return `${schemaName(s.items)} 배열`;
  return s.type ? `\`${s.type}\`` : "객체";
};

/** 표 셀 안의 `|`는 열 구분자로 읽혀 표를 무너뜨린다. 줄바꿈도 마찬가지다. */
const cell = (t) => String(t ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
const firstLine = (t) => cell((t ?? "").split("\n").find((l) => l.trim()) ?? "");

const ops = [];
for (const [path, item] of Object.entries(spec.paths ?? {})) {
  for (const m of METHODS) {
    const op = item[m];
    if (!op) continue;
    const open = Array.isArray(op.security) && op.security.length === 0;
    ops.push({
      path,
      method: m.toUpperCase(),
      tag: (op.tags ?? ["기타"])[0],
      // 태그 설명에 "범위 아님"이 적혀 있으면 이번 구현 대상이 아니다.
      // 표시가 없으면 읽는 사람이 만들 대상으로 오해한다.
      outOfScope: false,
      summary: op.summary ?? "",
      desc: firstLine(op.description),
      open,
      params: (op.parameters ?? []).map(deref),
      req: deref(op.requestBody)?.content?.["application/json"]?.schema,
      res: Object.entries(op.responses ?? {})
        .filter(([c]) => c.startsWith("2"))
        .map(([c, r]) => ({ code: c, schema: deref(r)?.content?.["application/json"]?.schema })),
    });
  }
}

const tagOrder = (spec.tags ?? []).map((t) => t.name);
const tagDesc = Object.fromEntries((spec.tags ?? []).map((t) => [t.name, t.description ?? ""]));
const byTag = new Map();
for (const o of ops) {
  if (!byTag.has(o.tag)) byTag.set(o.tag, []);
  byTag.get(o.tag).push(o);
}
// 태그 설명을 읽어 범위 밖 엔드포인트를 표시한다.
for (const o of ops) o.outOfScope = /범위 아님/.test(tagDesc[o.tag] ?? "");

const tags = [...byTag.keys()].sort(
  (a, b) => (tagOrder.indexOf(a) + 1 || 99) - (tagOrder.indexOf(b) + 1 || 99),
);

const L = [];
const p = (...lines) => L.push(...lines);

p(`# 팝콘톡 Admin API 명세`, ``);
p(`관리자 콘솔이 쓰는 API입니다. 화면 10개가 실제로 호출하는 것만 담았습니다.`, ``);
p(`| 항목 | 값 |`, `|---|---|`);
p(`| 버전 | ${spec.info?.version ?? "-"} |`);
p(`| 엔드포인트 | ${ops.length}개 |`);
p(`| 명세 읽기 | https://poptalkadmin.vercel.app/api-docs.html |`);
p(`| 직접 호출 | https://poptalkadmin.vercel.app/api-swagger.html |`);
p(`| 관리자 화면 | https://poptalkadmin.vercel.app |`);
p(`| 원본 | \`docs/openapi.yaml\` (GitHub) |`, ``);
// Notion에서 여러 줄 인용은 별개 블록으로 쪼개진다. <br>로 한 덩어리를 유지한다.
p(
  `> **이 페이지는 \`openapi.yaml\`에서 자동 생성했습니다.**<br>` +
    `여기서 직접 고치지 마세요 — 다음에 다시 생성하면 사라집니다.<br>` +
    `내용을 바꾸려면 \`openapi.yaml\`을 고치고 \`npm run docs:notion\`을 다시 돌린 뒤 통째로 갈아끼우세요.`,
  ``,
);

p(`## 서버`, ``, `| 주소 | 용도 |`, `|---|---|`);
for (const s of spec.servers ?? []) p(`| \`${s.url}\` | ${cell(s.description)} |`);
p(``);

p(`## 공통 규약`, ``, `| 항목 | 규칙 |`, `|---|---|`);
p(`| 목록 | \`page\`(1부터) · \`size\`(기본 10, 최대 100). 응답에 \`page\`·\`size\`·\`total\`·\`total_pages\` |`);
p(`| 날짜 | 날짜 \`YYYY-MM-DD\`, 시각 \`YYYY-MM-DD HH:mm:ss\` (KST) |`);
p(`| 기간 필터 | \`*_from\` · \`*_to\`, 양끝 포함. 한쪽만 주면 그쪽만 제한 |`);
p(`| 부분 수정 | \`PATCH\` + 바꿀 필드만. 빈 객체는 400 |`);
p(`| 오류 | RFC 9457 \`application/problem+json\` |`);
// 로그인을 이번에 만들지 않기로 해서, 토큰 전제를 사실대로 적는다.
// 여기만 옛 문장으로 남으면 아래 인증 절과 어긋나 읽는 사람이 헷갈린다.
p(
  `| 인증 | \`Authorization: Bearer <JWT>\` 전제입니다. **다만 관리자 로그인은 이번 범위가 아니라 ` +
    `토큰 발급 경로가 없습니다.** 감사 정보(\`approved_by\`)를 무엇으로 채울지도 미정입니다 |`,
  ``,
);

p(`## 엔드포인트 한눈에 보기`, ``, `| 메서드 | 경로 | 설명 | 인증 |`, `|---|---|---|---|`);
for (const t of tags)
  for (const o of byTag.get(t))
    p(
      `| \`${o.method}\` | \`${o.path}\` | ${cell(o.summary)}` +
        `${o.outOfScope ? " ⚠️ **이번 개발 범위 아님**" : ""} | ${o.open ? "불필요" : "필요"} |`,
    );
p(``);

p(`## 상세`, ``);
for (const t of tags) {
  p(`### ${t}${tagDesc[t] ? ` — ${tagDesc[t]}` : ""}`, ``);
  for (const o of byTag.get(t)) {
    p(`#### \`${o.method}\` \`${o.path}\``, ``);
    if (o.summary) p(`**${o.summary}**`, ``);
    if (o.desc) p(o.desc, ``);
    if (o.open) p(`> 인증이 필요 없습니다.`, ``);

    const q = o.params.filter((x) => x.in === "query");
    if (q.length) {
      p(`파라미터`, ``, `| 이름 | 필수 | 타입 | 설명 |`, `|---|---|---|---|`);
      for (const x of q) {
        const s = deref(x.schema) ?? {};
        const type = s.enum ? s.enum.join(" · ") : (Array.isArray(s.type) ? s.type.join(" · ") : s.type ?? "");
        p(`| \`${x.name}\` | ${x.required ? "✅" : "" } | ${cell(type)} | ${firstLine(x.description)} |`);
      }
      p(``);
    }
    if (o.req) p(`요청 본문 — ${schemaName(o.req)}`, ``);
    if (o.res.length) p(`응답 — ${o.res.map((r) => `\`${r.code}\` ${schemaName(r.schema)}`).join(" · ")}`, ``);
  }
}

p(`## 주요 데이터 모델`, ``);
const KEY = ["Movie", "MovieSummary", "Member", "Review", "Admin", "BatchRun", "Health", "LoginResult"];
for (const name of KEY) {
  const s = spec.components?.schemas?.[name];
  if (!s?.properties) continue;
  p(`### \`${name}\``, ``);
  if (s.description) p(firstLine(s.description), ``);
  p(`| 필드 | 타입 | 필수 | 설명 |`, `|---|---|---|---|`);
  const req = new Set(s.required ?? []);
  for (const [f, raw] of Object.entries(s.properties)) {
    const sub = deref(raw) ?? {};
    const type = sub.enum
      ? sub.enum.join(" · ")
      : Array.isArray(sub.type)
        ? sub.type.join(" · ")
        : (sub.type ?? schemaName(raw));
    p(`| \`${f}\` | ${cell(type)} | ${req.has(f) ? "✅" : ""} | ${firstLine(sub.description ?? raw.description)} |`);
  }
  p(``);
}

p(`## 백엔드 없이 먼저 시작하기`, ``);
p(`명세만으로 목 서버가 뜹니다. 프런트는 백엔드를 기다릴 필요가 없습니다.`, ``);
p("```bash", `npx @stoplight/prism-cli mock docs/openapi.yaml -p 4010 --cors`, "```", ``);
p(`Swagger UI에서 **Servers**를 \`http://localhost:4010\`으로 고르고 \`Authorize\`에`);
p(`아무 문자열이나 넣으면 문서에서 바로 호출됩니다.`, ``);

/*
 * 이 표는 명세(info.description)에서 읽는다.
 * 예전에는 여기 손으로 적어뒀는데, 명세만 고치면 이 문서가 조용히 옛말을 하게 된다.
 * 실제로 세 줄이 그렇게 어긋나 있었다.
 */
const unsettled = (() => {
  const lines = String(spec.info?.description ?? "").split("\n").map((l) => l.trim());
  const start = lines.findIndex((l) => /^#+\s*아직 확정이 아닌 것/.test(l));
  if (start < 0) return [];
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("#")) break; // 다음 절
    if (!line.startsWith("|")) continue;
    if (/^\|[\s|:-]+\|$/.test(line)) continue; // 구분선
    if (/^\|\s*항목\s*\|/.test(line)) continue; // 머리글
    rows.push(line);
  }
  return rows;
})();

if (!unsettled.length) {
  throw new Error("명세의 '아직 확정이 아닌 것' 표를 찾지 못했습니다. info.description을 확인하세요.");
}

p(`## 아직 정해지지 않은 것`, ``, `| 항목 | 상태 |`, `|---|---|`);
p(`| 인증 방식 | 액세스 15분 + 리프레시 14일 회전은 **제안**입니다. SSO 여부·만료 정책은 팀 결정 |`);
for (const row of unsettled) p(row);
p(`| backend 포트 | 아키텍처 문서 9000 · 실제 ACG 8000. 명세는 문서 기준 |`, ``);
p(`회원 도메인은 \`docs/user-domain-draft.sql\`의 열린 질문 8개가 정해지면 응답 필드가 바뀝니다.`);
p(`인프라 관련 사항은 \`docs/infra-findings.md\`를 참고하세요.`, ``);

/**
 * Notion API로 페이지를 만들 때는 파이프 표가 표로 인식되지 않는다.
 * Notion-flavored Markdown의 <table> 형식으로 바꾼다.
 * (UI에 직접 붙여넣을 때는 파이프 표가 알아서 변환되므로 두 벌을 만든다.)
 */
function toNotionFlavored(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const isRow = (l) => (l ?? "").trimStart().startsWith("|");
    // 표는 "머리행 + --- 구분행 + 본문"으로만 인정한다
    if (!isRow(lines[i]) || !/^\s*\|[\s|:-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      out.push(lines[i]);
      continue;
    }
    const rows = [];
    const cells = (l) =>
      l.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
    rows.push(cells(lines[i]));
    i += 2;
    while (i < lines.length && isRow(lines[i])) rows.push(cells(lines[i++]));
    i--;

    out.push('<table fit-page-width="true" header-row="true">');
    for (const r of rows) {
      out.push("\t<tr>");
      // 셀 안에서는 <, >, | 가 구조로 읽힐 수 있어 피한다.
      for (const c of r) out.push(`\t\t<td>${c.replace(/</g, "＜").replace(/>/g, "＞").replace(/\|/g, "·")}</td>`);
      out.push("\t</tr>");
    }
    out.push("</table>");
  }
  return out.join("\n");
}

await writeFile(OUT, L.join("\n"));
const nfm = toNotionFlavored(L);
await writeFile(OUT.replace(/\.md$/, ".nfm.md"), nfm);

const tables = (nfm.match(/<table /g) ?? []).length;
console.log(
  `엔드포인트 ${ops.length}개 · 표 ${tables}개\n` +
    `  ${OUT}          붙여넣기용 (Notion UI)\n` +
    `  ${OUT.replace(/\.md$/, ".nfm.md")}      API용 (Notion-flavored)`,
);
