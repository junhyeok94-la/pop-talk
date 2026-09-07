from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.database import get_pool
from app.movie_category_preferences import fetch_user_preferences
from app.problems import ProblemError
from app.schemas import MemberSort, MemberStatus
from app.security import require_admin

router = APIRouter(prefix="/members", tags=["members"], dependencies=[Depends(require_admin)])
COLS="id,email,nickname,profile_image_url,status,onboarding_status,onboarding_movie_category_ids,role,to_char(last_login_at,'YYYY-MM-DD HH24:MI:SS') last_login_at,to_char(created_at,'YYYY-MM-DD HH24:MI:SS') joined_at,to_char(updated_at,'YYYY-MM-DD HH24:MI:SS') updated_at,to_char(deleted_at,'YYYY-MM-DD HH24:MI:SS') deleted_at"
SORT={"joined_at:desc":"created_at desc,id desc","joined_at:asc":"created_at asc,id asc","last_login_at:desc":"last_login_at desc nulls last,id desc","nickname:asc":"nickname asc,id asc"}


def member(row):
    result = {**dict(row),"id":str(row["id"]),"status_updated_by":None,"status_updated_at":None,"status_reason":None}
    result["movie_category_ids"] = [int(value) for value in (result.pop("onboarding_movie_category_ids", []) or [])]
    return result


@router.get("", summary="회원 목록 조회", description="관리자가 회원 목록과 가입·상태 요약을 조회합니다.")
async def members(page: Annotated[int,Query(ge=1)]=1,size:Annotated[int,Query(ge=1,le=100)]=10,status:MemberStatus|None=None,q:str|None=None,joined_from:str|None=None,joined_to:str|None=None,role:str|None=None,include_deleted:bool=False,sort:MemberSort="joined_at:desc"):
    conditions=[] if include_deleted else ["deleted_at is null"]; args=[]
    def add(template,value): args.append(value); conditions.append(template.format(len(args)))
    if status:add("status=${}",status)
    if role:add("role=${}",role)
    if joined_from:add("created_at::date >= ${}",joined_from)
    if joined_to:add("created_at::date <= ${}",joined_to)
    if q:add("(nickname ilike ${0} or email ilike ${0})",f"%{q}%")
    where=" where "+" and ".join(conditions) if conditions else ""; args.extend([size,(page-1)*size]); pool=await get_pool()
    rows=await pool.fetch(f"select {COLS},count(*) over() full_count from users{where} order by {SORT[sort]} limit ${len(args)-1} offset ${len(args)}",*args)
    total=int(rows[0]["full_count"]) if rows else 0
    summary=await pool.fetchrow("select count(*) total,count(*) filter(where status='ACTIVE') active,count(*) filter(where status='SUSPENDED') suspended,count(*) filter(where status='WITHDRAWN') withdrawn from users"+("" if include_deleted else " where deleted_at is null"))
    return {"page":page,"size":size,"total":total,"total_pages":0 if not total else (total+size-1)//size,"items":[member(r) for r in rows],"summary":dict(summary)}


@router.get("/{member_id}", summary="회원 상세 조회", description="관리자가 UUID로 회원 한 명의 기본 정보를 조회합니다.")
async def get_member(member_id:UUID):
    pool=await get_pool(); row=await pool.fetchrow(f"select {COLS} from users where id=$1",member_id)
    if not row: raise ProblemError(404,"Member Not Found",f"id={member_id}")
    return member(row)


@router.get("/{member_id}/survey", summary="회원 온보딩 취향 조회", description="관리자가 특정 회원이 선택한 영화 카테고리와 온보딩 상태를 조회합니다.")
async def get_member_survey(member_id: UUID):
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await fetch_user_preferences(conn, member_id)
