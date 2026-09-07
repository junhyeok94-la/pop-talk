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
import { IconApprove, IconFilter, IconHidden, IconSearch } from "@/lib/icons";
import ui from "@/styles/ui.module.css";

type ExposureFilter = "ALL" | "EXPOSED" | "HIDDEN";

const PAGE_SIZE = 10;

export default function ApprovedListPage() {
  const { movies: storeMovies, movieCounts } = useAdminStore();

  /*
   * 목록을 서버에서 쪽 단위로 받는다. 검수 화면과 같은 이유다 — 스토어의
   * 300편만 걸러서는 인증완료 5,309편 중 극히 일부만 보인다.
   *
   * 스토어 목록으로 시작해 응답이 오면 갈아끼운다.
   */
  const [approved, setApproved] = useState(() =>
    storeMovies.filter((m) => m.approval_status === "APPROVED"),
  );
  /* 수치는 layout이 서버에서 읽어둔 값으로 시작한다. 0으로 시작하면 첫 화면에
   * "전체 0"이 보였다가 5,309로 바뀐다. */
  const [total, setTotal] = useState(movieCounts?.approved ?? 0);
  const [counts, setCounts] = useState<MovieCounts | null>(movieCounts);
  const [allGenres, setAllGenres] = useState<string[]>(() =>
    Array.from(new Set(storeMovies.flatMap((m) => m.genres))),
  );

  const [exposureFilter, setExposureFilter] = useState<ExposureFilter>("ALL");
  const [genreFilter, setGenreFilter] = useState("");
  const [search, setSearch] = useState("");
  // 인증일시 기준 기간 필터.
  const [approvedRange, setApprovedRange] = useState({ from: "", to: "" });
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
        // 이 화면은 인증완료만 다룬다.
        status: "APPROVED",
        exposure: exposureFilter === "ALL" ? undefined : exposureFilter,
        genre: genreFilter,
        q: debouncedSearch,
        approvedFrom: approvedRange.from,
        approvedTo: approvedRange.to,
      },
      controller.signal,
    ).then((res) => {
      if (!res || controller.signal.aborted) return;
      setApproved(res.items);
      setTotal(res.total);
      setCounts(res.counts);
      if (res.genres.length) setAllGenres(res.genres);
    });
    return () => controller.abort();
  }, [page, exposureFilter, genreFilter, debouncedSearch, approvedRange.from, approvedRange.to]);

  const selectExposure = (value: ExposureFilter) => {
    setExposureFilter(value);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  // 서버가 이미 잘라 보냈다.
  const paginated = approved;

  const summary: SummaryItem[] = [
    {
      key: "ALL",
      label: "전체",
      value: counts?.approved ?? total,
      caption: "인증완료 영화",
      icon: IconApprove,
      tone: "brand",
      active: exposureFilter === "ALL",
      onClick: () => selectExposure("ALL"),
    },
    {
      key: "EXPOSED",
      label: "노출 중",
      value: counts?.published ?? 0,
      caption: "사용자에게 노출",
      icon: IconApprove,
      tone: "positive",
      active: exposureFilter === "EXPOSED",
      onClick: () => selectExposure("EXPOSED"),
    },
    {
      key: "HIDDEN",
      label: "미노출",
      value: (counts?.approved ?? 0) - (counts?.published ?? 0),
      caption: "노출 꺼짐",
      icon: IconHidden,
      tone: "neutral",
      active: exposureFilter === "HIDDEN",
      onClick: () => selectExposure("HIDDEN"),
    },
  ];

  return (
    <div className={ui.pageTight}>
      <div className={ui.pageHead}>
        <div>
          <PageTitle>인증완료 영화</PageTitle>
          <PageSub>사용자 화면에 인증 뱃지가 붙는 영화 목록</PageSub>
        </div>
        <PageSub as="span">총 {total.toLocaleString()}건</PageSub>
      </div>

      <SummaryCards items={summary} />

      <div className={ui.filterBar}>
        <IconFilter size={14} />
        <SelectField
          id="approved-genre"
          className={ui.filterSelect}
          ariaLabel="장르 필터"
          placeholder="장르 전체"
          value={genreFilter}
          options={allGenres.map((g) => ({ value: g, label: g }))}
          onChange={(v) => {
            setGenreFilter(v);
            setPage(1);
          }}
        />

        <Divider orientation="vertical" />

        <TextFieldRoot className={ui.filterSearch} value={search} onValueChange={(v) => {
          setSearch(v);
          setPage(1);
        }} size="medium">
          <TextFieldPrefixIcon svg={<IconSearch />} />
          <TextFieldInput id="approved-search" type="search" placeholder="제목, 감독, 배우 검색" aria-label="제목, 감독, 배우 검색" />
        </TextFieldRoot>

        <Divider orientation="vertical" />

        <DateRangeFilter
          label="인증일시"
          from={approvedRange.from}
          to={approvedRange.to}
          onChange={(next) => {
            setApprovedRange(next);
            setPage(1);
          }}
        />
      </div>

      <div className={ui.card}>
        <MovieTable
          movies={paginated}
          variant="approved"
          emptyMessage="인증완료된 영화가 없습니다."
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
