# 팝콘톡 Admin API 명세

관리자 콘솔이 쓰는 API입니다. 화면 10개가 실제로 호출하는 것만 담았습니다.

| 항목 | 값 |
|---|---|
| 버전 | 0.1.0 |
| 엔드포인트 | 35개 |
| 명세 읽기 | https://poptalkadmin.vercel.app/api-docs.html |
| 직접 호출 | https://poptalkadmin.vercel.app/api-swagger.html |
| 관리자 화면 | https://poptalkadmin.vercel.app |
| 원본 | `docs/openapi.yaml` (GitHub) |

> **이 페이지는 `openapi.yaml`에서 자동 생성했습니다.**<br>여기서 직접 고치지 마세요 — 다음에 다시 생성하면 사라집니다.<br>내용을 바꾸려면 `openapi.yaml`을 고치고 `npm run docs:notion`을 다시 돌린 뒤 통째로 갈아끼우세요.

## 서버

| 주소 | 용도 |
|---|---|
| `https://api.poptalk.kr/admin/v1` | 운영 |
| `http://localhost:9000/admin/v1` | 로컬 — 직접 띄운 백엔드 (아키텍처 문서의 backend 포트 9000) |
| `http://localhost:4010` | 목 서버 — npx @stoplight/prism-cli mock docs/openapi.yaml -p 4010 |

## 공통 규약

| 항목 | 규칙 |
|---|---|
| 목록 | `page`(1부터) · `size`(기본 10, 최대 100). 응답에 `page`·`size`·`total`·`total_pages` |
| 날짜 | 날짜 `YYYY-MM-DD`, 시각 `YYYY-MM-DD HH:mm:ss` (KST) |
| 기간 필터 | `*_from` · `*_to`, 양끝 포함. 한쪽만 주면 그쪽만 제한 |
| 부분 수정 | `PATCH` + 바꿀 필드만. 빈 객체는 400 |
| 오류 | RFC 9457 `application/problem+json` |
| 인증 | `Authorization: Bearer <JWT>` 전제입니다. **다만 관리자 로그인은 이번 범위가 아니라 토큰 발급 경로가 없습니다.** 감사 정보(`approved_by`)를 무엇으로 채울지도 미정입니다 |

## 엔드포인트 한눈에 보기

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| `POST` | `/auth/login` | 로그인 ⚠️ **이번 개발 범위 아님** | 불필요 |
| `POST` | `/auth/refresh` | 액세스 토큰 갱신 ⚠️ **이번 개발 범위 아님** | 불필요 |
| `POST` | `/auth/logout` | 로그아웃 ⚠️ **이번 개발 범위 아님** | 필요 |
| `GET` | `/movies` | 영화 목록 | 필요 |
| `GET` | `/movies/{movieId}` | 영화 상세 | 필요 |
| `PATCH` | `/movies/{movieId}` | 영화 정보 수정 | 필요 |
| `PUT` | `/movies/{movieId}/approval` | 인증 상태 변경 (인증 / 반려 / 재검토 복귀) | 필요 |
| `PUT` | `/movies/{movieId}/service-status` | 노출 상태 변경 (⚠️ 이번 개발 범위 아님) | 필요 |
| `POST` | `/movies/{movieId}/embedding` | 추천 임베딩 재생성 요청 | 필요 |
| `GET` | `/movie-categories` | 영화 카테고리 목록 | 필요 |
| `POST` | `/movie-categories` | 카테고리 추가 | 필요 |
| `PATCH` | `/movie-categories/{categoryId}` | 카테고리 수정 | 필요 |
| `DELETE` | `/movie-categories/{categoryId}` | 카테고리 삭제 | 필요 |
| `GET` | `/display-categories` | 화면 문구 목록 | 필요 |
| `POST` | `/display-categories` | 화면 문구 추가 | 필요 |
| `PATCH` | `/display-categories/{categoryId}` | 화면 문구 수정 | 필요 |
| `DELETE` | `/display-categories/{categoryId}` | 화면 문구 삭제 | 필요 |
| `GET` | `/reviews` | 감상평 목록 | 필요 |
| `PUT` | `/reviews/{reviewId}/status` | 감상평 상태 변경 (정상 / 숨김 / 삭제) | 필요 |
| `GET` | `/members` | 회원 목록 | 필요 |
| `GET` | `/members/{memberId}` | 회원 상세 (계정 탭) | 필요 |
| `PUT` | `/members/{memberId}/status` | 회원 상태 변경 (이용 정지 / 정지 해제) (⚠️ 이번 개발 범위 아님) | 필요 |
| `GET` | `/members/{memberId}/survey` | 가입 시 취향 설문 (취향 설문 탭) | 필요 |
| `GET` | `/members/{memberId}/preference-updates` | 취향 갱신 이력 (취향 갱신 탭) (⚠️ 이번 개발 범위 아님) | 필요 |
| `GET` | `/admins` | 관리자 목록 ⚠️ **이번 개발 범위 아님** | 필요 |
| `POST` | `/admins` | 관리자 추가 ⚠️ **이번 개발 범위 아님** | 필요 |
| `PATCH` | `/admins/{adminId}` | 관리자 정보 수정 ⚠️ **이번 개발 범위 아님** | 필요 |
| `PUT` | `/admins/{adminId}/status` | 관리자 계정 정지 / 활성화 ⚠️ **이번 개발 범위 아님** | 필요 |
| `GET` | `/admins/me` | 로그인한 관리자 정보 ⚠️ **이번 개발 범위 아님** | 필요 |
| `GET` | `/push-messages` | 푸시 목록 ⚠️ **이번 개발 범위 아님** | 필요 |
| `POST` | `/push-messages` | 푸시 작성 (임시저장 / 예약 / 즉시 발송) ⚠️ **이번 개발 범위 아님** | 필요 |
| `GET` | `/verification-logs` | 검증 로그 ⚠️ **이번 개발 범위 아님** | 필요 |
| `GET` | `/batch-runs` | 배치 실행 이력 | 필요 |
| `GET` | `/dashboard/summary` | 대시보드 집계 | 필요 |
| `GET` | `/health` | 헬스체크 | 불필요 |

## 상세

### auth — 로그인 · 토큰 갱신 · 로그아웃 (⚠️ 이번 개발 범위 아님)

#### `POST` `/auth/login`

**로그인**

**이 엔드포인트만 인증이 필요 없습니다.**

> 인증이 필요 없습니다.

요청 본문 — `object`

응답 — `200` `LoginResult`

#### `POST` `/auth/refresh`

**액세스 토큰 갱신**

쿠키의 리프레시 토큰으로 새 액세스 토큰을 받습니다. 본문은 없습니다.

> 인증이 필요 없습니다.

응답 — `200` `LoginResult`

#### `POST` `/auth/logout`

**로그아웃**

리프레시 토큰을 무효화하고 쿠키를 지웁니다. GNB 우측 버튼이 호출합니다.

응답 — `204` —

### movies — 서비스 영화 · 인증완료 영화 · 영화 상세

#### `GET` `/movies`

**영화 목록**

서비스 영화 화면과 인증완료 영화 화면이 같은 엔드포인트를 씁니다.

파라미터

| 이름 | 필수 | 타입 | 설명 |
|---|---|---|---|
| `page` |  | integer | 1부터 시작 |
| `size` |  | integer |  |
| `approval_status` |  | string | 여러 개면 콤마로 구분 |
| `service_status` |  | DRAFT · PUBLISHED · HIDDEN |  |
| `genre` |  | string | 장르 정확 일치. `genres` 배열에 포함되면 매칭 |
| `q` |  | string | 제목·감독·배우 부분 일치 |
| `synced_from` |  | string | 수집일시 시작 |
| `synced_to` |  | string |  |
| `approved_from` |  | string | 인증일시 시작. 인증완료 화면의 기간 필터 |
| `approved_to` |  | string |  |
| `sort` |  | release_date:desc · release_date:asc · created_at:desc · pop_talk_score:desc |  |

응답 — `200` `PageMeta` + 목록

#### `GET` `/movies/{movieId}`

**영화 상세**

응답 — `200` `MovieDetail`

#### `PATCH` `/movies/{movieId}`

**영화 정보 수정**

보낸 필드만 바뀝니다. 변경 사실은 `VerificationLog`에 `EDIT`으로 남습니다.

요청 본문 — `object`

응답 — `200` `MovieDetail`

#### `PUT` `/movies/{movieId}/approval`

**인증 상태 변경 (인증 / 반려 / 재검토 복귀)**

**인증(`APPROVED`)은 사용자 화면에 인증 뱃지를 다는 신호입니다.**

요청 본문 — `object`

응답 — `200` `MovieDetail`

#### `PUT` `/movies/{movieId}/service-status`

**노출 상태 변경 (⚠️ 이번 개발 범위 아님)**

**이번 개발 범위가 아닙니다.** admin 목록에서 노출을 켜고 끄는 길은

요청 본문 — `object`

응답 — `200` `MovieDetail`

#### `POST` `/movies/{movieId}/embedding`

**추천 임베딩 재생성 요청**

`movie_embedding_jobs`에 `UPSERT` 작업을 넣습니다.

응답 — `202` `EmbeddingJob`

### movie-categories — 카테고리 관리 (영화 분류)

#### `GET` `/movie-categories`

**영화 카테고리 목록**

파라미터

| 이름 | 필수 | 타입 | 설명 |
|---|---|---|---|
| `page` |  | integer | 1부터 시작 |
| `size` |  | integer |  |
| `type` |  | GENRE · MOOD · THEME · RATING |  |

응답 — `200` `PageMeta` + 목록

#### `POST` `/movie-categories`

**카테고리 추가**

요청 본문 — `MovieCategoryInput`

응답 — `201` `MovieCategory`

#### `PATCH` `/movie-categories/{categoryId}`

**카테고리 수정**

요청 본문 — `MovieCategoryInput` + 목록

응답 — `200` `MovieCategory`

#### `DELETE` `/movie-categories/{categoryId}`

**카테고리 삭제**

영화에 연결된 카테고리는 지울 수 없습니다.

응답 — `204` —

### display-categories — 화면 문구 관리 (사용자 화면 알약 문구)

#### `GET` `/display-categories`

**화면 문구 목록**

사용자 화면에 노출되는 추천 알약 문구입니다.

파라미터

| 이름 | 필수 | 타입 | 설명 |
|---|---|---|---|
| `page` |  | integer | 1부터 시작 |
| `size` |  | integer |  |
| `is_active` |  | boolean |  |

응답 — `200` `PageMeta` + 목록

#### `POST` `/display-categories`

**화면 문구 추가**

요청 본문 — `DisplayCategoryInput`

응답 — `201` `DisplayCategory`

#### `PATCH` `/display-categories/{categoryId}`

**화면 문구 수정**

요청 본문 — `DisplayCategoryInput` + 목록

응답 — `200` `DisplayCategory`

#### `DELETE` `/display-categories/{categoryId}`

**화면 문구 삭제**

응답 — `204` —

### reviews — 감상평 관리

#### `GET` `/reviews`

**감상평 목록**

파라미터

| 이름 | 필수 | 타입 | 설명 |
|---|---|---|---|
| `page` |  | integer | 1부터 시작 |
| `size` |  | integer |  |
| `status` |  | NORMAL · HIDDEN · DELETED |  |
| `member_id` |  | integer | 회원 상세의 감상평 탭이 사용 |
| `q` |  | string | 작성자·영화·내용 부분 일치 |
| `created_from` |  | string |  |
| `created_to` |  | string |  |
| `sort` |  | string |  |

응답 — `200` `PageMeta` + 목록

#### `PUT` `/reviews/{reviewId}/status`

**감상평 상태 변경 (정상 / 숨김 / 삭제)**

`DELETED`는 물리 삭제가 아니라 상태 변경입니다.

요청 본문 — `object`

응답 — `200` `Review`

### members — 회원 관리 · 회원 상세

#### `GET` `/members`

**회원 목록**

**`dev.users`를 읽습니다.** 앱 사용자 전용 테이블이라 `role` 필터가

파라미터

| 이름 | 필수 | 타입 | 설명 |
|---|---|---|---|
| `page` |  | integer | 1부터 시작 |
| `size` |  | integer |  |
| `status` |  | ACTIVE · SUSPENDED · WITHDRAWN |  |
| `q` |  | string | 이름·이메일 부분 일치 |
| `joined_from` |  | string |  |
| `joined_to` |  | string |  |
| `sort` |  | string |  |

응답 — `200` `PageMeta` + 목록

#### `GET` `/members/{memberId}`

**회원 상세 (계정 탭)**

응답 — `200` `Member`

#### `PUT` `/members/{memberId}/status`

**회원 상태 변경 (이용 정지 / 정지 해제) (⚠️ 이번 개발 범위 아님)**

**이번 개발 범위가 아닙니다.** admin 회원 목록에서 상태를 바꾸는 길은 제거했고,

요청 본문 — `object`

응답 — `200` `Member`

#### `GET` `/members/{memberId}/survey`

**가입 시 취향 설문 (취향 설문 탭)**

Q1~Q3은 필수, Q4~Q6은 건너뛸 수 있습니다.

응답 — `200` `MemberSurvey`

#### `GET` `/members/{memberId}/preference-updates`

**취향 갱신 이력 (취향 갱신 탭) (⚠️ 이번 개발 범위 아님)**

**일정상 이번 개발 범위에서 빠졌습니다.** 근거가 되는 취향 갱신 배치

파라미터

| 이름 | 필수 | 타입 | 설명 |
|---|---|---|---|
| `page` |  | integer | 1부터 시작 |
| `size` |  | integer |  |

응답 — `200` `PageMeta` + 목록

### admins — 관리자 관리 (⚠️ 이번 개발 범위 아님)

#### `GET` `/admins`

**관리자 목록**

**`dev.admins_service` 뷰를 읽으세요.** `dev.users`에서 `role <> 'MEMBER'`인

파라미터

| 이름 | 필수 | 타입 | 설명 |
|---|---|---|---|
| `page` |  | integer | 1부터 시작 |
| `size` |  | integer |  |
| `status` |  | ACTIVE · SUSPENDED |  |
| `q` |  | string |  |

응답 — `200` `PageMeta` + 목록

#### `POST` `/admins`

**관리자 추가**

`SUPER_ADMIN`만 호출할 수 있습니다.

요청 본문 — `AdminInput`

응답 — `201` `Admin`

#### `PATCH` `/admins/{adminId}`

**관리자 정보 수정**

요청 본문 — `AdminInput` + 목록

응답 — `200` `Admin`

#### `PUT` `/admins/{adminId}/status`

**관리자 계정 정지 / 활성화**

자기 자신은 정지할 수 없습니다.

요청 본문 — `object`

응답 — `200` `Admin`

#### `GET` `/admins/me`

**로그인한 관리자 정보**

GNB 우측의 계정 영역이 사용합니다.

응답 — `200` `Admin`

### push — 푸시 발송 및 이력 (⚠️ 이번 개발 범위 아님)

#### `GET` `/push-messages`

**푸시 목록**

파라미터

| 이름 | 필수 | 타입 | 설명 |
|---|---|---|---|
| `page` |  | integer | 1부터 시작 |
| `size` |  | integer |  |
| `status` |  | SENT · SCHEDULED · DRAFT |  |

응답 — `200` `PageMeta` + 목록

#### `POST` `/push-messages`

**푸시 작성 (임시저장 / 예약 / 즉시 발송)**

`action`이 무엇을 할지 정합니다.

요청 본문 — `PushMessageInput`

응답 — `201` `PushMessage`

### logs — 검증 로그 (⚠️ 이번 개발 범위 아님)

#### `GET` `/verification-logs`

**검증 로그**

영화 인증 상태 변경과 정보 수정 이력입니다.

파라미터

| 이름 | 필수 | 타입 | 설명 |
|---|---|---|---|
| `page` |  | integer | 1부터 시작 |
| `size` |  | integer |  |
| `action` |  | APPROVE · REJECT · RESTORE · EDIT |  |
| `admin` |  | string | 처리한 관리자 이름 |
| `q` |  | string | 영화 제목 부분 일치 |
| `created_from` |  | string |  |
| `created_to` |  | string |  |

응답 — `200` `PageMeta` + 목록

### batches — 배치 실행 현황

#### `GET` `/batch-runs`

**배치 실행 이력**

대시보드의 "배치 실행 현황" 패널이 사용합니다.

파라미터

| 이름 | 필수 | 타입 | 설명 |
|---|---|---|---|
| `page` |  | integer | 1부터 시작 |
| `size` |  | integer |  |
| `job_name` |  | string |  |
| `status` |  | PENDING · PROCESSING · SUCCEEDED · FAILED |  |

응답 — `200` `PageMeta` + 목록

### dashboard — 대시보드 집계

#### `GET` `/dashboard/summary`

**대시보드 집계**

대시보드가 요약 카드 11장을 그리는 데 필요한 수치를 한 번에 내려줍니다.

응답 — `200` `DashboardSummary`

### ops — 운영 — 로드밸런서 헬스체크

#### `GET` `/health`

**헬스체크**

서버와 DB가 살아 있는지 알려줍니다. **인증이 없습니다** — 로드밸런서는

> 인증이 필요 없습니다.

응답 — `200` `Health`

## 주요 데이터 모델

### `Movie`

`dev.popcorn_movies_service` 뷰의 한 행

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | integer | ✅ |  |
| `kofic_movie_cd` | string | ✅ | KOFIC 영화 코드. 필수·유니크한 원천 키 |
| `kmdb_id` | string · null |  |  |
| `kmdb_matched` | boolean | ✅ | false면 포스터·줄거리가 비어 있을 가능성이 높음 (실 데이터의 6%) |
| `title_ko` | string | ✅ |  |
| `title_en` | string · null |  |  |
| `title_original` | string · null |  |  |
| `release_date` | string | ✅ |  |
| `production_year` | integer · null |  |  |
| `runtime_minutes` | integer · null |  |  |
| `movie_type` | string · null |  |  |
| `production_status` | string · null |  | 개봉 · 개봉예정 |
| `production_countries` | array |  |  |
| `representative_country` | string · null |  |  |
| `genres` | array | ✅ |  |
| `representative_genre` | string · null |  |  |
| `directors` | array | ✅ |  |
| `director_names_en` | array |  |  |
| `actors` | array | ✅ |  |
| `actor_roles` | array |  |  |
| `production_companies` | array |  |  |
| `viewing_grade` | string · null |  | KOFIC 원문 그대로. 목록에서는 축약해 보여줌 |
| `poster_url` | string · null |  | 비어 있으면 `media`의 대표 포스터를 씀 (그런 영화가 35편) |
| `plot` | string · null |  |  |
| `source_keywords` | array |  |  |
| `service_status` | DRAFT · PUBLISHED · HIDDEN | ✅ | 준비중 · 노출중 · 숨김 |
| `approval_status` | PENDING · APPROVED · REJECTED | ✅ | 인증대기 · 인증완료 · 반려 |
| `approved_by` | string · null |  |  |
| `approved_at` | string · null |  |  |
| `rejection_reason` | string · null |  | `approval_status=REJECTED`면 비어 있을 수 없음 |
| `source_system` | string |  |  |
| `source_hash` | string |  | 원본 행 변경 감지를 위한 SHA-256. 배치가 채우며 admin은 읽기만 합니다 |
| `source_synced_at` | string |  |  |
| `created_at` | string |  |  |
| `updated_at` | string |  |  |
| `is_embedded` | boolean |  | 뷰가 계산합니다. `PROFILE` 임베딩이 `READY`이고 벡터가 실제로 있는지. |
| `media` | array |  | 포스터·스틸 전부. 영화당 평균 8.3개, 최대 53개 |
| `pop_talk_score` | number · null |  | **DB에 아직 없는 컬럼.** 추가 예정 |
| `categories` | array |  | **DB에 아직 테이블이 없음.** 추가 예정 |

### `MovieSummary`

서비스 영화 화면의 요약 카드 4장

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `total` | integer | ✅ |  |
| `published` | integer | ✅ | 노출 중 |
| `pending` | integer | ✅ |  |
| `approved` | integer | ✅ |  |
| `rejected` | integer | ✅ |  |

### `Member`

`dev.users` — 앱 사용자 테이블입니다. `id`는 **uuid**입니다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | ✅ |  |
| `nickname` | string | ✅ |  |
| `email` | string | ✅ |  |
| `status` | ACTIVE · SUSPENDED · WITHDRAWN | ✅ |  |
| `joined_at` | string | ✅ |  |
| `status_updated_by` | string · null |  |  |
| `status_updated_at` | string · null |  |  |
| `status_reason` | string · null |  |  |
| `review_count` | integer | ✅ | 뷰가 집계 |
| `avg_rating` | number · null |  |  |
| `has_survey` | boolean | ✅ |  |

### `Review`

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | ✅ |  |
| `member_id` | string | ✅ |  |
| `author` | string | ✅ | 회원 닉네임 |
| `source_system` | string · null |  | 감상평의 출처. `dev.reviews.source_system`입니다. |
| `movie_id` | integer | ✅ |  |
| `movie` | string | ✅ | 영화 제목 |
| `rating` | number | ✅ | 팝콘점수. `dev.reviews.rating`이 `numeric(2,1)`이고 |
| `content` | string | ✅ |  |
| `status` | NORMAL · HIDDEN · DELETED | ✅ |  |
| `created_at` | string | ✅ |  |

### `Admin`

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | integer | ✅ |  |
| `name` | string | ✅ |  |
| `email` | string | ✅ |  |
| `role` | ADMIN · SUPER_ADMIN | ✅ | 관리자 권한입니다. `SUPER_ADMIN`만 관리자를 추가·정지할 수 있습니다. |
| `status` | ACTIVE · SUSPENDED | ✅ |  |
| `joined_at` | string | ✅ |  |
| `last_login` | string · null |  |  |
| `created_by` | string · null |  |  |

### `BatchRun`

`dev.batch_runs`

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | integer | ✅ |  |
| `job_name` | string | ✅ | 자유 문자열. `load-initial-movies` 등 |
| `scheduled_for` | string | ✅ |  |
| `status` | PENDING · PROCESSING · SUCCEEDED · FAILED | ✅ |  |
| `source_hash` | string |  | 원본 파일 SHA-256. 같은 파일을 두 번 적재했는지 판별합니다 |
| `source_file` | string · null |  |  |
| `processed_count` | integer | ✅ |  |
| `inserted_count` | integer | ✅ |  |
| `updated_count` | integer | ✅ |  |
| `failed_count` | integer | ✅ |  |
| `result` | object | ✅ |  |
| `last_error` | string · null |  |  |
| `started_at` | string · null |  |  |
| `finished_at` | string · null |  |  |

### `Health`

`apps/api`의 `GET /health` 응답. 구현을 그대로 따릅니다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `status` | ok · degraded | ✅ | 이 서버가 정상인지. DB에 못 붙으면 `degraded` |
| `database` | connected · unreachable | ✅ | PostgreSQL 연결 상태. 원인 메시지는 담지 않습니다 |
| `timestamp` | string | ✅ | 점검한 시각 (ISO 8601) |

### `LoginResult`

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `access_token` | string | ✅ | `Authorization: Bearer <값>`으로 보냅니다. 메모리에만 두세요 |
| `token_type` | string | ✅ |  |
| `expires_in` | integer | ✅ | 초. 900 = 15분 |
| `admin` | object | ✅ |  |

## 백엔드 없이 먼저 시작하기

명세만으로 목 서버가 뜹니다. 프런트는 백엔드를 기다릴 필요가 없습니다.

```bash
npx @stoplight/prism-cli mock docs/openapi.yaml -p 4010 --cors
```

Swagger UI에서 **Servers**를 `http://localhost:4010`으로 고르고 `Authorize`에
아무 문자열이나 넣으면 문서에서 바로 호출됩니다.

## 아직 정해지지 않은 것

| 항목 | 상태 |
|---|---|
| 인증 방식 | 액세스 15분 + 리프레시 14일 회전은 **제안**입니다. SSO 여부·만료 정책은 팀 결정 |
| 영화 점수 | `movies.pop_talk_score`로 **생겼습니다**. 다만 admin이 보는 `popcorn_movies`에는 없습니다 |
| `categories` | 테이블 없음. 초안은 `docs/category-domain-draft.sql` (미실행) |
| `/members` 계열 7개 | 테이블은 생겼으나 **구조가 다름** — 실제는 `users.id`가 uuid, `role` 없음, `reviews.rating` |
| 취향 갱신 배치 | 일정상 **이번 범위 아님**. `/members/{memberId}/preference-updates`도 함께 보류 |
| backend 포트 | 아키텍처 문서 9000 · 실제 ACG 8000. 명세는 문서 기준 |

회원 도메인은 `docs/user-domain-draft.sql`의 열린 질문 8개가 정해지면 응답 필드가 바뀝니다.
인프라 관련 사항은 `docs/infra-findings.md`를 참고하세요.
