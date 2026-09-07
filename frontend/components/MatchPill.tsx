/** AI 매칭 점수 필 — 초록 배경 + 체크 + 퍼센트 */
export function MatchPill({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold leading-none text-white shadow-sm ${className}`}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M3.5 8.5 6.5 11.5 12.5 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {value}%
    </span>
  );
}
