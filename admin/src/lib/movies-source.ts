import "server-only";

import { getPool } from "./db";
import snapshot from "./snapshot/movies.json";
import { MOCK_MOVIES, type Movie, type MovieEmbedding, type MovieMediaEntry } from "./mock";

/**
 * 영화 데이터 출처는 세 단계로 내려간다.
 *
 *  1. DATABASE_URL이 있으면 실 DB (dev 스키마)
 *  2. 없으면 스냅샷 — 실 DB에서 떠둔 300편. `npm run snapshot`으로 갱신한다
 *  3. 스냅샷도 비어 있으면 목 데이터 6편
 *
 * DB는 NCP VPC 안에 있어 SSH 터널을 거쳐야 한다. Vercel 함수에서는 터널을 쓸 수 없으므로
 * 배포본은 항상 스냅샷을 본다. 서버가 VPC 안으로 들어가면 DATABASE_URL만 넣으면 실서비스가 된다.
 */

export type { MovieSource } from "./movies-source.types";
import type { MovieSource } from "./movies-source.types";

export interface MovieData {
  movies: Movie[];
  embeddings: MovieEmbedding[];
  source: MovieSource;
  /** 스냅샷을 뜬 시각. DB 직결이면 없다. */
  capturedAt?: string;
}

type Snapshot = {
  captured_at: string;
  movies: Movie[];
  embeddings: MovieEmbedding[];
};

/** 목록 화면이 감당할 수 있는 선. 실 DB에는 6천 편 가까이 있다. */
const LIMIT = 300;

/*
 * dev.popcorn_movies_service 뷰를 쓴다. DB 담당자가 만들어둔 것으로,
 * 원장에 두 가지를 미리 붙여준다.
 *   is_embedded — bge-m3 PROFILE 임베딩이 READY이고 벡터가 실제로 있는지
 *   media       — 포스터·스틸을 jsonb 배열로 (영화당 평균 8.3개, 최대 53개)
 * 예전에는 여기서 popcorn_movie_media를 직접 조인했는데, 뷰가 같은 일을 하므로 걷어냈다.
 */
/**
 * 정보 완성도 — 무엇이 비어 있는지 세어 준다.
 *
 * 영화 정보를 KOFIC과 KMDB 두 곳에서 모아 합치는데, 어느 쪽에도 없는 값이
 * 남는다. 그 상태로 인증이 찍혀 있다(approved_by가 전부 'initial-dataset'
 * 이고 사람이 본 적이 없다). 무엇이 비었는지 보여야 운영자가 채우거나,
 * 이 상태로 인증해도 되는지 판단할 수 있다.
 *
 *   전체 5,312편 · 포스터 없음 1,086 · 출연 없음 1,438 · 줄거리 없음 266
 *
 * **DB가 아니라 여기서 계산한다.** 처음에는 popcorn_movies_service 뷰에
 * 컬럼을 붙였는데, 그 뷰는 DB 담당자가 만든 것이라 우리가 갈아치우면 그쪽이
 * 다시 만들 때 조용히 사라진다. 완성도는 admin 검수 화면에서만 보는 값이고
 * fe도 apps/api도 쓰지 않으므로, 우리 조회 안에 두는 것이 맞다. 기준을 고칠
 * 때도 마이그레이션 없이 배포 한 번이면 된다.
 *
 * 기준은 영화를 설명하는 컬럼 22개 전부다. 운영 컬럼(approved_by·approved_at·
 * rejection_reason)은 뺐다 — 검수 과정에서 채워지는 값이라 인증 전에 비어
 * 있는 것이 정상이고, 필수로 보면 어떤 영화도 인증할 수 없다.
 *
 * 지금 기준으로 통과하는 영화는 27편(0.5%)이다. 가장 크게 걸리는 것은
 * title_original 4,427편 — 한국 영화는 원제가 곧 한글 제목이라 KMDB가 따로
 * 주지 않는다. 그 한 줄만 빼면 461편이 된다.
 *
 * 배열은 NOT NULL이지만 빈 배열일 수 있다. array_length는 빈 배열에 0이 아니라
 * NULL을 주므로 그것으로 판정한다. 문자열은 공백만 있는 경우도 빈 것으로 본다.
 */
export const MISSING_FIELDS = `
  ARRAY_REMOVE(ARRAY[
    CASE WHEN kmdb_id IS NULL OR btrim(kmdb_id) = ''                 THEN 'kmdb_id' END,
    CASE WHEN title_ko IS NULL OR btrim(title_ko) = ''               THEN 'title_ko' END,
    CASE WHEN title_en IS NULL OR btrim(title_en) = ''               THEN 'title_en' END,
    CASE WHEN title_original IS NULL OR btrim(title_original) = ''   THEN 'title_original' END,
    CASE WHEN release_date IS NULL                                    THEN 'release_date' END,
    CASE WHEN production_year IS NULL                                 THEN 'production_year' END,
    CASE WHEN runtime_minutes IS NULL                                 THEN 'runtime_minutes' END,
    CASE WHEN movie_type IS NULL OR btrim(movie_type) = ''            THEN 'movie_type' END,
    CASE WHEN production_status IS NULL OR btrim(production_status) = '' THEN 'production_status' END,
    CASE WHEN array_length(production_countries, 1) IS NULL           THEN 'production_countries' END,
    CASE WHEN representative_country IS NULL OR btrim(representative_country) = '' THEN 'representative_country' END,
    CASE WHEN array_length(genres, 1) IS NULL                         THEN 'genres' END,
    CASE WHEN representative_genre IS NULL OR btrim(representative_genre) = '' THEN 'representative_genre' END,
    CASE WHEN array_length(directors, 1) IS NULL                      THEN 'directors' END,
    CASE WHEN array_length(director_names_en, 1) IS NULL              THEN 'director_names_en' END,
    CASE WHEN array_length(actors, 1) IS NULL                         THEN 'actors' END,
    CASE WHEN array_length(actor_roles, 1) IS NULL                    THEN 'actor_roles' END,
    CASE WHEN array_length(production_companies, 1) IS NULL           THEN 'production_companies' END,
    CASE WHEN viewing_grade IS NULL OR btrim(viewing_grade) = ''      THEN 'viewing_grade' END,
    CASE WHEN poster_url IS NULL OR btrim(poster_url) = ''            THEN 'poster_url' END,
    CASE WHEN plot IS NULL OR btrim(plot) = ''                        THEN 'plot' END,
    CASE WHEN array_length(source_keywords, 1) IS NULL                THEN 'source_keywords' END
  ], NULL)`;

/** 화면이 받는 두 값. 목록을 두 번 만들지 않도록 한 곳에서 엮는다. */
export const COMPLETENESS = `
  ${MISSING_FIELDS} AS missing_fields,
  cardinality(${MISSING_FIELDS}) = 0 AS is_complete`;

/**
 * 별칭으로 자동 분류된 카테고리.
 *
 * movie_categories.match_keywords에 적은 낱말이 이 영화의 source_keywords에 있으면
 * 그 카테고리에 든다(마이그레이션 007). 영화 하나하나에 손으로 붙이지 않아도
 * 되는 유일한 수단이다 — 5,312편을 클릭할 수는 없다.
 *
 * **수동 카테고리(movie.categories)와 섞지 않는다.** 그쪽은 운영자가 영화에
 * 직접 붙이는 값이고 이쪽은 규칙이 만든 값이다. 한 자리에 합치면 무엇을
 * 사람이 정했고 무엇이 자동인지 구분할 수 없고, 별칭을 고쳤을 때 왜 목록이
 * 바뀌었는지 알 수 없다.
 *
 * 꺼진 카테고리(is_active = false)는 뺀다. 사용자 화면에서 사라진 분류가
 * 검수 화면에만 남아 있으면 어긋나 보인다.
 *
 * **aliases가 아니라 match_keywords다**(마이그레이션 013). 두 칸의 용도가
 * 다르다 — aliases는 WAS의 의미 검색용 어구('소설 원작')이고, 이쪽은
 * source_keywords와 정확히 맞아야 하는 표기('소설원작')다. 한 칸을 함께
 * 쓰다가 WAS의 시드가 덮어써 분류가 343편에서 124편으로 떨어진 적이 있다.
 *
 * 조회할 때마다 계산한다. 낱말을 고치면 다음 조회부터 바로 반영되고, 새
 * 영화가 들어와도 같은 낱말이면 저절로 들어온다. 쌓아두는 방식이면 둘 다
 * 배치를 돌려야 한다.
 */
export const AUTO_CATEGORIES = `
  COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object('code', c.code, 'name', c.name, 'type', c.type)
             ORDER BY c.type, c.sort_order, c.code
           )
      FROM dev.movie_categories c
     WHERE c.is_active
       AND c.match_keywords && s.source_keywords
  ), '[]'::jsonb) AS auto_categories`;

/**
 * 운영자가 손으로 붙인 카테고리 코드들.
 *
 * 자동 분류(AUTO_CATEGORIES)와 섞지 않는다 — 그쪽은 별칭 규칙이 만든 값이고
 * 이쪽은 사람의 판단이다. 섞으면 무엇을 사람이 정했는지 알 수 없어지고,
 * 별칭을 고쳤을 때 사람이 붙인 것까지 흔들린다.
 *
 * movie_category_links는 005부터 있던 테이블인데 지금까지 0건이었다.
 * 영화 상세의 '정보 수정'이 저장하는 곳이 없어 화면 상태로만 돌았다.
 */
export const MANUAL_CATEGORIES = `
  COALESCE((
    SELECT array_agg(c.code ORDER BY c.sort_order, c.code)
      FROM dev.movie_category_links l
      JOIN dev.movie_categories c ON c.id = l.category_id
     WHERE l.movie_id = s.id
  ), '{}') AS categories`;

export const MOVIE_COLUMNS = `
  id, kofic_movie_cd, kmdb_id, kmdb_matched,
  title_ko, title_en, title_original,
  to_char(release_date, 'YYYY-MM-DD') as release_date,
  production_year, runtime_minutes, movie_type, production_status,
  production_countries, representative_country,
  genres, representative_genre,
  directors, director_names_en, actors, actor_roles,
  production_companies, viewing_grade,
  poster_url, plot, source_keywords,
  service_status, approval_status, approved_by,
  to_char(approved_at, 'YYYY-MM-DD HH24:MI:SS') as approved_at,
  rejection_reason, source_system,
  to_char(source_synced_at, 'YYYY-MM-DD HH24:MI:SS') as source_synced_at,
  to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
  to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
  is_embedded, media,
  ${COMPLETENESS},
  ${AUTO_CATEGORIES},
  ${MANUAL_CATEGORIES}
`;

export const MOVIE_QUERY = `
  select ${MOVIE_COLUMNS}
  -- 별칭 하위 질의가 이 행의 source_keywords를 봐야 해서 이름을 붙인다.
  from dev.popcorn_movies_service s
  order by release_date desc, id desc
  limit $1
`;

export const EMBEDDING_QUERY = `
  select e.id, e.movie_id, e.document_type, e.chunk_no, e.embedding_model,
         e.status, e.content_hash, e.attempts, e.last_error,
         to_char(e.embedded_at, 'YYYY-MM-DD HH24:MI:SS') as embedded_at,
         to_char(e.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at
  from dev.popcorn_movie_embeddings e
  where e.movie_id = any($1::bigint[])
`;

/**
 * DB row는 카테고리·팝콘점수를 갖고 있지 않다. 아직 컬럼이 없다.
 * 화면이 기대하는 모양으로 맞춰준다.
 */
function toMovie(row: Record<string, unknown>): Movie {
  const media = (row.media as MovieMediaEntry[] | null) ?? [];
  return {
    ...(row as unknown as Movie),
    id: Number(row.id),
    media,
    // poster_url이 비어도 media에 대표 포스터가 있는 경우가 35편 있다.
    poster_url:
      (row.poster_url as string | null) ??
      media.find((m) => m.type === "POSTER" && m.primary)?.url,
    categories: (row.categories as string[]) ?? [],
    auto_categories: (row.auto_categories as Movie["auto_categories"]) ?? [],
    pop_talk_score: undefined,
  };
}

async function fromDatabase(): Promise<MovieData | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query(MOVIE_QUERY, [LIMIT]);
    const movies = rows.map(toMovie);
    const ids = movies.map((m) => m.id);
    const embeddings = ids.length
      ? (await pool.query(EMBEDDING_QUERY, [ids])).rows.map((r) => ({
          ...r,
          id: Number(r.id),
          movie_id: Number(r.movie_id),
        }))
      : [];
    return { movies, embeddings, source: "database" };
  } catch (error) {
    // 터널이 닫혀 있으면 흔히 여기로 온다. 화면을 죽이지 않고 스냅샷으로 내려간다.
    console.warn("[movies-source] DB 조회 실패, 스냅샷으로 대체합니다:", error);
    return null;
  }
}

export async function loadMovieData(): Promise<MovieData> {
  const fromDb = await fromDatabase();
  if (fromDb) return fromDb;

  // JSON 리터럴 타입은 nullable 필드 때문에 Movie와 바로 겹치지 않는다.
  const snap = snapshot as unknown as Snapshot;
  if (snap.movies.length > 0) {
    return {
      movies: snap.movies,
      embeddings: snap.embeddings,
      source: "snapshot",
      capturedAt: snap.captured_at,
    };
  }

  return { movies: MOCK_MOVIES, embeddings: [], source: "mock" };
}
