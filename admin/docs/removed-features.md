# 뺀 기능과 되살리는 법

이번 범위에서 제외한 기능들입니다. **나중에 다시 넣을 수 있습니다.**

주석으로 남기지 않았습니다. 주석 처리한 코드는 컴파일·lint·타입 검사를 받지 않아서
주변이 바뀌면 조용히 썩고, 되살릴 때 어차피 다시 고쳐야 합니다. 그동안 읽는 사람은
"이건 살아 있는 코드인가"를 매번 판단해야 합니다.

**git이 이미 그 일을 합니다.** 아래에 무엇을 어디서 뺐는지 적어두었으니,
해당 커밋 직전 상태에서 파일을 꺼내면 그대로 돌아옵니다.

```bash
# 예 — 푸시 화면 되살리기
git checkout <제거_커밋>^ -- apps/admin/src/app/push
```

`<제거_커밋>`은 아래 표의 커밋입니다. `^`는 "그 직전"이라는 뜻입니다.

**API 명세는 지우지 않았습니다.** 엔드포인트는 그대로 두고 `⚠️ 이번 개발 범위 아님`만
붙였습니다. 백엔드 담당자가 명세를 보고 있어서 사라지면 혼란스럽고, 설계는 이미
끝난 것이라 되살릴 때 다시 만들 필요가 없기 때문입니다.

---

## 2026-08-10 제거 — 커밋 `af71c3d`

### 1. 푸시

사이드바 `운영 > 푸시` 메뉴와 화면 전체.

| | |
|---|---|
| 화면 | `apps/admin/src/app/push/` (page.tsx + page.module.css) |
| 사이드바 | `components/sidebar.tsx` — `운영` 그룹의 항목 |
| 대시보드 | 요약 카드 `주간 푸시 발송`, 빠른 이동 `푸시 발송` |
| 명세 | `POST`·`GET /push-messages` — **남아 있음**, 범위 아님 표시만 |
| DB | 테이블 없음 |

되살리기 —
```bash
git checkout af71c3d^ -- apps/admin/src/app/push
```
그리고 `sidebar.tsx`의 `운영` 그룹에 항목을 되돌리고, `openapi.yaml`의
`push` 태그에서 범위 표시를 지웁니다.

### 2. 검증 로그

사이드바 `운영 > 검증 로그` 메뉴와 화면 전체.

| | |
|---|---|
| 화면 | `apps/admin/src/app/logs/` |
| 사이드바 | `components/sidebar.tsx` |
| 대시보드 | 빠른 이동 `검증 로그`, `최근 검토 활동`의 "전체 로그 보기" 링크 |
| 명세 | `GET /verification-logs` — **남아 있음**, 범위 아님 표시만 |

**대시보드의 `최근 검토 활동` 목록 자체는 남겼습니다.** 영화 인증 이력이라
대시보드에서 볼 값이 있고, 로그 화면과는 별개 surface입니다. 화면으로 넘어가는
링크만 뺐습니다. 이것도 빼야 한다면 `src/app/page.tsx`의 `activity-title` 섹션입니다.

되살리기 —
```bash
git checkout af71c3d^ -- apps/admin/src/app/logs
```

### 3. 감상평 신고

감상평 화면은 남기고 **신고 관련만** 뺐습니다.

| 어디 | 뺀 것 |
|---|---|
| `src/app/reviews/page.tsx` | 요약 카드 `신고 접수`, 표의 `신고수` 열, 모달의 신고 건수, `REPORTED` 필터 |
| `src/app/members/page.tsx` | 표의 `신고` 열 |
| `src/app/members/[id]/page.tsx` | 요약 카드 `누적 신고`, 계정 탭의 `누적 신고 N건`, 감상평 탭의 신고 뱃지 |
| `src/app/page.tsx` | 누적 감상평 카드의 `신고 N건` 캡션 |
| 사이드바 | `감상평·신고` → **`감상평`** |
| 화면 제목 | `감상평·신고 관리` → **`감상평 관리`** |

**화면에서 신고 표시가 완전히 사라졌습니다.** `grep -rn "신고\|report_count" src/app src/components`가
비어 있는 것을 확인했습니다.

**데이터 모델은 그대로입니다.** `Review.report_count`, `Member.report_count`는
`mock.ts`와 명세에 남아 있습니다. 화면에서만 안 보여줍니다. 되살릴 때 모델을
다시 만들 필요가 없습니다.

되살릴 때는 각 파일에서 `report_count`를 쓰는 자리를 다시 만들면 됩니다.
모델이 살아 있으므로 값은 이미 들어옵니다.

### 4. 회원 상태 수정

회원 상세 조회는 유지, **상태를 바꾸는 기능만** 뺐습니다.

| 어디 | 뺀 것 |
|---|---|
| `src/app/members/page.tsx` | `상태 수정` 열(이용 정지·정지 해제 버튼), 확인 모달, `applyStatus` 핸들러 |
| | 목록이 읽기 전용이 되어 `useState` → 상수로 |
| 명세 | `PUT /members/{memberId}/status` — **남아 있음**, 범위 아님 표시만 |

**`상태`·`수정자`·`수정일시` 열은 남겼습니다.** 지난 변경 이력을 보여주는 값이고,
상태 자체는 다른 경로(배치·DB)로 바뀔 수 있어서입니다. 화면에서 바꾸는 길만 없습니다.

되살리기 —
```bash
git show af71c3d -- apps/admin/src/app/members/page.tsx
```
전체를 되돌리기보다 이 diff를 보고 필요한 부분만 되살리는 편이 낫습니다.
그 사이에 다른 변경이 섞였을 수 있습니다.

---

## 2026-08-11 제거 — 회원 취향 업데이트

**일정상 취향 갱신 배치(`refresh-member-preferences`)를 개발하지 않기로 했습니다.**
배치가 없으면 갱신 이력도 생기지 않으므로, 그 이력을 보여주던 화면을 함께 뺐습니다.

**"취향 설문" 탭은 그대로입니다.** 가입할 때 받는 값이라 배치와 무관합니다.

| 어디 | 뺀 것 |
|---|---|
| `src/app/members/[id]/page.tsx` | **`취향 갱신` 탭** 전체 · 요약 카드 3번째 · 감상평 탭의 `취향 반영 횟수` · `CHANGE_LABELS`·`CHANGE_TONES` |
| `src/app/members/[id]/page.module.css` | 타임라인 11개 클래스(`.timeline`~`.changeValue`)와 반응형 |
| `src/app/page.tsx` | 대시보드 **`최근 취향 업데이트` 패널** 전체 |
| | 배치 안내 문구에서 `회원 취향 갱신(03:00)` |
| `src/lib/mock.ts` | `PreferenceChange` · `PreferenceUpdate` · `MOCK_PREFERENCE_UPDATES` 8건 |
| | `BATCH_JOBS`의 `refresh-member-preferences`, `MOCK_BATCH_RUNS` 4건 |
| 명세 | `GET /members/{memberId}/preference-updates` — **남아 있음**, 범위 아님 표시 |
| | `Member.preference_update_count` · `MemberDetail.recent_preference_updates` — **삭제** |
| DB | `member_preference_updates` 테이블 — 만들지 않음 |

**명세에서 엔드포인트는 남기고 필드는 지웠습니다.** 기준이 다릅니다 —
엔드포인트는 통째로 보류된 기능이라 표시만 하면 되지만,
`preference_update_count`는 **이번에 개발할 `GET /members`가 내려줘야 하는 필드**였습니다.
채울 데이터가 없는 필드를 `required`에 남겨두면 백엔드가 못 지키는 약속이 됩니다.

### 대시보드 배치 패널이 전체 폭이 되었습니다

`최근 취향 업데이트`와 2열로 짝지어 있었는데, 짝이 사라져 오른쪽이 비었습니다.
배치 패널을 `.split` 밖으로 꺼내 한 줄을 다 쓰게 했습니다. 나머지 두 줄은 그대로입니다.

되살리기 —
```bash
git log --oneline --all --grep="취향 업데이트 제거"   # 커밋 찾기
git checkout <제거_커밋>^ -- apps/admin/src/app/members/\[id\]/page.tsx
```
그리고 `page.tsx`의 배치 패널을 다시 `.split`으로 감싸고,
`openapi.yaml`에서 범위 표시를 지운 뒤 두 필드를 되돌립니다.

---

## 2026-08-11 제거 — 관리자 관리

**로그인을 만들지 않기로 해서 관리자 계정 기능도 함께 뺐습니다.** 시연에서는
주소로 바로 들어갑니다. (로그인 화면·미들웨어는 원래 없었습니다. 접속 방식은 그대로입니다.)

| 어디 | 뺀 것 |
|---|---|
| `src/app/admins/` | 화면 전체 (page.tsx + page.module.css) |
| `src/components/sidebar.tsx` | `운영` 그룹 **통째로** — 아래 참고 |
| `src/app/page.tsx` | 요약 카드 `활성 관리자`, 빠른 이동 `관리자 관리`, `ADMIN_TOTAL`·`ADMIN_ACTIVE` |
| `src/components/gnb.tsx` | **로그아웃 버튼** (+ `.signout` CSS) |
| 명세 | `admins` 태그에 범위 아님 표시. 엔드포인트 5개는 **남아 있음** |
| | `DashboardSummary.admins` — **삭제** |

### `운영` 그룹이 사라졌습니다

푸시와 검증 로그를 뺀 뒤 `관리자 관리` 하나만 남아 있었습니다. 그것마저 빠져
항목이 0개가 되어 그룹째 지웠습니다. 사이드바는 이제 **3그룹**입니다 —
`영화 검수` · `콘텐츠 설정` · `사용자`.

되살릴 때는 그룹을 다시 만들어야 합니다.

### GNB의 이름은 남겼습니다

`김운영 / 슈퍼관리자`는 그대로 두고 **로그아웃 버튼만** 뺐습니다.
누를 곳이 없는 버튼이라서입니다.

이름을 남긴 이유는 **`CURRENT_ADMIN`이 감사 값의 출처**이기 때문입니다.
지우면 이 값들이 어디서 왔는지 화면에서 설명되지 않습니다 —

| 쓰는 곳 | 찍히는 값 |
|---|---|
| `lib/admin-store.tsx` | 검증 로그의 처리자 · 영화 `approved_by` |
| `app/categories/page.tsx` | 화면 문구의 등록자·수정자 |
| `app/movie-categories/page.tsx` | 카테고리의 등록자·수정자 |

**`CURRENT_ADMIN`은 `lib/mock.ts`에 그대로 있습니다.** 관리자 *화면*만 없앤 것이지
"누가 했는지"까지 없앤 게 아닙니다.

### 곁다리 — `DashboardSummary.push`도 `required`에서 뺐습니다

푸시는 PR #3에서 뺐는데 **명세의 `required`에는 남아 있었습니다.** 대시보드는
이번에 개발할 화면이라, 채울 수 없는 필드를 필수로 두면 백엔드가 못 지킵니다.
`admins`와 같은 이유로 함께 정리했습니다.

되살리기 —
```bash
git log --oneline --all --grep="관리자 메뉴 제거"   # 커밋 찾기
git checkout <제거_커밋>^ -- apps/admin/src/app/admins
```
그리고 사이드바에 `운영` 그룹을 다시 만들고, GNB에 로그아웃 버튼을 되돌린 뒤
`openapi.yaml`의 `admins` 태그에서 범위 표시를 지웁니다.

---

## 2026-08-11 제거 — 노출 상태 설정

영화 목록에서 **노출 상태를 바꾸는 길만** 뺐습니다. 상태 표시는 남겼습니다.

| 어디 | 뺀 것 |
|---|---|
| `components/movie-table.tsx` | `노출 상태` 열의 **스위치**(`SwitchRoot`)와 `onToggleService` prop |
| `app/review/page.tsx` | 확인 모달, `confirmExpose` 상태 |
| `app/approved/page.tsx` | 확인 모달, `confirmExpose` 상태 |
| `lib/admin-store.tsx` | `setServiceStatus` 액션 |
| CSS | `movie-table.module.css`의 `.serviceCell` |

**`노출 상태` 열과 `ServiceBadge`는 남겼습니다.** 회원 상태 수정 때와 같은 이유입니다 —
값 자체는 배치나 DB로 바뀔 수 있고, 지난 상태를 보여줄 값이 있습니다. 화면에서 바꾸는 길만 없습니다.

**인증완료 영화의 `노출 중`·`미노출` 요약 카드도 남겼습니다.** 필터로 쓰는 값이라
보는 기능에 속합니다.

**영화 상세는 원래 표시만 했습니다.** 요약 카드에 `노출 상태`가 있을 뿐 바꾸는 기능이 없어
손대지 않았습니다.

되살리려면 `movie-table.tsx`에 스위치를, 두 목록 화면에 확인 모달을,
스토어에 `setServiceStatus`를 되돌리면 됩니다.

---

## 2026-08-11 이동 — 카테고리 관리의 `영화수`

제거가 아니라 **자리를 옮겼습니다.**

| 화면 | 변경 |
|---|---|
| 카테고리 관리 | `영화수` 열 **제거** |
| 화면 문구 관리 | `영화수` 열 **추가** |

**영화에 실제로 붙는 것이 화면 문구(`display_categories`)이기 때문입니다.**
admin의 영화 상세에서 카테고리를 편집할 때 후보로 뜨는 목록이 그쪽이고,
목 데이터의 영화도 전부 알약 문구를 들고 있습니다.

`movie_categories`(카테고리 관리)에는 영화와 잇는 연결 테이블이 없어 셀 수가 없습니다.
영화에 내부 분류를 붙이는 화면이 생기면 그때 링크 테이블을 하나 더 두면 됩니다.

데이터 모델도 같이 옮겼습니다 — `Category.movie_count` 추가, `MovieCategory.movie_count` 제거.

---

## 2026-08-11 제거 — 대시보드의 검증 로그 기반 패널 둘

`최근 검토 활동`과 `주간 검토 처리량`을 뺐습니다. **둘 다 검증 로그에 기대는데
그 데이터가 이번 범위에 없습니다.**

| 어디 | 뺀 것 |
|---|---|
| `src/app/page.tsx` | `최근 검토 활동` 패널 · `주간 검토 처리량` 차트 |
| | `ACTION_LABELS` · `ACTION_TONES` · `WEEKLY` · `WEEKLY_MAX` · `logs` 구독 |
| `src/app/page.module.css` | `.chart*` · `.bar*` · `.legend*` · `.swatch*` · `.log{Meta,Note,Time}` · `.transition` |
| 명세 | `DashboardSummary.recent_logs` · `weekly_verification` — **삭제** |

### 왜 이제 와서 뺐나

PR #3에서 로그 화면을 없앨 때 이 목록은 남겼습니다. "영화 인증 이력이라
대시보드에서 볼 값이 있다"고 판단했는데, **실 데이터를 보니 그렇지 않았습니다.**

| | |
|---|---|
| `verification_logs` 테이블 | **없음** — dev 스키마에 로그·이력 테이블이 하나도 없습니다 |
| `GET /verification-logs` | 범위 밖 |
| `popcorn_movies.approved_by` | **5,309편 전부 `initial-dataset`**, 시각도 전부 동일 |
| 반려된 영화 | **0편** |

`popcorn_movies`로 대신 만들어도 **같은 이름·같은 시각이 여섯 줄** 뜹니다.
게다가 그 컬럼은 마지막 상태만 갖습니다 — 반려했다 인증하면 앞 기록이 사라져
"이력"이 되지 못합니다.

### 영화 상세의 검증 이력은 남겼습니다

`movies/[id]`가 `logs`를 그대로 씁니다. 스토어의 `logs`와 `MOCK_LOGS`도 유지했습니다.
그 화면은 한 영화의 이력을 보여주는 별개 surface이고, 되살릴 때 모델이 필요합니다.

### 대시보드가 두 줄로 줄었습니다

```
배치 실행 현황              (전체 폭)
인증대기 목록 | 빠른 이동    (3fr 2fr)
```

`최근 검토 활동`이 빠지면서 `인증대기 목록`이 짝을 잃어, 아래 줄의 `빠른 이동`과
한 줄로 합쳤습니다.

되살리려면 두 섹션을 되돌리고 `.split` 두 줄로 다시 나누면 됩니다.
**`WEEKLY`는 목 상수였습니다** — 실제로 쓰려면 집계를 API가 내려줘야 합니다.

---

## 2026-08-11 제거 — 대시보드의 `빠른 이동`

| 어디 | 뺀 것 |
|---|---|
| `src/app/page.tsx` | `빠른 이동` 패널과 `shortcuts` 배열 |
| `src/app/page.module.css` | `.split` · `.kpiBrand` · `.kpiInformative` |

사이드바에 같은 메뉴가 이미 있어 중복이었습니다.

### 대시보드에 `.split`이 하나도 남지 않았습니다

`빠른 이동`이 빠지며 `인증대기 목록`이 짝을 잃어 전체 폭으로 꺼냈습니다.
이제 모든 패널이 한 줄씩 씁니다 —

```
영화 인증 현황 · 서비스 전체 현황 · 회원 관리 현황   (요약 카드)
배치 실행 현황        (전체 폭)
인증대기 목록         (전체 폭)
```

되살리려면 `shortcuts` 배열과 패널을 되돌리고 `.split`으로 `인증대기 목록`과 다시 묶으면 됩니다.

**`.shortcutIcon`은 남겼습니다** — 배치 실행 현황의 아이콘이 씁니다.

---

## 2026-08-11 제거 — 감상평 신고 (데이터 모델까지)

**PR #3에서 화면만 뺐고 모델은 남겨뒀는데, 이번 MVP에 안 넣기로 해서 전부 지웠습니다.**

| 어디 | 뺀 것 |
|---|---|
| `src/lib/mock.ts` | `Review.report_count` · `Member.report_count`와 모든 값 |
| `src/app/reviews/page.module.css` | `.reportCount` |
| 명세 | `Review.report_count` · `Member.report_count` · `ReviewSummary.reported` |
| | `DashboardSummary.reviews.reported` · `GET /reviews`의 `reported` 쿼리 |
| | 태그 설명 `감상평·신고 관리` → **`감상평 관리`** |
| DB | `dev.reviews`에 **컬럼이 애초에 없습니다** |

**명세의 `required`에 있던 게 문제였습니다.** DB에 컬럼이 없는데 백엔드가 반드시
내려줘야 하는 필드로 적혀 있었습니다. 못 지키는 약속입니다.

되살리려면 `reviews`에 `report_count` 컬럼을 만드는 마이그레이션부터 필요합니다.

---

## 2026-08-11 변경 — 팝콘점수를 DB에 맞춤 (0~100 → 0.5~5.0)

제거가 아니라 **척도 정정**입니다.

| | 전 | 후 |
|---|---|---|
| 목 데이터 | `95` · `88` · `10` | **`5.0` · `4.5` · `0.5`** |
| 화면 | `width: {rating}%` 막대 | **아이콘 5개** (`components/popcorn-score.tsx`) |
| 명세 | `integer, 0~100` | **`number, 0.5~5.0, multipleOf 0.5`** |

**DB가 맞습니다.** `dev.reviews.rating`이 `numeric(2,1)`이고
`CHECK (rating >= 0.5 AND rating <= 5.0)`으로 막습니다.

그대로 뒀다면 실 데이터를 붙이는 순간 **막대가 5%짜리로** 그려졌습니다.

### 아이콘은 별이지만 이름은 팝콘점수입니다

**Seed 아이콘 팩에 팝콘이 없어 별로 대체했습니다.** 화면의 이름은 `팝콘점수` 그대로입니다.
팝콘 아이콘이 생기면 `popcorn-score.tsx`의 `IconStarFill`·`IconStarEmpty`만 바꾸면 됩니다.

0.5점은 아이콘을 반만 보여야 하는데 잘라낼 방법이 없어, 빈 것 5개를 깔고 그 위에
채운 것 5개를 얹은 뒤 위층의 폭을 백분율로 자릅니다.

---

## 되살릴 때 같이 볼 것

- `openapi.yaml`의 해당 태그·엔드포인트에서 `⚠️ 이번 개발 범위 아님` 제거
- `npm run docs:notion` 다시 실행 → Notion 페이지 갱신
  (표의 ⚠️ 표시는 태그 설명을 읽어 자동으로 붙고 사라집니다)
- DB 테이블이 여전히 없다면 `user-domain-draft.sql` 확인
