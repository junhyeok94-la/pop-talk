# 팝콘톡 Admin API

관리자 콘솔이 쓰는 API입니다. 정식 명세는 [`openapi.yaml`](./openapi.yaml)이고,
이 문서는 사람이 읽는 요약입니다.

```bash
# 명세 검증
npx @redocly/cli lint docs/openapi.yaml

# HTML 문서로 보기
npx @redocly/cli preview-docs docs/openapi.yaml
```

## 원칙

**화면이 실제로 하는 일에서 역산했습니다.** 화면에 없는 기능은 넣지 않았습니다.

**영화 도메인은 DB 컬럼명을 그대로 씁니다.** `title_ko`, `approval_status`,
`source_synced_at` 같은 이름을 화면에서 바꾸지 않았기 때문에 매핑 층이 없습니다.

**감사 정보는 서버가 채웁니다.** `approved_by`, `status_updated_by`는 JWT에서 읽습니다.
클라이언트가 보내는 값을 믿지 않습니다.

## 엔드포인트 35개

### 인증

| | | 비고 |
|---|---|---|
| `POST` | `/auth/login` | 이메일 + 비밀번호 |
| `POST` | `/auth/refresh` | 리프레시 쿠키로 액세스 토큰 재발급 |
| `POST` | `/auth/logout` | 리프레시 토큰 폐기 + 쿠키 삭제 |

> **인증 방식은 제안이지 결정이 아닙니다.** 액세스 토큰 15분(응답 본문) +
> 리프레시 토큰 14일(httpOnly·Secure·SameSite=Strict 쿠키, 갱신 시 회전)으로
> 흔한 형태를 잡아뒀습니다. 팀이 SSO나 다른 만료 정책을 쓰기로 했다면 그대로 바꾸세요.
>
> 액세스 토큰은 **메모리에만** 두는 전제입니다. `localStorage`에 넣으면 XSS 한 번에 털립니다.

### 운영

| | | 비고 |
|---|---|---|
| `GET` | `/healthz` | 로드밸런서 헬스체크. 인증 없음 |

backend가 2대(`popcorn-backend-1/2`)라 로드밸런서가 어느 쪽이 살아 있는지 알아야 합니다.
DB에 못 붙으면 **503**을 내려주세요. 그래야 그 서버를 빼고, 복구되면 다시 넣습니다.

배포는 한 대씩 — 로드밸런서에서 빼고 → 배포 → `/healthz` 200 확인 → 다시 넣고 → 다음 대.
프로세스가 뜬 것과 요청을 받을 준비가 된 것은 다릅니다.

### 영화

| | | 쓰는 화면 |
|---|---|---|
| `GET` | `/movies` | 서비스 영화, 인증완료 영화 |
| `GET` | `/movies/{id}` | 영화 상세 |
| `PATCH` | `/movies/{id}` | 영화 정보 수정 |
| `PUT` | `/movies/{id}/approval` | 인증 / 반려 / 재검토 복귀 |
| `PUT` | `/movies/{id}/service-status` | 노출 토글 |
| `POST` | `/movies/{id}/embedding` | 추천 임베딩 재생성 |

**두 목록 화면이 같은 엔드포인트를 씁니다.** 인증완료 화면은 `approval_status=APPROVED`를
붙일 뿐입니다. 화면의 표도 하나(`MovieTable`)를 공유합니다.

### 카테고리

| | | 비고 |
|---|---|---|
| `GET`·`POST` | `/movie-categories` | 영화 분류 |
| `PATCH`·`DELETE` | `/movie-categories/{id}` | 연결된 영화가 있으면 삭제 409 |
| `GET`·`POST` | `/display-categories` | 사용자 화면 알약 문구 |
| `PATCH`·`DELETE` | `/display-categories/{id}` | |

### 감상평 · 회원

| | | 비고 |
|---|---|---|
| `GET` | `/reviews` | `member_id`를 주면 회원 상세의 감상평 탭 |
| `PUT` | `/reviews/{id}/status` | 정상 / 숨김 / 삭제 |
| `GET` | `/members` | |
| `GET` | `/members/{id}` | 회원 상세 계정 탭 |
| `PUT` | `/members/{id}/status` | 이용 정지 / 해제 |
| `GET` | `/members/{id}/survey` | 취향 설문 탭 |
| `GET` | `/members/{id}/preference-updates` | ⚠️ 이번 개발 범위 아님 |

### 관리자 · 푸시 · 로그

**셋 다 이번 개발 범위가 아닙니다.** 명세에는 남아 있습니다.

| | | 비고 |
|---|---|---|
| `GET`·`POST` | `/admins` | ⚠️ 범위 아님 — 추가는 `SUPER_ADMIN`만 |
| `PATCH` | `/admins/{id}` | ⚠️ 범위 아님 |
| `PUT` | `/admins/{id}/status` | ⚠️ 범위 아님 — 자기 자신은 정지 불가 |
| `GET` | `/admins/me` | ⚠️ 범위 아님 — 로그인이 없어 성립하지 않음 |
| `GET`·`POST` | `/push-messages` | `action`으로 임시저장·예약·즉시발송 구분 |
| `GET` | `/verification-logs` | |
| `GET` | `/batch-runs` | |
| `GET` | `/dashboard/summary` | 요약 카드 11장을 한 번에 |

## 화면이 요구하는 규칙 세 가지

### 1. 인증과 노출은 별개 축입니다

DB가 `approval_status`와 `service_status`를 따로 갖고 있어서, 엔드포인트도 나눴습니다.

```
PUT /movies/{id}/approval        인증대기 · 인증완료 · 반려
PUT /movies/{id}/service-status  준비중 · 노출중 · 숨김
```

인증하거나 재검토로 되돌려도 노출 상태는 그대로입니다.
**예외는 반려** — 서비스에서 내리는 조치라 `HIDDEN`으로 함께 바꿉니다.

### 2. 반려에는 사유가 필수입니다

DB CHECK 제약이 있어 사유 없이 보내면 400입니다. 화면에서도 사유가 비면 버튼이 안 눌립니다.

```json
POST 본문   { "status": "REJECTED", "reason": "저작권 확인 필요" }
```

### 3. 목록은 요약을 함께 내려줍니다

모든 목록 화면이 상단에 요약 카드를 그립니다. 카드를 위해 목록 API를 다시 부르지 않도록
응답에 `summary`를 같이 담습니다.

```json
{
  "items": [ ... ],
  "page": 1, "size": 10, "total": 5985, "total_pages": 599,
  "summary": { "total": 5985, "published": 5985, "pending": 0, "approved": 5985, "rejected": 0 }
}
```

## 검증

명세가 실제로 도는지 목 서버로 확인했습니다. 서버 코드 없이 화면 개발을 먼저 시작할 수 있습니다.

```bash
npx @stoplight/prism-cli mock docs/openapi.yaml -p 4010
curl -H 'Authorization: Bearer test' 'http://localhost:4010/movies?page=1&size=2'
```

| 확인한 것 | 결과 |
|---|---|
| `GET /movies` | 실 DB 값 그대로 응답 (총 5,985편, 첫 편 `가능한 사랑`) |
| 토큰 없이 호출 | `401` |
| `page=abc` | `422` — 타입 검증이 명세만으로 동작 |
| 사유 없이 반려 | `400` |

`npx @redocly/cli lint docs/openapi.yaml`도 통과합니다.

## 구현 시 주의할 것

**임베딩은 조건부로만 생성됩니다.** DB 트리거가 `service_status=PUBLISHED`이고
`approval_status=APPROVED`일 때만 큐에 넣습니다. 다른 상태면 기존 임베딩을 `STALE`로
바꾸고 큐에 넣지 않습니다. `POST /movies/{id}/embedding`이 409를 낼 수 있는 이유입니다.

**포스터는 두 곳을 봐야 합니다.** `poster_url`이 비어 있어도 `media` 배열에 대표 포스터가
있는 경우가 35편 있습니다. `popcorn_movies_service` 뷰가 `media`를 붙여주므로 응답에서
둘 다 내려줍니다.

**CSV 파싱은 클라이언트가 합니다.** 푸시의 특정 회원 발송은 화면에서 CSV를 읽고 중복을
제거한 뒤 `member_ids` 배열로 보냅니다. 서버는 파일을 받지 않습니다.

**감사 정보는 클라이언트를 믿지 않습니다.** `approved_by`, `status_updated_by`는
요청 본문에 없습니다. 서버가 JWT `sub`에서 읽어 채웁니다.

**목록 규모를 전제하세요.** `popcorn_movies`에 5,985편이 있습니다.
`size` 기본값 10, 최대 100입니다.

## 아직 정해지지 않은 것

명세에 넣긴 했지만 **DB가 따라오지 않은 부분**입니다.

| 항목 | 상태 |
|---|---|
| `popcorn_score` | `popcorn_movies`에 컬럼 없음. 추가 예정 |
| `categories` | 테이블 없음 |
| 회원 · 감상평 · 설문 · 관리자 · 푸시 | 테이블 없음. [`user-domain-draft.sql`](./user-domain-draft.sql) 참고 |
| 취향 갱신 배치 | 일정상 **이번 범위 아님**. `/members/{id}/preference-updates`도 함께 보류 |

회원 스키마 초안의 [열린 질문 6가지](./user-domain-draft.sql)가 정해지면
`/members` 계열 응답 필드가 바뀔 수 있습니다.
