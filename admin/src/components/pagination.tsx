"use client";

import { ChipLabel, ChipRoot } from "@seed-design/react";

import { IconChevronLeft, IconChevronRight } from "@/lib/icons";
import ui from "@/styles/ui.module.css";

/**
 * 현재 페이지 주변만 버튼으로 그린다.
 * 실제 DB에는 영화가 6천 편 가까이 있어 전체 페이지를 다 그리면 버튼이 599개가 된다.
 * 목 데이터 6건으로는 드러나지 않던 문제다.
 */
function pageWindow(current: number, total: number, span = 2): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set<number>([1, total]);
  for (let p = current - span; p <= current + span; p += 1) {
    if (p > 1 && p < total) pages.add(p);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    // 번호가 건너뛰면 그 자리에 생략 표시를 넣는다.
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  unit = "건",
  onChange,
}: {
  page: number;
  totalPages: number;
  /** 필터를 통과한 전체 건수. 요약 문구에 쓴다. */
  total: number;
  pageSize: number;
  unit?: string;
  onChange: (next: number) => void;
}) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className={ui.pagination}>
      <span className={ui.caption}>
        {from}–{to} / {total.toLocaleString()}
        {unit}
      </span>
      <div className={ui.pageButtons}>
        <button
          type="button"
          className={ui.pageButton}
          disabled={page === 1}
          aria-label="이전 페이지"
          onClick={() => onChange(Math.max(1, page - 1))}
        >
          <IconChevronLeft size={14} />
        </button>

        {pageWindow(page, totalPages).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className={ui.caption} aria-hidden="true">
              …
            </span>
          ) : (
            <ChipRoot
              key={p}
              size="small"
              variant={p === page ? "solid" : "outlineWeak"}
              aria-current={p === page ? "page" : undefined}
              onClick={() => onChange(p)}
            >
              <ChipLabel>{p}</ChipLabel>
            </ChipRoot>
          ),
        )}

        <button
          type="button"
          className={ui.pageButton}
          disabled={page === totalPages}
          aria-label="다음 페이지"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
        >
          <IconChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
