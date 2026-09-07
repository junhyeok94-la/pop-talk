-- 006: 비밀번호 로그인 지원
--
-- 전제: dev.users는 이미 존재하며 id가 uuid다.
--   id(uuid) · email · nickname · profile_image_url · status · onboarding_status
--   · last_login_at · created_at · updated_at · deleted_at · role
--
-- 005_user_domain.up.sql(apps/admin/docs)은 실행되지 않은 초안이고 id를 bigserial로
-- 잡고 있어 실제 테이블과 다르다. 이 파일이 실제 스키마 기준이다.
--
-- 실행:
--   psql "$DATABASE_URL" -f apps/api/docs/006_auth_password.up.sql

begin;

set search_path to dev;

-- ── 1. 비밀번호 ────────────────────────────────────────────────────────────
-- bcrypt 해시는 60자지만 알고리즘을 바꿀 여지를 두고 255로 잡는다.
-- 소셜 로그인만 쓰는 회원은 계속 NULL이다 — NOT NULL을 걸면 안 된다.
alter table users add column if not exists hashed_password varchar(255);

-- ── 2. 연속 로그인 실패 잠금 ────────────────────────────────────────────────
-- 백엔드가 2대라 프로세스 메모리에 둘 수 없고, ACG에 6379(Redis)가 없어
-- 공유 저장소가 이 DB뿐이다. 그래서 컬럼으로 둔다.
alter table users add column if not exists failed_login_count integer not null default 0;
alter table users add column if not exists locked_until timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ck_users_failed_login_count'
  ) then
    alter table users
      add constraint ck_users_failed_login_count check (failed_login_count >= 0);
  end if;
end $$;

-- ── 3. 리프레시 토큰 ───────────────────────────────────────────────────────
-- 토큰 원문은 저장하지 않는다. DB가 유출되면 그대로 남의 세션이 되기 때문에
-- sha256 해시(32바이트)만 남기고 검증할 때 같은 방식으로 해시해 비교한다.
--
-- user_id는 uuid다 (005 초안의 bigint가 아니다 — users.id가 uuid라서).
create table if not exists user_refresh_tokens (
    id           bigserial   not null,
    user_id      uuid        not null,

    token_hash   bytea       not null,

    issued_at    timestamptz not null default current_timestamp,
    expires_at   timestamptz not null,

    -- 회전(rotation) 흔적. 갱신하면 옛 토큰을 폐기하고 새 토큰 id를 여기 적는다.
    -- 이미 폐기된 토큰이 다시 들어오면 탈취로 보고 그 계정 토큰을 전부 폐기한다.
    revoked_at   timestamptz,
    replaced_by  bigint,

    user_agent   varchar(500),
    ip           inet,

    created_at   timestamptz not null default current_timestamp,

    constraint user_refresh_tokens_pkey primary key (id),
    constraint uq_user_refresh_tokens_hash unique (token_hash),
    constraint fk_user_refresh_tokens_user
        foreign key (user_id) references users(id) on delete cascade,
    constraint fk_user_refresh_tokens_replaced_by
        foreign key (replaced_by) references user_refresh_tokens(id) on delete set null,
    constraint ck_user_refresh_tokens_expiry check (expires_at > issued_at)
);

-- 로그인 검증에서 가장 자주 타는 경로 — 살아있는 토큰만 본다.
create index if not exists idx_user_refresh_tokens_user
    on user_refresh_tokens (user_id) where revoked_at is null;

-- 만료 토큰 정리 배치용.
create index if not exists idx_user_refresh_tokens_expires
    on user_refresh_tokens (expires_at);

commit;

-- ── 최초 관리자 계정 만들기 ─────────────────────────────────────────────────
-- 해시 생성:
--   yarn workspace @pop-talk/api hash-password '원하는비밀번호8자이상'
--
-- 이미 있는 계정에 비밀번호만 붙이는 경우:
--   update dev.users set hashed_password = '<해시>', role = 'SUPER_ADMIN'
--    where email = 'admin@popcorn.kr';
--
-- 새로 만드는 경우:
--   insert into dev.users (email, nickname, role, hashed_password)
--   values ('admin@popcorn.kr', '관리자', 'SUPER_ADMIN', '<해시>');
