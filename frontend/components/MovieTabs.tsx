"use client";

import { useState } from "react";
import type { Movie } from "@/lib/movies";
import { CATEGORIES } from "@/lib/categories";
import { PopcornBadge } from "@/components/PopcornBadge";

type TabId = "reason" | "review" | "info" | "credits";

const TABS: { id: TabId; label: string }[] = [
  { id: "reason", label: "AI 추천 이유" },
  { id: "review", label: "리뷰" },
  { id: "info", label: "정보" },
  { id: "credits", label: "출연·제작" },
];

const SAMPLE_REVIEWS = [
  { author: "지민", rating: 5, body: "가볍게 보기 딱 좋았어요. 데이트로 강추!" },
  { author: "현우", rating: 4, body: "예상보다 웃음 포인트가 많았습니다." },
  { author: "수아", rating: 4, body: "부담 없이 즐길 수 있는 한국 코미디." },
];

const SAMPLE_CREDITS = ["감독", "주연", "조연", "조연", "출연", "출연"];

export function MovieTabs({ movie }: { movie: Movie }) {
  const [tab, setTab] = useState<TabId>("reason");

  return (
    <div>
      {/* 탭 바 */}
      <div
        role="tablist"
        className="flex gap-5 border-b border-zinc-200 dark:border-zinc-800"
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`relative -mb-px pb-2.5 text-[15px] font-bold transition-colors ${
                active
                  ? "text-amber-600"
                  : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              }`}
            >
              {t.label}
              {active && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-amber-600" />
              )}
            </button>
          );
        })}
      </div>

      <div className="pt-5">
        {tab === "reason" && <ReasonPanel movie={movie} />}
        {tab === "review" && <ReviewPanel />}
        {tab === "info" && <InfoPanel movie={movie} />}
        {tab === "credits" && <CreditsPanel />}
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      {title && (
        <h3 className="mb-3 text-base font-bold text-zinc-900 dark:text-zinc-50">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

function ReasonPanel({ movie }: { movie: Movie }) {
  return (
    <div className="flex flex-col gap-4">
      <Card title="추천 이유">
        <ul className="flex flex-col gap-2.5">
          {movie.reasons.map((r) => (
            <li key={r} className="flex gap-2 text-[15px] text-zinc-700 dark:text-zinc-300">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="POPCORN AI 검증">
        <ul className="flex flex-col">
          {movie.verification.map((v, i) => (
            <li
              key={v.label}
              className={`flex items-center justify-between py-3 text-[15px] text-zinc-700 dark:text-zinc-300 ${
                i > 0 ? "border-t border-zinc-100 dark:border-zinc-800" : ""
              }`}
            >
              <span>{v.label}</span>
              <span
                className={`inline-flex items-center gap-1 font-bold ${
                  v.passed ? "text-emerald-600" : "text-zinc-400"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    d="M3.5 8.5 6.5 11.5 12.5 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {v.passed ? "통과" : "검토중"}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function ReviewPanel() {
  return (
    <div className="flex flex-col gap-3">
      {SAMPLE_REVIEWS.map((r) => (
        <Card key={r.author}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-bold text-zinc-900 dark:text-zinc-50">{r.author}</span>
            <span className="text-sm font-semibold text-amber-500">
              {"★".repeat(r.rating)}
              <span className="text-zinc-300 dark:text-zinc-700">
                {"★".repeat(5 - r.rating)}
              </span>
            </span>
          </div>
          <p className="text-[15px] text-zinc-700 dark:text-zinc-300">{r.body}</p>
        </Card>
      ))}
    </div>
  );
}

function InfoPanel({ movie }: { movie: Movie }) {
  const rows = [
    ["개봉", `${movie.year}년`],
    ["국가", movie.country],
    ["장르", movie.genre],
    ["러닝타임", `${movie.runtimeMin}분`],
    ["관람등급", movie.ageRating],
  ];
  return (
    <Card>
      <dl className="flex flex-col">
        {rows.map(([k, v], i) => (
          <div
            key={k}
            className={`flex justify-between py-3 text-[15px] ${
              i > 0 ? "border-t border-zinc-100 dark:border-zinc-800" : ""
            }`}
          >
            <dt className="text-zinc-500 dark:text-zinc-400">{k}</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-100">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {movie.categories.map((c) => (
          <PopcornBadge key={c} category={c} size="md" variant="soft" />
        ))}
      </div>
    </Card>
  );
}

function CreditsPanel() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {SAMPLE_CREDITS.map((role, i) => (
        <div key={i} className="flex flex-col items-center gap-2 text-center">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800" />
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {role}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 상세 상단에 노출할 카테고리 라벨 (예: 오컬트·미스터리·공포) */
export function categoryLabel(id: keyof typeof CATEGORIES) {
  return CATEGORIES[id]?.label ?? "";
}
