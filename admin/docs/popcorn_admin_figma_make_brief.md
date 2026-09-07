# 팝콘챌린지 — 어드민 콘솔 빌드 브리프 (Figma Make용)

> 이 문서를 Figma Make 프롬프트에 붙여넣거나 첨부하세요.
> 함께 첨부하면 좋은 파일: `popcorn_admin_flow.png`, `popcorn_admin_sequence.png` (화면 전환·액션 로직 시각 레퍼런스)

---

## 0. 한 줄 시작 프롬프트 (그대로 사용)

"영화 추천 서비스 '팝콘챌린지'의 **관리자 웹 콘솔**을 만들어줘. 좌측 사이드바 네비게이션 + 우측 콘텐츠 영역의 데이터 중심 어드민 레이아웃이고, 아래 사양의 화면들을 반응형으로 구현해줘. 목업 데이터로 동작하게 해줘."

---

## 1. 제품 개요

팝콘챌린지는 KMDB의 2020년대 한국영화 데이터를 수집하고, Clova로 카테고리·팝콘점수를 자동 부여한 뒤, **관리자가 검토·인증한 영화만** 사용자에게 노출하는 추천 서비스다. 이 콘솔은 관리자가 영화 데이터를 검토하고 인증/수정/보류/반려하는 **운영 도구**다.

핵심 업무 흐름: 검토 대기(PENDING) 영화를 확인 → 상세 검토 → 판정(검토완료·수정·보류·반려) → 인증완료된 영화만 서비스에 노출.

---

## 2. 디자인 방향 (톤 & 스타일)

- 깔끔하고 정보 밀도 높은 **B2B 어드민 대시보드** 스타일 (Linear, Retool, Vercel Dashboard 느낌)
- 라이트 모드 기본, 뉴트럴 그레이 배경 + 포인트 컬러 1개(딥 오렌지 계열, 팝콘 연상)
- 좌측 고정 사이드바(아이콘+라벨) + 상단 얇은 헤더(검색, 관리자 프로필) + 우측 메인 콘텐츠
- 테이블·카드·뱃지·모달 중심. 폰트는 Pretendard 또는 Inter, 한글 가독성 우선
- 데이터 테이블은 정렬·필터·페이지네이션 포함

### 상태 뱃지 색상 규칙 (전역 공통)

| 상태 | 라벨 | 색상 |
|---|---|---|
| PENDING | 검토대기 | 회색 |
| APPROVED | 인증완료 | 초록 |
| HOLD | 보류 | 노랑/앰버 |
| REJECTED | 반려 | 빨강 |

---

## 3. 사이드바 네비게이션 (전 화면 공통)

상단 로고 "🍿 팝콘챌린지 Admin" 아래 메뉴:

1. 대시보드
2. 영화 검토 (검토 대기 큐) — 뱃지로 대기 건수 표시
3. 보류함
4. 반려함
5. 인증완료 영화
6. 카테고리 관리
7. 감상평 · 신고 관리
8. 회원 관리
9. 검증 로그

하단: 관리자 계정 정보 + 로그아웃.

---

## 4. 화면별 상세 사양

### 4-1. 로그인
- 중앙 정렬 카드. 로고 + "관리자 로그인" 타이틀
- [Google로 로그인] 버튼 (구글/사내 계정)
- 하단 안내 문구 "승인된 관리자만 접근할 수 있습니다."

### 4-2. 대시보드
상단에 KPI 카드 4개(가로 배열):
- 검토 대기 (PENDING) — 큰 숫자 + "오늘 +N"
- 인증 완료 (APPROVED)
- 보류 (HOLD)
- 반려 (REJECTED)

그 아래 2단 구성:
- 좌: **최근 검토 활동** 리스트 (관리자명 · 액션 · 영화 · 시각) — verification_logs 기반
- 우: **검토 대기 상위 목록** 미니 테이블 (제목 · 팝콘점수 · 적재일) + "전체 보기" 링크

(선택) 상단에 주간 검토 처리량 막대 차트.

### 4-3. 영화 검토 (검토 대기 큐) — 메인 목록
- 상단 필터 바: 상태 필터(전체/PENDING/HOLD/REJECTED/APPROVED), 장르 필터, 검색(제목/감독/배우), 개봉연도
- 데이터 테이블 컬럼: **포스터(썸네일) · 제목 · 개봉연도 · 관람등급 · 팝콘점수 · 대표 카테고리(칩) · 장르 · 상태(뱃지) · 적재일 · [검토] 버튼**
- 행 클릭 또는 [검토] 버튼 → 4-4 상세 검토로 이동
- 체크박스 다중 선택 → 일괄 인증완료/보류 액션 (선택 기능)
- 페이지네이션 + "총 N건" 표시

### 4-4. 영화 상세 검토 (핵심 화면)
좌우 2단 레이아웃.

**좌측(영화 정보 표시):**
- 포스터 이미지(큰 사이즈)
- 제목(국문/영문), 개봉일, 러닝타임, 관람등급, 국가
- 줄거리(synopsis)
- KMDB 원본 링크, kmdb_id
- 배우/감독 목록(칩)

**우측(검토 패널):**
- **Clova 자동 분류 결과** 섹션: 부여된 카테고리 칩 목록 + 각 신뢰도(%) 표시, 편집 가능
- **팝콘점수** 섹션: 현재 점수 표시 + 조정 슬라이더/입력
- **현재 상태 뱃지** + 최근 검증 이력 타임라인(이 영화의 verification_logs)
- **액션 버튼 영역** (하단 고정):
  - [검토완료] (초록, primary) → status=APPROVED, is_exposed=true
  - [수정] → 4-5 수정 폼/모달 열기
  - [보류] → 사유 입력 모달 → status=HOLD
  - [반려] → 사유 입력 모달 → status=REJECTED
  - [Clova 재분류] (보조) → 카테고리 재생성 요청

### 4-5. 수정 폼 / 모달 (EDIT)
- 카테고리 재지정: 카테고리 멀티셀렉트(추가/삭제), 각 항목 수동 지정 시 source=MANUAL 표시
- 팝콘점수 수정: 숫자 입력
- 메타 수정: 제목/줄거리/등급/포스터 URL 등 편집 필드
- [저장] 시 데이터만 갱신되고 상태는 PENDING 유지(재판정 유도), 변경 이력 기록 안내
- [취소]

### 4-6. 보류함
- HOLD 상태 영화 테이블 (컬럼: 제목 · 팝콘점수 · 보류 사유 · 보류일 · 담당자)
- 각 행 액션: [재검토(보류 취소)] → status=PENDING 복귀, [상세] → 4-4로 이동
- 상단에 "보류 사유별" 필터

### 4-7. 반려함
- REJECTED 상태 영화 테이블 (컬럼: 제목 · 반려 사유 · 반려일 · 담당자)
- 각 행 액션: [반려 취소] → status=PENDING 복귀
- 안내 배너: "반려된 영화는 사용자에게 노출되지 않으며, 재수집 제외 목록에 포함됩니다."

### 4-8. 인증완료 영화
- APPROVED 영화 테이블 (컬럼: 포스터 · 제목 · 팝콘점수 · 카테고리 · 노출 여부(is_exposed 토글) · 인증일 · 인증자)
- is_exposed 토글로 노출 on/off, [상세] 이동

### 4-9. 카테고리 관리
- 팝콘챌린지 상황 카테고리 CRUD 테이블
- 컬럼: 코드 · 이름(알약 문구) · 축(상황/취향) · 설명 · 정렬순서 · 활성 토글 · [편집][삭제]
- [+ 카테고리 추가] 버튼 → 생성 모달(코드/이름/축/설명/정렬)

### 4-10. 감상평 · 신고 관리
- 사용자 감상평 테이블: 작성자 · 영화 · 평점(팝콘점수) · 내용(요약) · 신고수 · 작성일 · 상태
- 신고된 항목 필터, 각 행 액션: [숨김][삭제][정상 처리]
- 행 클릭 시 감상평 전문 모달

### 4-11. 회원 관리
- 회원 테이블: 닉네임 · 이메일 · 가입일 · 설문완료 여부 · 리뷰수 · 상태(ACTIVE/DORMANT/WITHDRAWN)
- 검색 + 상태 필터, 각 행 [상세][정지]

### 4-12. 검증 로그
- verification_logs 전체 뷰 테이블: 시각 · 관리자 · 영화 · 액션(EDIT/APPROVE/HOLD/REJECT) · 이전상태 → 이후상태 · 사유(note)
- 관리자별/액션별/기간 필터

---

## 5. 상태값 & 액션 규칙 (상태 머신)

영화는 항상 하나의 상태를 가진다: **PENDING · APPROVED · HOLD · REJECTED**

| 현재 상태 | 액션 | 결과 상태 | is_exposed |
|---|---|---|---|
| PENDING | 검토완료 | APPROVED | true (노출) |
| PENDING | 수정(EDIT) | PENDING 유지 | false |
| PENDING | 보류 | HOLD | false |
| PENDING | 반려 | REJECTED | false |
| HOLD | 보류 취소 | PENDING | false |
| REJECTED | 반려 취소 | PENDING | false |

규칙: **APPROVED만 사용자에게 노출**된다. 모든 액션은 검증 로그(verification_logs)에 이전→이후 상태와 함께 기록된다. 보류/반려 시 사유(note) 입력이 필요하다.

---

## 6. 목업 데이터 (그대로 사용)

### 영화 (movies)
```json
[
  {"id":1,"title":"서울의 봄","release_year":2023,"movie_rating":"12","running_time":141,"popcorn_score":92.5,"genres":["드라마","액션"],"categories":["근현대사가 궁금해지는 실화·시대극","심장 쫄깃한 긴장감"],"status":"PENDING","poster":"포스터URL","director":"김성수","actors":["황정민","정우성"]},
  {"id":2,"title":"파묘","release_year":2024,"movie_rating":"15","running_time":134,"popcorn_score":88.0,"genres":["공포","미스터리"],"categories":["등골 서늘한 한국식 공포·오컬트"],"status":"APPROVED","poster":"포스터URL","director":"장재현","actors":["최민식","김고은","유해진"]},
  {"id":3,"title":"범죄도시4","release_year":2024,"movie_rating":"15","running_time":109,"popcorn_score":85.0,"genres":["범죄","액션"],"categories":["통쾌하게 터뜨리는 사이다 범죄·액션"],"status":"PENDING","poster":"포스터URL","director":"허명행","actors":["마동석"]},
  {"id":4,"title":"다음 소희","release_year":2023,"movie_rating":"15","running_time":138,"popcorn_score":82.5,"genres":["드라마"],"categories":["우리 사회를 다시 보게 하는 영화"],"status":"HOLD","hold_reason":"카테고리 재검토 필요","poster":"포스터URL","director":"정주리","actors":["배두나","김시은"]},
  {"id":5,"title":"헤어질 결심","release_year":2022,"movie_rating":"15","running_time":138,"popcorn_score":89.0,"genres":["멜로","미스터리"],"categories":["완성도로 승부하는 웰메이드 장르물"],"status":"REJECTED","reject_reason":"중복 데이터","poster":"포스터URL","director":"박찬욱","actors":["박해일","탕웨이"]}
]
```

### 카테고리 (categories)
```json
[
  {"id":1,"code":"FAMILY_TOGETHER","name":"가족과 둘러앉아 함께 볼 영화","axis":"SITUATION","is_active":true},
  {"id":2,"code":"CATHARSIS_ACTION","name":"통쾌하게 터뜨리는 사이다 범죄·액션","axis":"TASTE","is_active":true},
  {"id":3,"code":"TRUE_HISTORY","name":"근현대사가 궁금해지는 실화·시대극","axis":"TASTE","is_active":true},
  {"id":4,"code":"KOREAN_OCCULT","name":"등골 서늘한 한국식 공포·오컬트","axis":"TASTE","is_active":true},
  {"id":5,"code":"SOCIAL_REFLECT","name":"우리 사회를 다시 보게 하는 영화","axis":"TASTE","is_active":true}
]
```

### 검증 로그 (verification_logs)
```json
[
  {"time":"2026-08-05 14:20","admin":"김운영","movie":"파묘","action":"APPROVE","before":"PENDING","after":"APPROVED","note":""},
  {"time":"2026-08-05 13:55","admin":"김운영","movie":"다음 소희","action":"HOLD","before":"PENDING","after":"HOLD","note":"카테고리 재검토 필요"},
  {"time":"2026-08-05 11:10","admin":"이검수","movie":"헤어질 결심","action":"REJECT","before":"PENDING","after":"REJECTED","note":"중복 데이터"}
]
```

### 관리자 (admins)
```json
[{"id":1,"name":"김운영","email":"admin@popcorn.kr","role":"SUPER_ADMIN"},
 {"id":2,"name":"이검수","email":"reviewer@popcorn.kr","role":"ADMIN"}]
```

---

## 7. 우선순위 (한 번에 다 안 되면 이 순서로)

1. **대시보드 + 영화 검토 큐 + 영화 상세 검토 + 판정 액션** (핵심 검토 워크플로우)
2. 보류함 · 반려함 · 인증완료 영화
3. 카테고리 관리 · 검증 로그
4. 감상평·신고 관리 · 회원 관리

---

## 8. Figma Make 사용 팁

- 이 md를 첨부하고, 첫 프롬프트는 "위 사양대로 대시보드와 영화 검토 큐 화면부터 만들어줘"처럼 **화면 1~2개씩 점진적으로** 요청하면 결과 품질이 좋아진다.
- `popcorn_admin_flow.png`를 함께 첨부하고 "이 flow의 화면 전환을 반영해줘"라고 하면 라우팅이 정확해진다.
- 색/폰트는 "상태 뱃지 색상 규칙(2번 표)을 지켜줘"라고 명시.
- 목업 데이터는 6번 JSON을 그대로 쓰라고 지시하면 화면이 실제처럼 채워진다.
