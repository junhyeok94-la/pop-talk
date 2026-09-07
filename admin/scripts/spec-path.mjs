/**
 * 명세 파일이 어디 있는지 한 곳에서 정한다.
 *
 * admin은 지금 단독 저장소에 있지만 팀 모노레포의 apps/admin으로 옮겨간다.
 * 옮기고 나면 명세의 원본은 apps/api/docs/openapi.yaml이다 — API 옆에 있어야
 * 하고 원본이 한 곳이어야 어긋나지 않는다.
 *
 * 두 위치를 다 보게 해두면 옮기는 시점에 스크립트를 하나도 고치지 않아도 된다.
 * 찾는 순서 —
 *   1. SPEC_PATH 환경변수 (직접 지정할 때)
 *   2. ../api/docs/openapi.yaml (모노레포에 들어간 뒤)
 *   3. docs/openapi.yaml (지금)
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CANDIDATES = [
  process.env.SPEC_PATH,
  path.join(appRoot, "../api/docs/openapi.yaml"),
  path.join(appRoot, "docs/openapi.yaml"),
].filter(Boolean);

export function resolveSpecPath() {
  const found = CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      `명세를 찾지 못했습니다. 다음 위치를 봤습니다:\n  ${CANDIDATES.join("\n  ")}\n` +
        `SPEC_PATH 환경변수로 직접 지정할 수 있습니다.`,
    );
  }
  return found;
}

/**
 * git이 알아듣는 경로. `git show origin/main:<경로>`에는 절대경로를 못 넣는다.
 * 저장소 루트 기준 상대경로여야 한다.
 */
export function repoRelativeSpecPath(p = resolveSpecPath()) {
  const root = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  return path.relative(root, p);
}
