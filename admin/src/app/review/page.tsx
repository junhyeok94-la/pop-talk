"use client";

import {
  Divider,
  TextFieldInput,
  TextFieldPrefixIcon,
  TextFieldRoot,
} from "@seed-design/react";
import { useEffect, useState } from "react";

import { DateRangeFilter } from "@/components/date-range-filter";
import { SelectField } from "@/components/select-field";
import { PageSub, PageTitle } from "@/components/typography";
import { MovieTable } from "@/components/movie-table";
import { Pagination } from "@/components/pagination";
import { SummaryCards, type SummaryItem } from "@/components/summary-cards";
import { useAdminStore } from "@/lib/admin-store";
import { fetchMovies, type MovieCounts } from "@/lib/api";

import type { MovieApprovalStatus } from "@/lib/mock";
import {
  IconApprove,
  IconClock,
  IconFilter,
  IconMovie,
  IconSearch,
  IconUncertify,
} from "@/lib/icons";
import ui from "@/styles/ui.module.css";

const PAGE_SIZE = 10;

export default function ReviewQueuePage() {
  const { movies: storeMovies, movieCounts } = useAdminStore();

  /*
   * 목록을 서버에서 쪽 단위로 받는다.
   *
   * 전에는 스토어의 300편을 여기서 걸렀다 — 5,312편 중 300편만 보였고,
   * release_date로 잘랐으므로 개봉일이 뒤에 있는 영화는 아예 나타나지
   * 않았다. 전부 보내면 11MB(그중 media가 7MB)라 감상평과 같은 방식으로
   * 서버에서 거르고 자른다.
   *
   * 스토어 목록으로 시작해 응답이 오면 갈아끼운다 — 처음 그리는 순간에도
   * 빈 표가 보이지 않는다.
   */
  const [movies, setMovies] = useState(storeMovies);
  /*
   * 수치는 layout이 서버에서 읽어둔 값으로 시작한다. 스토어의 목록 길이로
   * 시작하면 첫 화면에 "전체 300 · 인증대기 0"이 보였다가 5,312로 바뀐다 —
   * 잠깐이지만 거짓이다.
   */
  const [total, setTotal] = useState(movieCounts?.all ?? storeMovies.length);
  const [counts, setCounts] = useState<MovieCounts | null>(movieCounts);
  const [allGenres, setAllGenres] = useState<string[]>(() =>
    Array.from(new Set(storeMovies.flatMap((m) => m.genres))),
  );

  const [statusFilter, setStatusFilter] = useState<MovieApprovalStatus | "ALL">("ALL");
  const [genreFilter, setGenreFilter] = useState("");
  /*
   * 정보 완성도 필터. 뷰가 세어 준 값으로 거른다(마이그레이션 008).
   *
   * 두 출처(KOFIC·KMDB)를 합쳐도 채워지지 않는 영화가 많아, 무엇이
   * 남았는지 모아 볼 수 있어야 채우든 기준을 낮추든 판단이 선다.
   */
  const [completeFilter, setCompleteFilter] = useState<"" | "COMPLETE" | "INCOMPLETE">("");
  const [search, setSearch] = useState("");
  // 적재일시(수집 시각) 기준 기간 필터.
  const [loadedRange, setLoadedRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);

  /* 검색어는 한 박자 늦춘다. 글자마다 5천 행을 훑을 이유가 없다. */
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    fetchMovies(
      {
        page,
        size: PAGE_SIZE,
        status: statusFilter === "ALL" ? undefined : statusFilter,
        genre: genreFilter,
        complete: completeFilter,
        q: debouncedSearch,
        syncedFrom: loadedRange.from,
        syncedTo: loadedRange.to,
      },
      controller.signal,
    ).then((res) => {
      // 실패하면 이전 목록을 유지한다. 빈 화면으로 떨어뜨리지 않는다.
      if (!res || controller.signal.aborted) return;
      setMovies(res.items);
      setTotal(res.total);
      setCounts(res.counts);
      if (res.genres.length) setAllGenres(res.genres);
    });
    return () => controller.abort();
  }, [page, statusFilter, genreFilter, completeFilter, debouncedSearch, loadedRange.from, loadedRange.to]);

  const publishedCount = counts?.published ?? 0;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  // 서버가 이미 잘라 보냈다. 여기서 다시 자르지 않는다.
  const paginated = movies;

  const resetPage = () => setPage(1);

  const selectStatus = (value: MovieApprovalStatus | "ALL") => {
    setStatusFilter(value);
    resetPage();
  };

  const summary: SummaryItem[] = [
    {
      key: "ALL",
      label: "전체",
      value: counts?.all ?? total,
      caption: `노출 중 ${publishedCount}건`,
      icon: IconMovie,
      tone: "brand",
      active: statusFilter === "ALL",
      onClick: () => selectStatus("ALL"),
    },
    {
      key: "PENDING",
      label: "인증대기",
      value: counts?.pending ?? 0,
      caption: "검토 필요",
      icon: IconClock,
      tone: "neutral",
      active: statusFilter === "PENDING",
      onClick: () => selectStatus("PENDING"),
    },
    {
      key: "APPROVED",
      label: "인증완료",
      value: counts?.approved ?? 0,
      caption: "인증 뱃지 노출",
      icon: IconApprove,
      tone: "positive",
      active: statusFilter === "APPROVED",
      onClick: () => selectStatus("APPROVED"),
    },
    {
      key: "REJECTED",
      label: "반려",
      value: counts?.rejected ?? 0,
      caption: "인증 거부됨",
      icon: IconUncertify,
      tone: "critical",
      active: statusFilter === "REJECTED",
      onClick: () => selectStatus("REJECTED"),
    },
  ];

  return (
    <div className={ui.pageTight}>
      <div className={ui.pageHead}>
        <div>
          <PageTitle>서비스 영화</PageTitle>
          <PageSub>수집된 영화 인증 심사 및 노출 관리</PageSub>
        </div>
        <PageSub as="span">총 {total.toLocaleString()}건</PageSub>
      </div>

      <SummaryCards items={summary} />

      <div className={ui.filterBar}>
        <IconFilter size={14} />

        <SelectField
          id="genre-filter"
          className={ui.filterSelect}
          ariaLabel="장르 필터"
          placeholder="장르 전체"
          value={genreFilter}
          options={allGenres.map((g) => ({ value: g, label: g }))}
          onChange={(v) => {
            setGenreFilter(v);
            resetPage();
          }}
        />

        <SelectField
          id="complete-filter"
          className={ui.filterSelect}
          ariaLabel="정보 완성도 필터"
          placeholder="정보 전체"
          value={completeFilter}
          options={[
            { value: "INCOMPLETE", label: "정보 미완성" },
            { value: "COMPLETE", label: "정보 완성" },
          ]}
          onChange={(v) => {
            setCompleteFilter(v as "" | "COMPLETE" | "INCOMPLETE");
            resetPage();
          }}
        />

        <TextFieldRoot className={ui.filterSearch} value={search} onValueChange={(v) => {
              setSearch(v);
              resetPage();
            }} size="medium">
          <TextFieldPrefixIcon svg={<IconSearch />} />
          <TextFieldInput id="movie-search" type="search" placeholder="제목, 감독, 배우 검색" aria-label="제목, 감독, 배우 검색" />
        </TextFieldRoot>

        <Divider orientation="vertical" />

        <DateRangeFilter
          label="적재일시"
          from={loadedRange.from}
          to={loadedRange.to}
          onChange={(next) => {
            setLoadedRange(next);
            resetPage();
          }}
        />
      </div>

      <div className={ui.card}>
        <MovieTable
          movies={paginated}
          variant="review"
          emptyMessage="검색 결과가 없습니다."
        />

        <Pagination
          page={currentPage}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onChange={setPage}
        />
      </div>
    </div>
  );
}
