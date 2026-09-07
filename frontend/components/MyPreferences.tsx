"use client";

import { useQuery } from "@tanstack/react-query";
import { DISPLAY_CATEGORY_OPTIONS } from "@/lib/display-categories";

type PreferenceGroup = { label: string; values: string[]; tone?: "avoid" };

const FIELD_LABELS = [
  ["favorite_genres", "좋아하는 장르"],
  ["favorite_keywords", "좋아하는 키워드"],
  ["preferred_moods", "선호하는 분위기"],
  ["favorite_actors", "좋아하는 배우"],
  ["favorite_directors", "좋아하는 감독"],
  ["avoid_keywords", "피하고 싶은 요소"],
] as const;

async function fetchPreferences(): Promise<Record<string, unknown>> {
  const response = await fetch("/api/me/preferences", { cache: "no-store" });
  const result: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result && typeof result === "object" && "error" in result
      ? String((result as { error: unknown }).error)
      : "취향 정보를 불러오지 못했습니다.";
    throw new Error(message);
  }
  return result && typeof result === "object" ? result as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" || typeof item === "number" ? [String(item)] : [])
    : [];
}

function categoryNames(data: Record<string, unknown>) {
  const raw = data.display_categories ?? data.selected_display_categories ?? data.movie_category_ids;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item === "number") {
      return DISPLAY_CATEGORY_OPTIONS.find((category) => category.id === item)?.name ?? `카테고리 ${item}`;
    }
    if (typeof item === "string") {
      const category = DISPLAY_CATEGORY_OPTIONS.find(({ code, id }) => code === item || String(id) === item);
      return category?.name ?? item;
    }
    if (item && typeof item === "object") {
      const category = item as Record<string, unknown>;
      if (typeof category.name === "string") return category.name;
      if (typeof category.id === "number") return DISPLAY_CATEGORY_OPTIONS.find(({ id }) => id === category.id)?.name ?? `카테고리 ${category.id}`;
    }
    return [];
  });
}

function normalizePreferences(data: Record<string, unknown>) {
  const nested = data.preferences && typeof data.preferences === "object"
    ? data.preferences as Record<string, unknown>
    : data;
  const groups: PreferenceGroup[] = [];
  const categories = categoryNames(data).length ? categoryNames(data) : categoryNames(nested);
  if (categories.length) groups.push({ label: "선택한 영화 취향", values: categories });
  for (const [key, label] of FIELD_LABELS) {
    const values = stringArray(nested[key]);
    if (values.length) groups.push({ label, values, tone: key === "avoid_keywords" ? "avoid" : undefined });
  }
  return { groups, rating: typeof nested.max_content_rating === "string" ? nested.max_content_rating : null };
}

export function MyPreferences() {
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["my-preferences"],
    queryFn: fetchPreferences,
  });

  if (isPending) return <PreferencesSkeleton />;
  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
        <p role="alert">{error.message}</p>
        <button type="button" onClick={() => void refetch()} className="mt-2 font-bold underline">다시 시도</button>
      </div>
    );
  }

  const preferences = normalizePreferences(data ?? {});
  if (!preferences.groups.length && !preferences.rating) {
    return <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">아직 저장된 영화 취향이 없습니다.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {preferences.groups.map((group) => (
        <article key={group.label} className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">{group.label}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {group.values.map((value) => <span key={value} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${group.tone === "avoid" ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}>{value}</span>)}
          </div>
        </article>
      ))}
      {preferences.rating ? <article className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800"><h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">허용 관람등급</h3><p className="mt-3 text-lg font-bold text-amber-600">{preferences.rating}</p></article> : null}
    </div>
  );
}

function PreferencesSkeleton() {
  return <div role="status" aria-label="취향 정보를 불러오는 중" className="grid gap-4 sm:grid-cols-2">{[1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />)}</div>;
}
