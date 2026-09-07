import { Badge } from "@seed-design/react";
import type { MovieApprovalStatus, MovieServiceStatus } from "@/lib/mock";

type Tone = "neutral" | "positive" | "informative" | "critical";

/**
 * 검수(approval_status)와 노출(service_status)은 DB에서도 별개 컬럼이라
 * 뱃지도 따로 둔다. 한 뱃지로 합치면 "인증완료지만 미노출" 같은 조합을 못 그린다.
 */
const APPROVAL_CONFIG: Record<MovieApprovalStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "인증대기", tone: "neutral" },
  APPROVED: { label: "인증완료", tone: "positive" },
  REJECTED: { label: "반려", tone: "critical" },
};

const SERVICE_CONFIG: Record<MovieServiceStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "준비중", tone: "neutral" },
  PUBLISHED: { label: "노출중", tone: "positive" },
  HIDDEN: { label: "숨김", tone: "informative" },
};

export function StatusBadge({ status }: { status: MovieApprovalStatus }) {
  const { label, tone } = APPROVAL_CONFIG[status];
  return (
    <Badge variant="weak" tone={tone}>
      {label}
    </Badge>
  );
}

export function ServiceBadge({ status }: { status: MovieServiceStatus }) {
  const { label, tone } = SERVICE_CONFIG[status];
  return (
    <Badge variant="weak" tone={tone}>
      {label}
    </Badge>
  );
}

export { APPROVAL_CONFIG, SERVICE_CONFIG };
