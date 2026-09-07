import { Grid, HStack, Text, VStack } from "@seed-design/react";
import Link from "next/link";

import ui from "@/styles/ui.module.css";
import styles from "./summary-cards.module.css";

export type SummaryTone = "neutral" | "brand" | "positive" | "warning" | "critical" | "informative";

export type SummaryItem = {
  key: string;
  /** 카드 좌상단 태그 문구 */
  label: string;
  value: number | string;
  /** 값 아래 보조 설명 */
  caption?: string;
  tone?: SummaryTone;
  icon?: React.ComponentType<{ size?: number }>;
  /** 이동형 카드 */
  href?: string;
  /** 필터형 카드 */
  onClick?: () => void;
  active?: boolean;
};

const TONE_CLASS: Record<SummaryTone, string> = {
  neutral: styles.toneNeutral,
  brand: styles.toneBrand,
  positive: styles.tonePositive,
  warning: styles.toneWarning,
  critical: styles.toneCritical,
  informative: styles.toneInformative,
};

/**
 * 모든 화면 상단에 같은 모양으로 얹는 요약 카드.
 * href를 주면 이동형, onClick을 주면 필터형으로 동작한다.
 * 배치는 Seed의 Grid/VStack/HStack에 맡기고, 카드 외곽선과 톤만 CSS로 둔다.
 */
export function SummaryCards({ items }: { items: SummaryItem[] }) {
  return (
    <Grid columns={items.length} gap="x3">
      {items.map((item) => {
        const Icon = item.icon;
        const tone = TONE_CLASS[item.tone ?? "neutral"];
        const className = `${ui.card} ${item.active ? styles.cardActive : styles.card}`;

        const inner = (
          <VStack gap="x1" alignItems="flex-start" padding="x4">
            <HStack justifyContent="space-between" alignItems="center" width="100%" mb="x1">
              <span className={`${styles.tag} ${tone}`}>{item.label}</span>
              {Icon && (
                <span className={styles.icon} aria-hidden="true">
                  <Icon size={14} />
                </span>
              )}
            </HStack>
            <Text as="span" textStyle="t9Bold">
              {item.value}
            </Text>
            {item.caption && (
              <Text as="span" textStyle="t2Regular" color="fg.neutralMuted">
                {item.caption}
              </Text>
            )}
          </VStack>
        );

        if (item.href) {
          return (
            <Link key={item.key} href={item.href} className={className}>
              {inner}
            </Link>
          );
        }

        return (
          <button
            key={item.key}
            type="button"
            className={className}
            aria-pressed={item.active}
            onClick={item.onClick}
          >
            {inner}
          </button>
        );
      })}
    </Grid>
  );
}
