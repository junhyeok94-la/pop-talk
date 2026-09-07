from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.database import get_pool
from app.problems import ProblemError
from app.schemas import MovieSort
from app.security import require_admin

router = APIRouter(tags=["movies"], dependencies=[Depends(require_admin)])
MOVIE_COLUMNS = """id,kofic_movie_cd,kmdb_id,kmdb_matched,title_ko,title_en,title_original,
to_char(release_date,'YYYY-MM-DD') release_date,production_year,runtime_minutes,movie_type,production_status,
production_countries,representative_country,genres,representative_genre,directors,director_names_en,actors,actor_roles,
production_companies,viewing_grade,poster_url,
COALESCE((SELECT plot_override FROM movie_editorial WHERE movie_id=id), plot) AS plot,
(SELECT COALESCE(array_agg(category_id ORDER BY category_id), '{}'::bigint[]) FROM movie_category_links WHERE movie_id=id) AS category_ids,
source_keywords,service_status,approval_status,approved_by,
to_char(approved_at,'YYYY-MM-DD HH24:MI:SS') approved_at,rejection_reason,source_system,
to_char(source_synced_at,'YYYY-MM-DD HH24:MI:SS') source_synced_at,to_char(created_at,'YYYY-MM-DD HH24:MI:SS') created_at,
to_char(updated_at,'YYYY-MM-DD HH24:MI:SS') updated_at"""
MOVIE_SORT = {"release_date:desc":"release_date desc,id desc","release_date:asc":"release_date asc,id asc","created_at:desc":"created_at desc,id desc","popcorn_score:desc":"release_date desc,id desc"}


def _records(rows) -> list[dict]:
    return [{k: (int(v) if k == "id" else v) for k, v in dict(row).items() if k != "full_count"} for row in rows]


@router.get("/movies", summary="서비스 영화 목록 조회", description="관리자가 서비스용 영화 목록을 필터·정렬해 조회합니다. 공개 여부와 검수 상태를 함께 확인할 수 있습니다.")
async def movies(page: Annotated[int, Query(ge=1)] = 1, size: Annotated[int, Query(ge=1, le=100)] = 10,
                 approval_status: str | None = None, service_status: str | None = None, genre: str | None = None,
                 q: str | None = None, synced_from: str | None = None, synced_to: str | None = None,
                 approved_from: str | None = None, approved_to: str | None = None,
                 sort: MovieSort = "release_date:desc"):
    conditions, args = [], []
    def add(clause, value):
        args.append(value); conditions.append(clause.format(len(args)))
    if approval_status:
        statuses = [s.strip() for s in approval_status.split(",") if s.strip()]
        if statuses: add("approval_status = any(${})", statuses)
    if service_status: add("service_status = ${}", service_status)
    if genre: add("${} = any(genres)", genre)
    if q:
        add("(title_ko ilike ${0} or title_en ilike ${0} or title_original ilike ${0} or exists(select 1 from unnest(directors) d where d ilike ${0}) or exists(select 1 from unnest(actors) a where a ilike ${0}))", f"%{q}%")
    for value, column, op in ((synced_from,"source_synced_at",">="),(synced_to,"source_synced_at","<="),(approved_from,"approved_at",">="),(approved_to,"approved_at","<=")):
        if value: add(f"{column}::date {op} ${{}}", value)
    where = " where " + " and ".join(conditions) if conditions else ""
    args.extend([size, (page-1)*size])
    pool = await get_pool()
    rows = await pool.fetch(f"select {MOVIE_COLUMNS},is_embedded,media,count(*) over() full_count from popcorn_movies_service{where} order by {MOVIE_SORT[sort]} limit ${len(args)-1} offset ${len(args)}", *args)
    total = int(rows[0]["full_count"]) if rows else 0
    summary = await pool.fetchrow("select count(*) total,count(*) filter(where service_status='PUBLISHED') published,count(*) filter(where approval_status='PENDING') pending,count(*) filter(where approval_status='APPROVED') approved,count(*) filter(where approval_status='REJECTED') rejected from popcorn_movies_service")
    return {"page":page,"size":size,"total":total,"total_pages":0 if not total else (total+size-1)//size,"items":_records(rows),"summary":dict(summary)}


@router.get("/movies/{movie_id}", summary="서비스 영화 상세 조회", description="관리자가 서비스용 영화 한 건의 수집·검수·편집 상태를 조회합니다.")
async def movie(movie_id: int):
    pool = await get_pool(); row = await pool.fetchrow(f"select {MOVIE_COLUMNS},is_embedded,media from popcorn_movies_service where id=$1", movie_id)
    if not row: raise ProblemError(404, "Movie Not Found", f"id={movie_id}")
    return _records([row])[0]
