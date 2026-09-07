"use client";

import {
  ContentPlaceholderRoot,
  Divider,
  TextFieldInput,
  TextFieldPrefixIcon,
  TextFieldRoot,
} from "@seed-design/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { DateRangeFilter, withinRange } from "@/components/date-range-filter";
import { PageSub, PageTitle } from "@/components/typography";
import { DateTimeCell } from "@/components/date-time-cell";
import { AdminChip } from "@/components/movie-cell";
import { Pagination } from "@/components/pagination";
import { StateBadge, type StateTone } from "@/components/state-badge";
import { SummaryCards, type SummaryItem } from "@/components/summary-cards";
import { fetchMembers } from "@/lib/api";
import { MOCK_MEMBERS, type Member, type MemberStatus } from "@/lib/mock";
import {
  IconChevronRight,
  IconFilter,
  IconHidden,
  IconMember,
  IconMembers,
  IconSearch,
  IconUncertify,
} from "@/lib/icons";
import ui from "@/styles/ui.module.css";
import styles from "./page.module.css";

const STATUS_CONFIG: Record<MemberStatus, { label: string; tone: StateTone }> = {
  ACTIVE: { label: "정상", tone: "positive" },
  SUSPENDED: { label: "정지", tone: "critical" },
  WITHDRAWN: { label: "탈퇴", tone: "neutral" },
};

const PAGE_SIZE = 10;


export default function MembersPage() {
  // 회원은 영화 심사 상태와 무관해서 원본과 동일하게 화면 로컬 상태로 둔다.
  // 상태 수정 기능을 뺐으므로 목록은 읽기 전용이다.
  /*
   * 회원은 실 DB에서 온다(/admin-api/members).
   *
   * 목으로 시작해 응답이 오면 갈아끼운다 — 처음 그리는 순간에도 빈 표가
   * 보이지 않는다. DB가 없으면 503이 오고 목이 남는데, 회원 화면에는 쓰는
   * 동작이 없어 "저장된 척"이 생길 자리가 없다.
   */
  const [members, setMembers] = useState<Member[]>(MOCK_MEMBERS);

  useEffect(() => {
    const controller = new AbortController();
    fetchMembers(controller.signal).then((items) => {
      if (items && !controller.signal.aborted) setMembers(items);
    });
    return () => controller.abort();
  }, []);
  const [statusFilter, setStatusFilter] = useState<MemberStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  // 가입일 기준 기간 필터.
  const [joinedRange, setJoinedRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);

  const filtered = members.filter((member) => {
    if (statusFilter !== "ALL" && member.status !== statusFilter) return false;
    if (!withinRange(member.joined_at, joinedRange.from, joinedRange.to)) return false;
    if (search) {
      const q = search.toLowerCase();
      return member.name.toLowerCase().includes(q) || member.email.toLowerCase().includes(q);
    }
    return true;
  });

  const counts = {
    ACTIVE: members.filter((m) => m.status === "ACTIVE").length,
    SUSPENDED: members.filter((m) => m.status === "SUSPENDED").length,
    WITHDRAWN: members.filter((m) => m.status === "WITHDRAWN").length,
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);


  const selectStatus = (value: MemberStatus | "ALL") => {
    setStatusFilter(value);
    setPage(1);
  };

  const summary: SummaryItem[] = [
    {
      key: "ALL",
      label: "전체",
      value: members.length,
      caption: "가입 회원",
      icon: IconMembers,
      tone: "brand",
      active: statusFilter === "ALL",
      onClick: () => selectStatus("ALL"),
    },
    {
      key: "ACTIVE",
      label: "정상",
      value: counts.ACTIVE,
      caption: "이용 중",
      icon: IconMember,
      tone: "positive",
      active: statusFilter === "ACTIVE",
      onClick: () => selectStatus("ACTIVE"),
    },
    {
      key: "SUSPENDED",
      label: "정지",
      value: counts.SUSPENDED,
      caption: "이용 제한",
      icon: IconUncertify,
      tone: "critical",
      active: statusFilter === "SUSPENDED",
      onClick: () => selectStatus("SUSPENDED"),
    },
    {
      key: "WITHDRAWN",
      label: "탈퇴",
      value: counts.WITHDRAWN,
      caption: "탈퇴 처리됨",
      icon: IconHidden,
      tone: "neutral",
      active: statusFilter === "WITHDRAWN",
      onClick: () => selectStatus("WITHDRAWN"),
    },
  ];

  return (
    <div className={ui.pageTight}>
      <div className={ui.pageHead}>
        <div>
          <PageTitle>회원 관리</PageTitle>
          <PageSub>가입 회원 현황 및 상태 관리</PageSub>
        </div>
        <PageSub as="span">총 {filtered.length}명</PageSub>
      </div>

      <SummaryCards items={summary} />

      <div className={ui.filterBar}>
        <IconFilter size={14} />
        <TextFieldRoot className={ui.filterSearch} value={search} onValueChange={(v) => {
              setSearch(v);
              setPage(1);
            }} size="medium">
          <TextFieldPrefixIcon svg={<IconSearch />} />
          <TextFieldInput id="member-search" type="search" placeholder="이름, 이메일 검색" aria-label="이름, 이메일 검색" />
        </TextFieldRoot>

        <Divider orientation="vertical" />

        <DateRangeFilter
          label="가입일"
          from={joinedRange.from}
          to={joinedRange.to}
          onChange={(next) => {
            setJoinedRange(next);
            setPage(1);
          }}
        />

        <PageSub as="span">총 {filtered.length}명</PageSub>
      </div>

      <div className={ui.card}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>이름</th>
              <th>이메일</th>
              <th>가입일</th>
              <th>상태</th>
              <th>감상평</th>
              <th>수정자</th>
              <th>수정일시</th>
              <th>상세</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr>
                <td colSpan={11}>
                  <ContentPlaceholderRoot>검색 결과가 없습니다.</ContentPlaceholderRoot>
                </td>
              </tr>
            )}
            {paginated.map((member) => (
              <tr key={member.id}>
                <td className={ui.muted}>{member.id}</td>
                <td>
                  <div className={styles.member}>
                    <span className={styles.memberName}>{member.name}</span>
                  </div>
                </td>
                <td className={ui.muted}>{member.email}</td>
                <td className={ui.muted}>{member.joined_at}</td>
                <td>
                  <StateBadge tone={STATUS_CONFIG[member.status].tone}>
                    {STATUS_CONFIG[member.status].label}
                  </StateBadge>
                </td>
                <td>
                  <span className={member.review_count > 20 ? ui.score : styles.plainCount}>
                    {member.review_count}
                  </span>
                </td>
                <td>
                  <AdminChip name={member.status_updated_by} />
                </td>
                <td>
                  <DateTimeCell value={member.status_updated_at} />
                </td>
                <td>
                  <Link href={`/members/${member.id}`} className={ui.textButton}>
                    상세
                    <IconChevronRight size={12} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Pagination
          page={currentPage}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={PAGE_SIZE}
          unit="명"
          onChange={setPage}
        />
      </div>

    </div>
  );
}
