/*
 * 실 DB에서 영화 300편을 떠서 src/lib/snapshot/movies.json에 저장한다.
 *
 * DB는 NCP VPC 안에 있어 SSH 터널이 필요하다. 터널을 먼저 열고 실행한다.
 *
 *   ssh -i <key.pem> -N -L 15432:pg-49hqo3.vpc-cdb-kr.ntruss.com:5432 root@<bastion>
 *   DATABASE_URL='postgresql://popcorn_admin:<비번>@localhost:15432/popcorndb' npm run snapshot
 *
 * 비밀번호는 여기 적지 않는다. 환경변수로만 받는다.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const LIMIT = Number(process.env.SNAPSHOT_LIMIT ?? 300);
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/lib/snapshot/movies.json",
);

const MOVIE_QUERY = `
  select
    m.id, m.kofic_movie_cd, m.kmdb_id, m.kmdb_matched,
    m.title_ko, m.title_en, m.title_original,
    to_char(m.release_date, 'YYYY-MM-DD') as release_date,
    m.production_year, m.runtime_minutes, m.movie_type, m.production_status,
    m.production_countries, m.representative_country,
    m.genres, m.representative_genre,
    m.directors, m.director_names_en, m.actors, m.actor_roles,
    m.production_companies, m.viewing_grade,
    coalesce(m.poster_url, p.url) as poster_url,
    m.plot, m.source_keywords,
    m.service_status, m.approval_status, m.approved_by,
    to_char(m.approved_at, 'YYYY-MM-DD HH24:MI:SS') as approved_at,
    m.rejection_reason, m.source_system,
    to_char(m.source_synced_at, 'YYYY-MM-DD HH24:MI:SS') as source_synced_at,
    to_char(m.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
    to_char(m.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at
  from dev.popcorn_movies m
  left join dev.popcorn_movie_media p
    on p.movie_id = m.id and p.media_type = 'POSTER' and p.is_primary
  order by m.release_date desc, m.id desc
  limit $1
`;

const EMBEDDING_QUERY = `
  select e.id, e.movie_id, e.document_type, e.chunk_no, e.embedding_model,
         e.status, e.content_hash, e.attempts, e.last_error,
         to_char(e.embedded_at, 'YYYY-MM-DD HH24:MI:SS') as embedded_at,
         to_char(e.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at
  from dev.popcorn_movie_embeddings e
  where e.movie_id = any($1::bigint[])
`;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL이 필요합니다. 터널을 열고 다시 실행하세요.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 8000,
});

try {
  const { rows } = await pool.query(MOVIE_QUERY, [LIMIT]);
  // DB에 아직 없는 컬럼(카테고리·팝콘점수)은 화면이 기대하는 빈 모양으로 채운다.
  const movies = rows.map((r) => ({ ...r, id: Number(r.id), categories: [] }));
  const ids = movies.map((m) => m.id);

  const embeddings = ids.length
    ? (await pool.query(EMBEDDING_QUERY, [ids])).rows.map((r) => ({
        ...r,
        id: Number(r.id),
        movie_id: Number(r.movie_id),
      }))
    : [];

  const payload = {
    captured_at: new Date().toISOString().replace("T", " ").slice(0, 19),
    movies,
    embeddings,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(payload, null, 1)}\n`);

  const withPoster = movies.filter((m) => m.poster_url).length;
  console.log(`영화 ${movies.length}편 저장 (포스터 ${withPoster}편, 임베딩 ${embeddings.length}건)`);
  console.log(`→ ${OUT}`);
} finally {
  await pool.end();
}
