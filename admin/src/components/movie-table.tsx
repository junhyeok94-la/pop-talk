"use client";

import {
  ContentPlaceholderRoot,
  VisuallyHidden,
} from "@seed-design/react";
import { useRouter } from "next/navigation";

import { DateTimeCell } from "@/components/date-time-cell";
import { AdminChip } from "@/components/movie-cell";
import { MoviePoster } from "@/components/movie-poster";
import { ServiceBadge, StatusBadge } from "@/components/status-badge";
import { StateBadge } from "@/components/state-badge";
import { isCompletenessKnown, missingCount, missingLabels } from "@/lib/movie-fields";
import { directorOf, gradeLabel, releaseYearOf, type Movie } from "@/lib/mock";
import { IconChevronRight, IconFlag } from "@/lib/icons";
import ui from "@/styles/ui.module.css";
import styles from "./movie-table.module.css";

/**
 * 서비스 영화와 인증완료 영화가 같은 표를 쓴다. 예전에는 컬럼 구성도 순서도 달라
 * 같은 영화를 두 화면에서 다르게 읽어야 했다.
 *
 * 두 화면의 차이는 딱 두 가지다.
 *  - 서비스 영화: 수집일시 + "검토" 버튼
 *  - 인증완료 영화: 인증일시 + 인증자 + "상세" 버튼
 */
export type MovieTableVariant = "review" | "approved";

export function MovieTable({
  movies,
  variant,
  emptyMessage,
}: {
  movies: Movie[];
  variant: MovieTableVariant;
  emptyMessage: string;
}) {
  const router = useRouter();
  const isApproved = variant === "approved";
  // 정보 완성도 열이 하나 늘었다(008).
  const colSpan = isApproved ? 13 : 12;

  return (
    <table className={ui.table}>
      <thead>
        <tr>
          <th>포스터</th>
          <th>제목</th>
          <th>연도</th>
          <th>등급</th>
          <th>팝콘점수</th>
          <th>정보</th>
          <th>카테고리</th>
          <th>장르</th>
          <th>상태</th>
          <th>노출 상태</th>
          <th>{isApproved ? "인증일시" : "수집일시"}</th>
          {isApproved && <th>인증자</th>}
          <th>
            <VisuallyHidden asChild>
              <span>동작</span>
            </VisuallyHidden>
          </th>
        </tr>
      </thead>
      <tbody>
        {movies.length === 0 && (
          <tr>
            <td colSpan={colSpan}>
              <ContentPlaceholderRoot>{emptyMessage}</ContentPlaceholderRoot>
            </td>
          </tr>
        )}
        {movies.map((movie) => (
          <tr
            key={movie.id}
            className={ui.rowLink}
            onClick={() => router.push(`/movies/${movie.id}`)}
          >
            <td>
              <MoviePoster movie={movie} />
            </td>
            <td>
              <div className={styles.title}>
                {movie.title_ko}
                {/* KMDB 매칭에 실패하면 포스터·줄거리가 비어 있을 가능성이 높다. */}
                {!movie.kmdb_matched && (
                  <span className={styles.unmatched} title="KMDB 매칭 실패">
                    <IconFlag size={11} />
                    <VisuallyHidden asChild>
                      <span>KMDB 매칭 실패</span>
                    </VisuallyHidden>
                  </span>
                )}
              </div>
              <div className={ui.muted}>
                {directorOf(movie)}
                {movie.representative_country && ` · ${movie.representative_country}`}
              </div>
            </td>
            <td>
              {releaseYearOf(movie)}
              {/* 300편 중 42편만 개봉예정이다. '개봉'은 기본값이라 적지 않는다. */}
              {movie.production_status === "개봉예정" && (
                <div className={styles.upcoming}>개봉예정</div>
              )}
            </td>
            <td>
              <span className={ui.tagNeutral}>{gradeLabel(movie)}</span>
            </td>
            <td>
              <span className={ui.score}>{movie.pop_talk_score ?? "—"}</span>
            </td>
            {/*
              정보 완성도. 뷰가 세어 준 결과다(마이그레이션 008).
              목록에는 개수만 두고 무엇이 비었는지는 마우스를 올리면 나온다 —
              열 하나에 이름을 다 늘어놓으면 표가 무너진다.
              스냅샷·목으로 돌 때는 값이 없어 —로 둔다.
            */}
            <td>
              {!isCompletenessKnown(movie) ? (
                <span className={ui.muted}>—</span>
              ) : missingCount(movie) === 0 ? (
                <StateBadge tone="positive">완성</StateBadge>
              ) : (
                <span title={missingLabels(movie).join(" · ")}>
                  <StateBadge tone="warning">{missingCount(movie)}개 부족</StateBadge>
                </span>
              )}
            </td>
            {/*
              카테고리 열에는 손으로 붙인 것을 먼저 보여주고, 없으면 별칭이
              자동 분류한 것을 보여준다. 자동인 쪽은 마우스를 올리면 '별칭
              기준'이라고 알려, 운영자가 붙인 것으로 오해하지 않게 한다.
            */}
            <td>
              <div className={ui.tagRow}>
                {movie.categories.slice(0, 1).map((c) => (
                  <span key={c} className={ui.tag}>
                    {c}
                  </span>
                ))}
                {movie.categories.length > 1 && (
                  <span className={ui.muted}>+{movie.categories.length - 1}</span>
                )}
                {movie.categories.length === 0 &&
                  (movie.auto_categories?.length ? (
                    <span title={`별칭 기준 자동 분류 · ${movie.auto_categories.map((c) => c.name).join(", ")}`}>
                      <span className={ui.tagNeutral}>{movie.auto_categories[0].name}</span>
                      {movie.auto_categories.length > 1 && (
                        <span className={ui.muted}>+{movie.auto_categories.length - 1}</span>
                      )}
                    </span>
                  ) : (
                    <span className={ui.muted}>—</span>
                  ))}
              </div>
            </td>
            <td>
              <div className={ui.tagRow}>
                {movie.genres.map((g) => (
                  <span key={g} className={ui.tagNeutral}>
                    {g}
                  </span>
                ))}
              </div>
            </td>
            <td>
              <StatusBadge status={movie.approval_status} />
              {/* 반려 사유는 반려 행에만 있다. 컬럼을 따로 두면 대부분 빈칸이 된다. */}
              {movie.approval_status === "REJECTED" && movie.rejection_reason && (
                <div className={styles.reason} title={movie.rejection_reason}>
                  {movie.rejection_reason}
                </div>
              )}
            </td>
            {/* service_status는 approval_status와 별개 컬럼이다. 화면에서 바꾸는 길은
                없애고 값만 보여준다. 배치나 DB로 바뀔 수 있어 표시는 남긴다. */}
            <td>
              <ServiceBadge status={movie.service_status} />
            </td>
            <td>
              <DateTimeCell value={isApproved ? movie.approved_at : movie.source_synced_at} />
            </td>
            {isApproved && (
              <td>
                <AdminChip name={movie.approved_by} />
              </td>
            )}
            <td>
              <button
                type="button"
                className={ui.textButton}
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/movies/${movie.id}`);
                }}
              >
                {isApproved ? "상세" : "검토"}
                <IconChevronRight size={11} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
