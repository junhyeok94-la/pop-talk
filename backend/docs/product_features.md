# WAS 제품 기능과 데이터 구조

## 적용할 마이그레이션

새 환경은 `009_was_product_features.up.sql`과
`010_was_comments_and_curated_embedding_trigger.up.sql`을 순서대로 한 번씩 적용합니다.
이미 `009`을 적용한 dev 환경에는 `010`만 적용하면 됩니다. `010`은 `009`에서 새로
도입한 컬럼의 DB 설명(COMMENT)을 등록하고, 운영자 보정 정보의 임베딩 큐 자동 등록
트리거를 추가합니다.

```bash
cd /opt/popcorn/pop_talk_was
set -a; source .env; set +a
PGOPTIONS="-c search_path=${DATABASE_SCHEMA},public" \
  psql "${DATABASE_URL/postgresql+asyncpg/postgresql}" -v ON_ERROR_STOP=1 \
  -f migrations/010_was_comments_and_curated_embedding_trigger.up.sql
```

## 007에서 추가한 데이터

| 대상 | 목적 |
| --- | --- |
| `movie_editorial` | 배치 수집 원본을 바꾸지 않고 운영자가 줄거리(`plot_override`)를 보정하거나, 잘못된 영화 한 건을 논리 삭제(`is_removed`)하기 위한 테이블입니다. |
| `movie_category_links` | KOFIC/KMDB 장르와 별개로 Pop Talk가 직접 운영하는 카테고리와 영화의 연결 정보입니다. |
| `users.onboarding_movie_category_ids` | 회원가입 화면에서 복수 선택한 활성 `movie_categories.id` 목록입니다. 선택지를 제출한 신규 회원은 `onboarding_status=COMPLETED`로 생성됩니다. |
| `reviews_half_star_increment_check` | 서비스 회원 리뷰의 평점이 0.5~5.0 범위의 0.5점 단위인지 DB에서도 검증합니다. |
| `admin_audit_logs` | 관리자 영화·카테고리·리뷰 관리 작업의 누가/언제/무엇을 변경했는지 남기는 감사 로그입니다. |

각 테이블과 컬럼의 상세 설명은 PostgreSQL의 `COMMENT`로도 등록됩니다. 예를 들어 psql에서는
`\d+ movie_editorial`, `\d+ users`로 확인할 수 있습니다.

## 영화 노출과 임베딩 정책

- 프론트엔드(3000)의 `GET /catalog/movies`와 `GET /catalog/movies/{movie_id}`는 로그인 여부와 관계없이 **모든 영화**를 보여줍니다.
- 단, 관리자가 논리 삭제한 영화(`movie_editorial.is_removed=true`)만 목록·상세·리뷰 작성에서 제외합니다.
- 응답의 `approval_status`와 `is_verified`를 사용해 프론트엔드에서 검수 완료 인증 마크를 표시합니다. `is_verified=true`는 `approval_status=APPROVED`와 같습니다.
- `/catalog`은 관리자 API와 분리한 프론트엔드용 공개 카탈로그라는 의미이므로 유지합니다. 관리자 페이지(3100)는 `/movies`, `/movie-categories`, `/admin/reviews`, `/members` API를 사용합니다. 과거의 `/popcorn-movies` 원본 조회 API는 `/movies`와 같은 원본 테이블을 조회해 중복되므로 제거했습니다.
- 기존 배치 트리거 `trg_queue_movie_embedding`은 `popcorn_movies`의 수집 정보·검수 상태·서비스 상태 변경을 자동으로 임베딩 작업 큐에 넣습니다.
- `008`의 새 트리거는 `movie_editorial`과 `movie_category_links` 변경도 같은 방식으로 큐에 넣습니다. 따라서 관리자용 수동 임베딩 등록 API는 제공하지 않습니다.

## API 권한 구분

- 공개: 영화 카탈로그와 영화별 리뷰 조회
- 공개: `GET /catalog/movie-categories`로 회원가입 온보딩의 활성 취향 선택지 조회
- 회원 JWT: 회원가입, 온보딩 취향 저장·조회, 자신의 리뷰 작성·수정·삭제·조회
- 관리자 JWT(`ADMIN` 또는 `SUPER_ADMIN`): 영화 원본·서비스 목록 조회, 운영 줄거리·카테고리·검수·논리 삭제 관리, 리뷰 검수, 회원·설문 조회

회원의 온보딩 취향은 WAS의 `GET /me/preferences`로 제공됩니다. 챗봇이 로그인 사용자의
개인화 추천을 하려면 챗봇 호출 시 JWT를 검증하거나 WAS 내부 호출을 통해 이 데이터를
가져와 영화 검색 키워드에 반영하면 됩니다.

회원가입 요청의 온보딩 선택값 예시는 다음과 같습니다.

```json
{
  "email": "member@example.com",
  "password": "password123",
  "nickname": "movie fan",
  "movie_category_ids": [1, 3, 7]
}
```

`movie_category_ids`는 1~20개가 필수이며, 존재하지 않거나 비활성인 ID가 포함되면
회원 생성 없이 `422 Invalid Movie Category`를 반환합니다.
