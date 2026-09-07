import { Badge } from "@seed-design/react";

/**
 * 화면마다 .statusTag / .actionTag / .changeTag / .reportTag를 따로 만들어 쓰고 있었다.
 * 모양도 톤 이름도 제각각이라 같은 "정지" 상태가 화면마다 다르게 보였다.
 *
 * Seed Badge의 tone 정의가 이 도메인과 그대로 맞아떨어진다.
 *   positive  완료·승인됨·검토 통과
 *   critical  거절·제재·유효성 실패
 *   warning   만료 임박·정보 부족
 *   neutral   상태가 명확하지 않은 초기 상태
 */
export type StateTone = "neutral" | "brand" | "informative" | "positive" | "warning" | "critical";

export function StateBadge({
  tone = "neutral",
  variant = "weak",
  children,
}: {
  tone?: StateTone;
  /** 표 안에서는 weak, 강조가 필요하면 solid. */
  variant?: "weak" | "solid" | "outline";
  children: React.ReactNode;
}) {
  return (
    <Badge variant={variant} tone={tone}>
      {children}
    </Badge>
  );
}
