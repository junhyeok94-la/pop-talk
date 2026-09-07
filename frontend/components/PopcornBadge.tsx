import { CATEGORIES, type CategoryId } from "@/lib/categories";

export type PopcornBadgeSize = "sm" | "md" | "lg";
export type PopcornBadgeVariant = "overlay" | "soft" | "icon";

const SIZE = {
  sm: { icon: 12, pad: "px-1.5 py-0.5", text: "text-[10px]", gap: "gap-1" },
  md: { icon: 14, pad: "px-2 py-1", text: "text-xs", gap: "gap-1" },
  lg: { icon: 16, pad: "px-2.5 py-1", text: "text-sm", gap: "gap-1.5" },
} as const;

export interface PopcornBadgeProps {
  category: CategoryId;
  /** 8/12/16px 대응 — sm(12) · md(14) · lg(16) */
  size?: PopcornBadgeSize;
  /**
   * overlay: 썸네일 위에 얹는 반투명 다크 필 (기본)
   * soft: 카테고리 색을 옅게 깐 라이트 필
   * icon: 라벨 없이 아이콘만
   */
  variant?: PopcornBadgeVariant;
  /** 라벨 오버라이드 (기본값은 카테고리 한글명) */
  label?: string;
  className?: string;
}

/**
 * POPCORN Badge — 카테고리 아이콘 + 라벨 배지.
 * 영화 썸네일 오버레이, 상세 메타, 칩 등에서 재사용한다.
 */
export function PopcornBadge({
  category,
  size = "md",
  variant = "overlay",
  label,
  className = "",
}: PopcornBadgeProps) {
  const meta = CATEGORIES[category];
  if (!meta) return null;

  const s = SIZE[size];
  const { Icon, color, label: defaultLabel } = meta;
  const text = label ?? defaultLabel;

  if (variant === "icon") {
    return (
      <span
        className={`inline-flex items-center justify-center ${className}`}
        style={{ color }}
        title={text}
        aria-label={text}
      >
        <Icon width={s.icon} height={s.icon} />
      </span>
    );
  }

  const shell =
    variant === "overlay"
      ? "bg-black/55 text-white backdrop-blur-sm ring-1 ring-white/10"
      : "text-zinc-800 dark:text-zinc-100";

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold leading-none ${s.gap} ${s.pad} ${s.text} ${shell} ${className}`}
      style={
        variant === "soft"
          ? { backgroundColor: `${color}22`, color }
          : undefined
      }
    >
      <span
        className="inline-flex shrink-0"
        style={variant === "overlay" ? { color } : undefined}
      >
        <Icon width={s.icon} height={s.icon} />
      </span>
      <span className={variant === "overlay" ? "text-white" : undefined}>
        {text}
      </span>
    </span>
  );
}
