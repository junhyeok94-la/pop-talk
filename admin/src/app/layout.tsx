import type { Metadata } from "next";
import { Inter, Noto_Sans_KR } from "next/font/google";
import "@seed-design/css/all.css";
import "./globals.css";

import { AdminStoreProvider } from "@/lib/admin-store";
import { loadBatchRuns } from "@/lib/batch-runs";
import { countReviews, listMembers } from "@/lib/members";
import { countMovies } from "@/lib/movies-query";
import { listDisplayCategories } from "@/lib/display-categories";
import { loadMovieData } from "@/lib/movies-source";
import { checkSchema } from "@/lib/schema-guard";
import { Gnb } from "@/components/gnb";
import { SnackbarProvider } from "@/components/snackbar";
import { SchemaWarning } from "@/components/schema-warning";
import { Sidebar } from "@/components/sidebar";
import styles from "./layout.module.css";

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans-kr",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

/*
 * 화면을 요청마다 다시 그린다.
 *
 * 아래 loadMovieData()가 서버에서 영화를 읽는데, 이것이 없으면 Next가 빌드할
 * 때 미리 그려 HTML로 저장한다. 그러면 **데이터가 빌드 시점에 얼어붙는다.**
 *
 * 실제로 겪은 일이다 — web-1에서 DATABASE_URL 없이 빌드한 뒤 나중에 값을
 * 넣고 재기동했더니, 배치 패널(클라이언트가 따로 부른다)만 실 DB가 되고
 * 영화는 스냅샷 그대로였다. 그 스냅샷은 300편 전부 APPROVED라 검수 화면에
 * "인증 대기 중인 영화가 없습니다"가 떴다 — 인증할 대상 자체가 없었다.
 *
 * 얼어붙는 문제는 배포 순서를 맞춰도 남는다. 배치가 밤에 새 영화를 넣으면
 * 재빌드하기 전까지 검수 목록에 나타나지 않는다. 매일 아침 빌드를 돌려야
 * 하는 화면은 관리자 콘솔로서 쓸 수 없다.
 *
 * 값은 요청마다 300행을 읽는 만큼(0.1초 남짓) 느려진다. 관리자 몇 명이
 * 쓰는 화면이라 이 비용이 신선함보다 싸다.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "팝콘톡 Admin Console",
  description: "POPCORN AI가 추천한 영화를 검수하고 인증하는 관리자 콘솔",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  /*
   * 서버에서 읽어 클라이언트 스토어의 초기값으로 넘긴다.
   *
   * 배치 이력을 여기서 읽는 이유 — 화면에서 받아오면 첫 그림에는 목이
   * 보였다가 응답이 온 뒤 실 데이터로 바뀐다. 날짜와 건수가 눈앞에서
   * 달라진다. 화면을 그리기 전에 넣으면 처음부터 옳은 값이 보인다.
   *
   * 둘을 함께 기다린다. 순서대로 하면 느린 쪽 뒤에 빠른 쪽이 줄을 선다.
   */
  const [
    { movies, embeddings, source, capturedAt },
    batchRuns,
    members,
    reviewTotal,
    movieCounts,
    displayCategories,
    schemaDrift,
  ] =
    await Promise.all([
      loadMovieData(),
      loadBatchRuns(),
      // 대시보드의 회원 카드가 쓴다. 회원 화면이 따로 받아오지만, 대시보드가
      // 목을 보면 두 화면의 숫자가 어긋난다.
      listMembers(),
      countReviews(),
      /*
       * 영화 수치는 따로 센다. loadMovieData()는 300편만 읽으므로 그것으로
       * 세면 대시보드가 "전체 영화 300"이라고 말한다 — 검수 화면은 서버에서
       * 5,312를 받아오므로 두 화면이 어긋난다.
       */
      countMovies(),
      // 화면 문구. 목으로 시작하면 첫 화면에 목 6건이 보였다가 실 데이터로 바뀐다.
      listDisplayCategories(),
      /*
       * DB 모양이 아직 우리가 기대하는 것과 같은지 본다.
       *
       * 이 DB는 여러 저장소가 함께 쓴다. 하루에 두 번 조용히 깨졌다 —
       * 별칭이 덮어써져 자동 분류가 343편에서 124편으로 줄었고, 설문
       * 테이블이 사라져 회원 상세의 설문이 늘 빈 채로 떴다. 둘 다 조회
       * 실패를 null로 삼키는 바람에 오류가 보이지 않았다.
       *
       * 여기서 부르는 이유 — 화면마다 검사하면 그 화면을 열어야 알고,
       * 열 번 왕복한다. layout은 어차피 요청마다 도니 한 번만 물어보면 된다.
       */
      checkSchema(),
    ]);

  return (
    <html
      lang="ko"
      data-seed=""
      data-seed-color-mode="light-only"
      data-seed-user-color-scheme="light"
      className={`${notoSansKr.variable} ${inter.variable}`}
    >
      <body>
        <AdminStoreProvider
            initialMovies={movies}
            initialEmbeddings={embeddings}
            initialBatchRuns={batchRuns.items}
            initialMembers={members ?? undefined}
            initialReviewTotal={reviewTotal ?? undefined}
            initialMovieCounts={movieCounts ?? undefined}
            initialCategories={displayCategories ?? undefined}
            source={source}
            capturedAt={capturedAt}
          >
          <SnackbarProvider>
            <div className={styles.shell}>
            <Sidebar />
            <div className={styles.column}>
              <Gnb />
              {/* 어긋난 것이 없으면 아무것도 그리지 않는다. */}
              <SchemaWarning drift={schemaDrift ?? []} />
              <main className={styles.main}>{children}</main>
            </div>
            </div>
          </SnackbarProvider>
        </AdminStoreProvider>
      </body>
    </html>
  );
}
