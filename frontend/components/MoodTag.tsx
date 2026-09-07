import { MOODS, type MoodId } from "@/lib/movies";

/** 카드에 얹는 관람 상황 무드 태그 (솔리드 필) */
export function MoodTag({
  mood,
  className = "",
}: {
  mood: MoodId;
  className?: string;
}) {
  const m = MOODS[mood];
  if (!m) return null;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-bold leading-none shadow-sm ${className}`}
      style={{ backgroundColor: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}
