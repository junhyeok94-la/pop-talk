/**
 * 두 OpenAPI 명세를 비교해 클라이언트를 깨뜨리는 변경을 찾는다.
 *
 *   node scripts/spec-diff.mjs                          origin/main과 지금 파일을 비교
 *   node scripts/spec-diff.mjs <이전> <이후> [--markdown]  직접 지정 (파일 경로 또는 git 참조)
 *
 * 왜 직접 쓰는가 —
 *   - `@redocly/cli`에는 diff 명령이 없다 (lint·bundle·build-docs 뿐)
 *   - npm `openapi-diff`는 OpenAPI 3.0까지만 읽는다. 이 명세는 3.1이다
 *   - `oasdiff`는 3.1을 제대로 보지만 Go 바이너리라 npm 프로젝트에 끌어오기 무겁다
 *
 * 무엇을 잡는가 — "이미 배포된 클라이언트가 오늘 깨지는가"만 본다.
 * 설명 문구나 예시가 바뀐 것은 통과시킨다. 잡는 항목은 RULES에 전부 적었다.
 *
 * allOf는 펼쳐서 본다. 이 명세의 목록 응답이 전부
 * `allOf: [PageMeta, {items, summary}]` 꼴이라, 펼치지 않으면 응답 검사가 통째로 빈다.
 *
 * 무엇을 못 잡는가 (알고 남겨둔 한계) —
 *   - oneOf/anyOf는 어느 가지가 올지 몰라 필드를 모으되 필수 여부를 따지지 않는다
 *   - 숫자·문자 범위(minimum, maxLength)를 좁히는 변경
 *   - application/json 외의 본문
 *   - 외부 파일 $ref (이 명세는 단일 파일이라 해당 없음)
 * 이것들이 필요해지면 그때 oasdiff로 갈아타는 게 맞다.
 */
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import YAML from "yaml";
import { resolveSpecPath, repoRelativeSpecPath } from "./spec-path.mjs";

const RULES = {
  PATH_REMOVED: "엔드포인트 삭제",
  METHOD_REMOVED: "메서드 삭제",
  PARAM_REMOVED: "파라미터 삭제",
  PARAM_NOW_REQUIRED: "파라미터가 필수로 바뀜",
  PARAM_REQUIRED_ADDED: "필수 파라미터 추가",
  PARAM_TYPE_CHANGED: "파라미터 타입 변경",
  REQ_FIELD_NOW_REQUIRED: "요청 필드가 필수로 바뀜",
  REQ_REQUIRED_FIELD_ADDED: "필수 요청 필드 추가",
  REQ_ENUM_VALUE_REMOVED: "요청 enum 값 삭제",
  RES_FIELD_REMOVED: "응답 필드 삭제",
  RES_FIELD_NOW_OPTIONAL: "응답 필드가 선택으로 바뀜",
  RES_ENUM_VALUE_ADDED: "응답 enum 값 추가",
  FIELD_TYPE_CHANGED: "필드 타입 변경",
  STATUS_REMOVED: "성공 응답 코드 삭제",
  SECURITY_ADDED: "인증 요구 추가",
  SERVER_REMOVED: "서버 URL 삭제",
};

const METHODS = ["get", "post", "put", "patch", "delete"];

/** 로컬 $ref만 푼다. 순환 참조는 한 번 본 자리에서 멈춘다. */
function resolve(node, root, seen = new Set()) {
  if (node == null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((n) => resolve(n, root, seen));

  if (typeof node.$ref === "string") {
    if (seen.has(node.$ref)) return { $circular: node.$ref };
    const path = node.$ref.replace(/^#\//, "").split("/");
    let target = root;
    for (const key of path) target = target?.[key];
    return resolve(target, root, new Set([...seen, node.$ref]));
  }

  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = resolve(v, root, seen);
  return out;
}

const typeOf = (s) => {
  if (!s) return "?";
  const t = Array.isArray(s.type) ? [...s.type].sort().join("|") : (s.type ?? "?");
  return s.format ? `${t}(${s.format})` : t;
};

/**
 * allOf를 한 겹으로 합친다. 목록 응답이 전부
 * `allOf: [PageMeta, {items, summary}]` 꼴이라 이걸 펴지 않으면
 * 응답 검사가 통째로 비어버린다.
 */
function mergeAllOf(schema) {
  if (!schema?.allOf) return schema;
  const merged = { type: "object", properties: {}, required: [] };
  for (const branch of schema.allOf) {
    const b = mergeAllOf(branch);
    Object.assign(merged.properties, b?.properties ?? {});
    merged.required.push(...(b?.required ?? []));
  }
  // allOf 바깥에 직접 쓴 필드도 살린다
  Object.assign(merged.properties, schema.properties ?? {});
  merged.required.push(...(schema.required ?? []));
  return merged;
}

/**
 * 스키마를 {경로: 정보} 평면 맵으로 편다.
 * 중첩 객체와 배열 요소까지 따라가야 `items[].title_ko` 같은 삭제를 잡는다.
 */
function flatten(schema, prefix = "", out = {}, depth = 0) {
  if (!schema || typeof schema !== "object" || depth > 12) return out;

  if (schema.allOf) schema = mergeAllOf(schema);

  // oneOf/anyOf는 어느 가지가 올지 모른다. 필드는 모아두되 필수로 보지 않는다.
  const branches = schema.oneOf ?? schema.anyOf;
  if (branches) {
    for (const b of branches) flatten({ ...b, required: [] }, prefix, out, depth + 1);
    return out;
  }

  if (schema.type === "array" || schema.items) {
    return flatten(schema.items, `${prefix}[]`, out, depth + 1);
  }

  const required = new Set(schema.required ?? []);
  for (const [name, sub] of Object.entries(schema.properties ?? {})) {
    const key = prefix ? `${prefix}.${name}` : name;
    out[key] = {
      type: typeOf(sub),
      required: required.has(name),
      enum: sub.enum ? [...sub.enum].map(String).sort() : null,
    };
    flatten(sub, key, out, depth + 1);
  }
  return out;
}

const jsonSchema = (body) =>
  body?.content?.["application/json"]?.schema ?? null;

function compare(base, head) {
  const findings = [];
  const add = (rule, where, detail) =>
    findings.push({ rule, breaking: BREAKING.has(rule), where, detail });

  // ── 서버 ──────────────────────────────────────────────
  const headUrls = new Set((head.servers ?? []).map((s) => s.url));
  for (const s of base.servers ?? []) {
    if (!headUrls.has(s.url)) add("SERVER_REMOVED", "servers", s.url);
  }

  // ── 경로 · 메서드 ──────────────────────────────────────
  for (const [path, baseItem] of Object.entries(base.paths ?? {})) {
    const headItem = head.paths?.[path];
    if (!headItem) {
      add("PATH_REMOVED", path, "");
      continue;
    }

    for (const method of METHODS) {
      const b = baseItem[method];
      if (!b) continue;
      const h = headItem[method];
      const where = `${method.toUpperCase()} ${path}`;
      if (!h) {
        add("METHOD_REMOVED", where, "");
        continue;
      }

      // 인증 — 없던 곳에 생기면 기존 호출이 401을 맞는다
      const bOpen = Array.isArray(b.security) && b.security.length === 0;
      const hOpen = Array.isArray(h.security) && h.security.length === 0;
      if (bOpen && !hOpen) add("SECURITY_ADDED", where, "security: [] 가 사라짐");

      // 파라미터
      const key = (p) => `${p.in}:${p.name}`;
      const bParams = new Map((b.parameters ?? []).map((p) => [key(p), p]));
      const hParams = new Map((h.parameters ?? []).map((p) => [key(p), p]));

      for (const [k, bp] of bParams) {
        const hp = hParams.get(k);
        if (!hp) {
          add("PARAM_REMOVED", where, k);
          continue;
        }
        if (!bp.required && hp.required) add("PARAM_NOW_REQUIRED", where, k);
        const [bt, ht] = [typeOf(bp.schema), typeOf(hp.schema)];
        if (bt !== ht) add("PARAM_TYPE_CHANGED", where, `${k}: ${bt} → ${ht}`);
      }
      for (const [k, hp] of hParams) {
        if (!bParams.has(k) && hp.required) add("PARAM_REQUIRED_ADDED", where, k);
      }

      // 요청 본문 — 서버가 더 많이 요구하게 되면 깨진다
      const bReq = flatten(jsonSchema(b.requestBody));
      const hReq = flatten(jsonSchema(h.requestBody));
      for (const [f, hInfo] of Object.entries(hReq)) {
        const bInfo = bReq[f];
        if (!bInfo) {
          if (hInfo.required) add("REQ_REQUIRED_FIELD_ADDED", where, f);
          continue;
        }
        if (!bInfo.required && hInfo.required) add("REQ_FIELD_NOW_REQUIRED", where, f);
        if (bInfo.type !== hInfo.type)
          add("FIELD_TYPE_CHANGED", where, `요청 ${f}: ${bInfo.type} → ${hInfo.type}`);
        const gone = (bInfo.enum ?? []).filter((v) => !(hInfo.enum ?? []).includes(v));
        if (bInfo.enum && hInfo.enum && gone.length)
          add("REQ_ENUM_VALUE_REMOVED", where, `${f}: ${gone.join(", ")}`);
      }

      // 응답 — 클라이언트가 읽던 게 사라지면 깨진다
      for (const [code, bRes] of Object.entries(b.responses ?? {})) {
        if (!code.startsWith("2")) continue;
        const hRes = h.responses?.[code];
        if (!hRes) {
          add("STATUS_REMOVED", where, code);
          continue;
        }
        const bFields = flatten(jsonSchema(bRes));
        const hFields = flatten(jsonSchema(hRes));
        for (const [f, bInfo] of Object.entries(bFields)) {
          const hInfo = hFields[f];
          if (!hInfo) {
            add("RES_FIELD_REMOVED", where, `${code} ${f}`);
            continue;
          }
          if (bInfo.required && !hInfo.required)
            add("RES_FIELD_NOW_OPTIONAL", where, `${code} ${f}`);
          if (bInfo.type !== hInfo.type)
            add("FIELD_TYPE_CHANGED", where, `${code} ${f}: ${bInfo.type} → ${hInfo.type}`);
          const added = (hInfo.enum ?? []).filter((v) => !(bInfo.enum ?? []).includes(v));
          if (bInfo.enum && hInfo.enum && added.length)
            add("RES_ENUM_VALUE_ADDED", where, `${code} ${f}: ${added.join(", ")}`);
        }
      }
    }
  }

  // ── 추가된 것 (참고용, 깨뜨리지 않음) ────────────────────
  const added = [];
  for (const [path, headItem] of Object.entries(head.paths ?? {})) {
    const baseItem = base.paths?.[path];
    for (const method of METHODS) {
      if (headItem[method] && !baseItem?.[method]) added.push(`${method.toUpperCase()} ${path}`);
    }
  }

  return { findings, added };
}

/**
 * 응답 enum 값 추가는 엄밀히는 깨뜨리는 변경이다 — 클라이언트의 switch가
 * 모르는 값을 만난다. 다만 이 프로젝트는 상태값이 계속 늘어나는 단계라
 * 빌드를 막지 않고 경고만 낸다.
 */
const BREAKING = new Set([
  "PATH_REMOVED", "METHOD_REMOVED", "PARAM_REMOVED", "PARAM_NOW_REQUIRED",
  "PARAM_REQUIRED_ADDED", "PARAM_TYPE_CHANGED", "REQ_FIELD_NOW_REQUIRED",
  "REQ_REQUIRED_FIELD_ADDED", "REQ_ENUM_VALUE_REMOVED", "RES_FIELD_REMOVED",
  "RES_FIELD_NOW_OPTIONAL", "FIELD_TYPE_CHANGED", "STATUS_REMOVED", "SECURITY_ADDED",
]);

// ── 실행 ────────────────────────────────────────────────
const args = process.argv.slice(2);
const markdown = args.includes("--markdown");
const positional = args.filter((a) => !a.startsWith("--"));

/**
 * 인자를 생략하면 origin/main과 지금 파일을 비교한다.
 * 커밋하기 전에 `npm run docs:diff` 한 줄로 확인할 수 있어야 실제로 쓰인다.
 */
const SPEC = resolveSpecPath();
const basePath = positional[0] ?? `origin/main:${repoRelativeSpecPath(SPEC)}`;
const headPath = positional[1] ?? SPEC;

/** `<ref>:<경로>` 꼴이면 git에서 꺼내고, 아니면 파일로 읽는다. */
async function load(target) {
  if (target.includes(":") && !existsSync(target)) {
    try {
      return execFileSync("git", ["show", target], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    } catch {
      console.error(`git에서 꺼내지 못했습니다: ${target}`);
      console.error("  origin/main이 없으면 `git fetch origin main`을 먼저 실행하세요.");
      process.exit(2);
    }
  }
  return readFile(target, "utf8");
}

const [baseRaw, headRaw] = await Promise.all([
  load(basePath).then(YAML.parse),
  load(headPath).then(YAML.parse),
]);
const base = resolve(baseRaw, baseRaw);
const head = resolve(headRaw, headRaw);

const { findings, added } = compare(base, head);
const breaking = findings.filter((f) => f.breaking);
const warnings = findings.filter((f) => !f.breaking);

const group = (list) => {
  const m = new Map();
  for (const f of list) {
    const label = RULES[f.rule] ?? f.rule;
    if (!m.has(label)) m.set(label, []);
    m.get(label).push(f);
  }
  return m;
};

if (markdown) {
  const lines = ["## API 명세 변경"];
  if (!findings.length && !added.length) {
    lines.push("", "변경 없음.");
  } else {
    if (breaking.length) {
      lines.push("", `### 🚨 깨뜨리는 변경 ${breaking.length}건`, "",
        "이미 배포된 클라이언트가 오늘 깨집니다. 버전을 올리거나 되돌리세요.", "",
        "| 항목 | 위치 | 내용 |", "|---|---|---|");
      for (const [label, fs] of group(breaking))
        for (const f of fs) lines.push(`| ${label} | \`${f.where}\` | ${f.detail || "—"} |`);
    }
    if (warnings.length) {
      lines.push("", `### ⚠️ 확인 필요 ${warnings.length}건`, "", "| 항목 | 위치 | 내용 |", "|---|---|---|");
      for (const [label, fs] of group(warnings))
        for (const f of fs) lines.push(`| ${label} | \`${f.where}\` | ${f.detail || "—"} |`);
    }
    if (added.length) {
      lines.push("", `### ✅ 새 엔드포인트 ${added.length}개`, "",
        ...added.map((a) => `- \`${a}\``));
    }
    if (!breaking.length) lines.push("", "깨뜨리는 변경은 없습니다.");
  }
  console.log(lines.join("\n"));
} else {
  console.log(`\n명세 비교  ${basePath} → ${headPath}\n`);
  if (breaking.length) {
    console.log(`🚨 깨뜨리는 변경 ${breaking.length}건`);
    for (const [label, fs] of group(breaking))
      for (const f of fs) console.log(`   ${label.padEnd(20)} ${f.where}  ${f.detail}`);
    console.log("");
  }
  if (warnings.length) {
    console.log(`⚠️  확인 필요 ${warnings.length}건`);
    for (const [label, fs] of group(warnings))
      for (const f of fs) console.log(`   ${label.padEnd(20)} ${f.where}  ${f.detail}`);
    console.log("");
  }
  if (added.length) console.log(`✅ 새 엔드포인트 ${added.length}개\n   ${added.join("\n   ")}\n`);
  if (!findings.length && !added.length) console.log("변경 없음.\n");
  else if (!breaking.length) console.log("깨뜨리는 변경은 없습니다.\n");
}

process.exit(breaking.length ? 1 : 0);
