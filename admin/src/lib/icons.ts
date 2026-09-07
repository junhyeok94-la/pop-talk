/**
 * Figma Make 원본은 lucide-react를 썼지만, 이 프로젝트는 Seed Design 아이콘으로 통일한다.
 * Seed 아이콘 팩(603종)에 1:1로 대응되지 않는 것은 뜻이 가장 가까운 것으로 대체했고,
 * 대체한 항목은 주석으로 남긴다.
 */
export {
  // 내비게이션
  IconChartRegular as IconDashboard, // lucide LayoutDashboard — 대시보드 전용 아이콘이 없어 차트로 대체
  IconVideoRegular as IconMovie, // lucide Film
  IconCheckRegular as IconApprove, // lucide CheckCircle2 — 원형 배경 없음
  IconHashtagRegular as IconCategory, // lucide Tag
  IconTextRegular as IconText, // lucide Type — 화면 문구 관리
  IconChattingRegular as IconReview, // lucide MessageSquare
  IconUserGroupRegular as IconMembers, // lucide Users
  IconLockRegular as IconAdmin, // lucide ShieldCheck — 방패 아이콘이 없어 자물쇠로 대체
  IconNotificationRegular as IconPush, // lucide Bell
  IconListCardRegular as IconLog, // lucide ScrollText
  IconSignoutRegular as IconSignout, // lucide LogOut

  // 상태·액션
  IconRemoveCircleRegular as IconUncertify, // lucide BadgeX / ShieldOff / UserX — 인증취소·정지 공통
  IconProfileRegular as IconMember, // lucide User
  IconChattingSendRegular as IconSend, // lucide Send
  IconCalendarRegular as IconCalendar,
  IconClockRegular as IconClock,
  IconListRegular as IconData, // lucide Database — 데이터 적재 지표
  IconArrowUpwardRegular as IconTrendUp, // lucide TrendingUp — 꺾은선 상승 아이콘이 없어 위쪽 화살표로 대체
  IconViewCountOffRegular as IconHidden, // lucide EyeOff
  IconReportRegular as IconFlag,
  IconRetryRegular as IconRefresh, // lucide RefreshCw
  IconEditRegular as IconEdit, // lucide Edit2
  IconTrashRegular as IconTrash, // lucide Trash2
  IconAddRegular as IconAdd, // lucide Plus
  IconExpandRegular as IconExternal, // lucide ExternalLink
  IconCloseRegular as IconClose, // lucide X
  IconWarningRegular as IconWarning, // 스키마 어긋남 배너
  IconExpandMoreRegular as IconChevronDown, // Select 트리거 펼침 표시 (아래쪽 chevron이 없어 ExpandMore로 대체)

  // 도구
  IconChevronRightRegular as IconChevronRight, // lucide ChevronRight / ArrowRight
  IconChevronLeftRegular as IconChevronLeft, // lucide ChevronLeft / ArrowLeft
  IconSearchRegular as IconSearch,
  IconFilter02Regular as IconFilter, // lucide SlidersHorizontal

  // 별점 — 감상평 점수는 0.5~5.0 별점이다 (dev.reviews.rating)
  IconReviewStarFill as IconStarFill,
  IconReviewStarRegular as IconStarEmpty,
} from "@seed-design/react-icon";
