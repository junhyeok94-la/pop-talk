"use client";

import {
  Count,
  SideNavigationContent,
  SideNavigationGroup,
  SideNavigationGroupLabel,
  SideNavigationHeader,
  SideNavigationItem,
  SideNavigationItemCollapsibleContent,
  SideNavigationItemCollapsibleRoot,
  SideNavigationItemCollapsibleTrigger,
  SideNavigationItemLabel,
  SideNavigationItemPrefixIcon,
  SideNavigationProvider,
  SideNavigationRoot,
  Text,
} from "@seed-design/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useAdminStore } from "@/lib/admin-store";
import {
  IconApprove,
  IconCategory,
  IconChevronDown,
  IconDashboard,
  IconMembers,
  IconMovie,
  IconReview,
  IconText,
} from "@/lib/icons";
import styles from "./sidebar.module.css";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  showPendingCount?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

/** 대시보드는 진입점이라 그룹 밖에 단독으로 둔다. 라벨을 붙이면 이름만 두 번 나온다. */
const DASHBOARD: NavItem = { href: "/", label: "대시보드", icon: IconDashboard };

/**
 * 메뉴가 10개인데 성격이 제각각이라 평평하게 나열하면 "매일 여는 것"과
 * "분기에 한 번 여는 것"이 같은 무게로 보인다. 하는 일 기준으로 묶는다.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    label: "영화 검수",
    items: [
      { href: "/review", label: "서비스 영화", icon: IconMovie, showPendingCount: true },
      { href: "/approved", label: "인증완료 영화", icon: IconApprove },
    ],
  },
  {
    label: "콘텐츠 설정",
    items: [
      { href: "/movie-categories", label: "카테고리 관리", icon: IconCategory },
      { href: "/categories", label: "화면 문구 관리", icon: IconText },
    ],
  },
  {
    label: "사용자",
    items: [
      // 감상평은 회원 상세에서도 보므로 회원이 상위 개념이다.
      { href: "/members", label: "회원 관리", icon: IconMembers },
      { href: "/reviews", label: "감상평", icon: IconReview },
    ],
  },
];

function isActiveHref(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  /*
   * 영화 상세(/movies/…)는 서비스 영화에서 들어가므로 그쪽을 활성으로 본다.
   *
   * startsWith("/review")로 보면 안 된다 — 감상평이 /reviews라 접두어가 겹친다.
   * 그러면 감상평 화면에서 서비스 영화까지 함께 켜지고, 그룹은 먼저 걸리는
   * "영화 검수"가 열려 선택이 엉뚱한 곳에 표시된다.
   */
  if (href === "/review") {
    return pathname === "/review" || pathname.startsWith("/movies");
  }
  // /categories가 /movie-categories를 삼키지 않도록 정확히 끊는다.
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 지금 경로가 속한 그룹. 없으면(대시보드) null. */
function activeGroupOf(pathname: string) {
  return NAV_GROUPS.find((g) => g.items.some((item) => isActiveHref(item.href, pathname))) ?? null;
}

export function Sidebar() {
  const pathname = usePathname();
  const { pendingCount } = useAdminStore();

  // 열림 상태를 직접 들고 있어야 한다. defaultOpen은 마운트 때 한 번만 먹는데,
  // 클라이언트 라우팅에서는 사이드바가 다시 마운트되지 않아 활성 메뉴가 접힌 채 숨는다.
  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    const active = activeGroupOf(pathname);
    return active ? [active.label] : [];
  });

  // 화면을 옮기면 그 그룹을 연다. 사용자가 열어둔 다른 그룹은 건드리지 않는다.
  // effect가 아니라 렌더 중에 조정한다 — 경로가 바뀐 그 렌더에서 바로 열려야
  // 활성 메뉴가 한 프레임이라도 접힌 채 보이지 않는다.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    const active = activeGroupOf(pathname);
    if (active && !openGroups.includes(active.label)) {
      setOpenGroups([...openGroups, active.label]);
    }
  }

  const toggleGroup = (label: string, open: boolean) =>
    setOpenGroups((prev) => (open ? [...prev, label] : prev.filter((l) => l !== label)));

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActiveHref(item.href, pathname);

    return (
      <SideNavigationItem key={item.href} asChild current={active}>
        <Link href={item.href} aria-current={active ? "page" : undefined}>
          <SideNavigationItemPrefixIcon svg={<Icon />} />
          <SideNavigationItemLabel>{item.label}</SideNavigationItemLabel>
          {item.showPendingCount && pendingCount > 0 && <Count>{pendingCount}</Count>}
        </Link>
      </SideNavigationItem>
    );
  };

  return (
    // SideNavigationRoot는 Provider가 제공하는 컨텍스트를 필요로 한다.
    <SideNavigationProvider>
      <SideNavigationRoot className={styles.sidebar}>
        <SideNavigationHeader>
          <span className={styles.logo}>
            <span className={styles.logoMark} aria-hidden="true">
              🍿
            </span>
            <span>
              <Text as="span" textStyle="t4Bold" className={styles.logoTitle}>
                팝콘톡
              </Text>
              <Text as="span" textStyle="t1Medium" color="fg.brand" className={styles.logoSub}>
                Admin Console
              </Text>
            </span>
          </span>
        </SideNavigationHeader>

        <SideNavigationContent>
          <SideNavigationGroup>{renderItem(DASHBOARD)}</SideNavigationGroup>

          {NAV_GROUPS.map((group) => (
            <SideNavigationGroup key={group.label} className={styles.group}>
              <SideNavigationItemCollapsibleRoot
                open={openGroups.includes(group.label)}
                onOpenChange={(open) => toggleGroup(group.label, open)}
              >
                <SideNavigationItemCollapsibleTrigger className={styles.groupTrigger}>
                  <SideNavigationGroupLabel className={styles.groupLabel}>
                    {group.label}
                  </SideNavigationGroupLabel>
                  <span className={styles.groupChevron} aria-hidden="true">
                    <IconChevronDown size={12} />
                  </span>
                </SideNavigationItemCollapsibleTrigger>
                <SideNavigationItemCollapsibleContent>
                  {group.items.map(renderItem)}
                </SideNavigationItemCollapsibleContent>
              </SideNavigationItemCollapsibleRoot>
            </SideNavigationGroup>
          ))}
        </SideNavigationContent>
      </SideNavigationRoot>
    </SideNavigationProvider>
  );
}
