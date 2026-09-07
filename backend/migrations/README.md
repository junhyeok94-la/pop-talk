# Pop Talk DB 마이그레이션 기준 이력

이 디렉터리는 Pop Talk의 **유일한 실행 기준 마이그레이션 디렉터리**입니다.
배치·챗봇·WAS가 같은 PostgreSQL 스키마를 사용하므로, DB DDL은 서비스별로 복제하지
않고 이곳에서만 추가·관리합니다.

## 실행 규칙

1. 새 변경은 가장 큰 번호 다음의 `NNN_설명.up.sql`로만 추가합니다.
2. 이미 dev/prd에 적용한 파일은 수정·이름 변경·재정렬하지 않습니다. 보정은 다음 번호의 새 파일로 합니다.
3. 운영 반영 전에는 `PGOPTIONS="-c search_path=${DATABASE_SCHEMA},public"`로 대상 스키마를 명시합니다.
4. 현재 dev처럼 과거 수동 적용 이력이 있는 환경에서는 목록 전체를 재실행하지 않습니다. 적용하지 않은 다음 번호 파일만 실행합니다.

## 단일 순번 이력

| 순번 | 파일 | 역할 | dev DDL 교차검증 |
| --- | --- | --- | --- |
| 001 | `001_movie_catalog.up.sql` | 영화·미디어·임베딩·작업 큐·배치 실행 이력, `popcorn_movies_service` 뷰 및 기본 트리거 | 확인 |
| 002 | `002_embedding_worker_lease.up.sql` | 임베딩 작업 lease 컬럼과 복구 인덱스 | 확인 |
| 003 | `003_schema_scoped_embedding_domain.up.sql` | 스키마별 `embedding_vector_1024` 도메인 | 확인 |
| 004 | `004_chatbot_support.up.sql` | 채팅 세션·메시지 테이블 | 확인 |
| 005 | `005_category_domain.up.sql` | 영화/화면 카테고리, 연결 테이블, `display_categories_service` 뷰 | 확인 |
| 006 | `006_reviews_movie_id_bigint.up.sql` | `reviews.movie_id`를 `popcorn_movies.id` FK로 통일 | 확인 |
| 007 | `007_auth_password.up.sql` | 비밀번호·로그인 잠금·리프레시 토큰 테이블 | 확인 |
| 008 | `008_external_reviews.up.sql` | 외부 수집 리뷰의 출처·중복 방지 컬럼 | 확인 |
| 009 | `009_was_product_features.up.sql` | 운영 영화 보정·카테고리 연결·온보딩 취향·감사 로그 | 확인 |
| 010 | `010_was_comments_and_curated_embedding_trigger.up.sql` | 009 데이터 사전 COMMENT, 운영 보정·카테고리 변경 임베딩 자동 큐잉 트리거 | 확인 |
| 011 | `011_user_onboarding_display_categories.up.sql` | 회원가입 온보딩에서 복수 선택한 화면 카테고리 ID를 users에 저장 | 신규 |
| 012 | `012_chat_session_user_uuid.up.sql` | 챗봇 세션 소유자를 `users.id(UUID)`와 연결 | 신규 |
| 013 | `013_user_onboarding_movie_categories.up.sql` | 회원가입 선호도 기준을 display_categories에서 movie_categories로 전환 | 신규 |
| 014 | `014_remove_unused_onboarding_profiles.up.sql` | 미사용 onboarding_profiles 테이블 제거, users의 영화 카테고리 배열로 단일화 | 신규 |

### 이전 분산 경로와의 일회성 매핑

이 중앙화 작업 이전에 dev에 적용된 파일은 다음 이름으로 존재했습니다. SQL 본문은 동일하므로
해당 환경에서는 새 번호 파일을 다시 실행하지 않습니다.

| 기존 위치·이름 | 중앙 이력 이름 |
| --- | --- |
| `pop_talk_batch/migrations/005_external_reviews.up.sql` | `008_external_reviews.up.sql` |
| `pop_talk/apps/api/docs/006_auth_password.up.sql` | `007_auth_password.up.sql` |
| `pop_talk_was/migrations/007_was_product_features.up.sql` | `009_was_product_features.up.sql` |
| `pop_talk_was/migrations/008_was_comments_and_curated_embedding_trigger.up.sql` | `010_was_comments_and_curated_embedding_trigger.up.sql` |

## dev 스키마 DDL 감사 결과

2026-08-11에 실제 `dev` 스키마의 컬럼·제약·뷰 정의·트리거를 읽기 전용으로 대조했습니다.

- 테이블: `admin_audit_logs`, `batch_runs`, `chat_sessions`, `chat_messages`,
  `movie_categories`, `display_categories`, 각 연결 테이블, `movie_editorial`,
  `popcorn_movies` 및 미디어·임베딩·작업 큐, `reviews`, `users`,
  `user_refresh_tokens` (`onboarding_profiles`는 014에서 제거)
- 뷰: `popcorn_movies_service`, `display_categories_service`
- 임베딩 트리거: `trg_queue_movie_embedding`,
  `trg_queue_editorial_movie_embedding`,
  `trg_queue_category_link_movie_embedding`
- 논리 삭제 보호 트리거: `trg_protect_removed_movie`
- 리뷰: `movie_id BIGINT → popcorn_movies(id)` FK, 평점 범위(0.5~5.0) 및 0.5점 단위 제약, 외부 출처 컬럼을 확인했습니다.
- 인덱스: 각 마이그레이션이 정의한 영화 검색 GIN 인덱스, 임베딩 작업 큐/lease 인덱스,
  리뷰·리프레시 토큰·카테고리 인덱스를 확인했습니다. `chat_messages`의
  `ix_chat_messages_session_created`는 현재 중앙 이력에 없는 레거시 인덱스이며,
  기존 `idx_chat_messages_session_created`와 역할이 겹칠 수 있어 사용량 확인 전에는 삭제하지 않습니다.

`users`, `reviews`의 최초 생성 DDL은 이 저장소들이 분리되기 전의
레거시 스키마에서 생성됐습니다. 현재 이력에는 이 테이블들의 **후속 변경**(006~009)만
있으므로, 완전히 빈 새 DB를 만들 때는 해당 레거시 기준 스키마를 먼저 복원해야 합니다.
그 이후에는 이 디렉터리의 001~014 순서를 따릅니다.

## 실행 예시

```bash
cd /opt/popcorn/pop_talk_was
set -a; source .env; set +a
PGOPTIONS="-c search_path=${DATABASE_SCHEMA},public" \
  psql "${DATABASE_URL/postgresql+asyncpg/postgresql}" -v ON_ERROR_STOP=1 \
  -f migrations/010_was_comments_and_curated_embedding_trigger.up.sql
```
