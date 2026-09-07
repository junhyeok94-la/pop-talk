# 팝콘톡 Admin API 명세

관리자 콘솔이 쓰는 API입니다. 화면 10개가 실제로 호출하는 것만 담았습니다.

<table fit-page-width="true" header-row="true">
	<tr>
		<td>항목</td>
		<td>값</td>
	</tr>
	<tr>
		<td>버전</td>
		<td>0.1.0</td>
	</tr>
	<tr>
		<td>엔드포인트</td>
		<td>35개</td>
	</tr>
	<tr>
		<td>명세 읽기</td>
		<td>https://poptalkadmin.vercel.app/api-docs.html</td>
	</tr>
	<tr>
		<td>직접 호출</td>
		<td>https://poptalkadmin.vercel.app/api-swagger.html</td>
	</tr>
	<tr>
		<td>관리자 화면</td>
		<td>https://poptalkadmin.vercel.app</td>
	</tr>
	<tr>
		<td>원본</td>
		<td>`docs/openapi.yaml` (GitHub)</td>
	</tr>
</table>

> **이 페이지는 `openapi.yaml`에서 자동 생성했습니다.**<br>여기서 직접 고치지 마세요 — 다음에 다시 생성하면 사라집니다.<br>내용을 바꾸려면 `openapi.yaml`을 고치고 `npm run docs:notion`을 다시 돌린 뒤 통째로 갈아끼우세요.

## 서버

<table fit-page-width="true" header-row="true">
	<tr>
		<td>주소</td>
		<td>용도</td>
	</tr>
	<tr>
		<td>`https://api.poptalk.kr/admin/v1`</td>
		<td>운영</td>
	</tr>
	<tr>
		<td>`http://localhost:9000/admin/v1`</td>
		<td>로컬 — 직접 띄운 백엔드 (아키텍처 문서의 backend 포트 9000)</td>
	</tr>
	<tr>
		<td>`http://localhost:4010`</td>
		<td>목 서버 — npx @stoplight/prism-cli mock docs/openapi.yaml -p 4010</td>
	</tr>
</table>

## 공통 규약

<table fit-page-width="true" header-row="true">
	<tr>
		<td>항목</td>
		<td>규칙</td>
	</tr>
	<tr>
		<td>목록</td>
		<td>`page`(1부터) · `size`(기본 10, 최대 100). 응답에 `page`·`size`·`total`·`total_pages`</td>
	</tr>
	<tr>
		<td>날짜</td>
		<td>날짜 `YYYY-MM-DD`, 시각 `YYYY-MM-DD HH:mm:ss` (KST)</td>
	</tr>
	<tr>
		<td>기간 필터</td>
		<td>`*_from` · `*_to`, 양끝 포함. 한쪽만 주면 그쪽만 제한</td>
	</tr>
	<tr>
		<td>부분 수정</td>
		<td>`PATCH` + 바꿀 필드만. 빈 객체는 400</td>
	</tr>
	<tr>
		<td>오류</td>
		<td>RFC 9457 `application/problem+json`</td>
	</tr>
	<tr>
		<td>인증</td>
		<td>`Authorization: Bearer ＜JWT＞` 전제입니다. **다만 관리자 로그인은 이번 범위가 아니라 토큰 발급 경로가 없습니다.** 감사 정보(`approved_by`)를 무엇으로 채울지도 미정입니다</td>
	</tr>
</table>

## 엔드포인트 한눈에 보기

<table fit-page-width="true" header-row="true">
	<tr>
		<td>메서드</td>
		<td>경로</td>
		<td>설명</td>
		<td>인증</td>
	</tr>
	<tr>
		<td>`POST`</td>
		<td>`/auth/login`</td>
		<td>로그인 ⚠️ **이번 개발 범위 아님**</td>
		<td>불필요</td>
	</tr>
	<tr>
		<td>`POST`</td>
		<td>`/auth/refresh`</td>
		<td>액세스 토큰 갱신 ⚠️ **이번 개발 범위 아님**</td>
		<td>불필요</td>
	</tr>
	<tr>
		<td>`POST`</td>
		<td>`/auth/logout`</td>
		<td>로그아웃 ⚠️ **이번 개발 범위 아님**</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`GET`</td>
		<td>`/movies`</td>
		<td>영화 목록</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`GET`</td>
		<td>`/movies/{movieId}`</td>
		<td>영화 상세</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`PATCH`</td>
		<td>`/movies/{movieId}`</td>
		<td>영화 정보 수정</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`PUT`</td>
		<td>`/movies/{movieId}/approval`</td>
		<td>인증 상태 변경 (인증 / 반려 / 재검토 복귀)</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`PUT`</td>
		<td>`/movies/{movieId}/service-status`</td>
		<td>노출 상태 변경 (⚠️ 이번 개발 범위 아님)</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`POST`</td>
		<td>`/movies/{movieId}/embedding`</td>
		<td>추천 임베딩 재생성 요청</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`GET`</td>
		<td>`/movie-categories`</td>
		<td>영화 카테고리 목록</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`POST`</td>
		<td>`/movie-categories`</td>
		<td>카테고리 추가</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`PATCH`</td>
		<td>`/movie-categories/{categoryId}`</td>
		<td>카테고리 수정</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`DELETE`</td>
		<td>`/movie-categories/{categoryId}`</td>
		<td>카테고리 삭제</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`GET`</td>
		<td>`/display-categories`</td>
		<td>화면 문구 목록</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`POST`</td>
		<td>`/display-categories`</td>
		<td>화면 문구 추가</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`PATCH`</td>
		<td>`/display-categories/{categoryId}`</td>
		<td>화면 문구 수정</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`DELETE`</td>
		<td>`/display-categories/{categoryId}`</td>
		<td>화면 문구 삭제</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`GET`</td>
		<td>`/reviews`</td>
		<td>감상평 목록</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`PUT`</td>
		<td>`/reviews/{reviewId}/status`</td>
		<td>감상평 상태 변경 (정상 / 숨김 / 삭제)</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`GET`</td>
		<td>`/members`</td>
		<td>회원 목록</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`GET`</td>
		<td>`/members/{memberId}`</td>
		<td>회원 상세 (계정 탭)</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`PUT`</td>
		<td>`/members/{memberId}/status`</td>
		<td>회원 상태 변경 (이용 정지 / 정지 해제) (⚠️ 이번 개발 범위 아님)</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`GET`</td>
		<td>`/members/{memberId}/survey`</td>
		<td>가입 시 취향 설문 (취향 설문 탭)</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`GET`</td>
		<td>`/members/{memberId}/preference-updates`</td>
		<td>취향 갱신 이력 (취향 갱신 탭) (⚠️ 이번 개발 범위 아님)</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`GET`</td>
		<td>`/admins`</td>
		<td>관리자 목록 ⚠️ **이번 개발 범위 아님**</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`POST`</td>
		<td>`/admins`</td>
		<td>관리자 추가 ⚠️ **이번 개발 범위 아님**</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`PATCH`</td>
		<td>`/admins/{adminId}`</td>
		<td>관리자 정보 수정 ⚠️ **이번 개발 범위 아님**</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`PUT`</td>
		<td>`/admins/{adminId}/status`</td>
		<td>관리자 계정 정지 / 활성화 ⚠️ **이번 개발 범위 아님**</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`GET`</td>
		<td>`/admins/me`</td>
		<td>로그인한 관리자 정보 ⚠️ **이번 개발 범위 아님**</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`GET`</td>
		<td>`/push-messages`</td>
		<td>푸시 목록 ⚠️ **이번 개발 범위 아님**</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`POST`</td>
		<td>`/push-messages`</td>
		<td>푸시 작성 (임시저장 / 예약 / 즉시 발송) ⚠️ **이번 개발 범위 아님**</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`GET`</td>
		<td>`/verification-logs`</td>
		<td>검증 로그 ⚠️ **이번 개발 범위 아님**</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`GET`</td>
		<td>`/batch-runs`</td>
		<td>배치 실행 이력</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`GET`</td>
		<td>`/dashboard/summary`</td>
		<td>대시보드 집계</td>
		<td>필요</td>
	</tr>
	<tr>
		<td>`GET`</td>
		<td>`/health`</td>
		<td>헬스체크</td>
		<td>불필요</td>
	</tr>
</table>

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

<table fit-page-width="true" header-row="true">
	<tr>
		<td>이름</td>
		<td>필수</td>
		<td>타입</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`page`</td>
		<td></td>
		<td>integer</td>
		<td>1부터 시작</td>
	</tr>
	<tr>
		<td>`size`</td>
		<td></td>
		<td>integer</td>
		<td></td>
	</tr>
	<tr>
		<td>`approval_status`</td>
		<td></td>
		<td>string</td>
		<td>여러 개면 콤마로 구분</td>
	</tr>
	<tr>
		<td>`service_status`</td>
		<td></td>
		<td>DRAFT · PUBLISHED · HIDDEN</td>
		<td></td>
	</tr>
	<tr>
		<td>`genre`</td>
		<td></td>
		<td>string</td>
		<td>장르 정확 일치. `genres` 배열에 포함되면 매칭</td>
	</tr>
	<tr>
		<td>`q`</td>
		<td></td>
		<td>string</td>
		<td>제목·감독·배우 부분 일치</td>
	</tr>
	<tr>
		<td>`synced_from`</td>
		<td></td>
		<td>string</td>
		<td>수집일시 시작</td>
	</tr>
	<tr>
		<td>`synced_to`</td>
		<td></td>
		<td>string</td>
		<td></td>
	</tr>
	<tr>
		<td>`approved_from`</td>
		<td></td>
		<td>string</td>
		<td>인증일시 시작. 인증완료 화면의 기간 필터</td>
	</tr>
	<tr>
		<td>`approved_to`</td>
		<td></td>
		<td>string</td>
		<td></td>
	</tr>
	<tr>
		<td>`sort`</td>
		<td></td>
		<td>release_date:desc · release_date:asc · created_at:desc · pop_talk_score:desc</td>
		<td></td>
	</tr>
</table>

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

<table fit-page-width="true" header-row="true">
	<tr>
		<td>이름</td>
		<td>필수</td>
		<td>타입</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`page`</td>
		<td></td>
		<td>integer</td>
		<td>1부터 시작</td>
	</tr>
	<tr>
		<td>`size`</td>
		<td></td>
		<td>integer</td>
		<td></td>
	</tr>
	<tr>
		<td>`type`</td>
		<td></td>
		<td>GENRE · MOOD · THEME · RATING</td>
		<td></td>
	</tr>
</table>

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

<table fit-page-width="true" header-row="true">
	<tr>
		<td>이름</td>
		<td>필수</td>
		<td>타입</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`page`</td>
		<td></td>
		<td>integer</td>
		<td>1부터 시작</td>
	</tr>
	<tr>
		<td>`size`</td>
		<td></td>
		<td>integer</td>
		<td></td>
	</tr>
	<tr>
		<td>`is_active`</td>
		<td></td>
		<td>boolean</td>
		<td></td>
	</tr>
</table>

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

<table fit-page-width="true" header-row="true">
	<tr>
		<td>이름</td>
		<td>필수</td>
		<td>타입</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`page`</td>
		<td></td>
		<td>integer</td>
		<td>1부터 시작</td>
	</tr>
	<tr>
		<td>`size`</td>
		<td></td>
		<td>integer</td>
		<td></td>
	</tr>
	<tr>
		<td>`status`</td>
		<td></td>
		<td>NORMAL · HIDDEN · DELETED</td>
		<td></td>
	</tr>
	<tr>
		<td>`member_id`</td>
		<td></td>
		<td>integer</td>
		<td>회원 상세의 감상평 탭이 사용</td>
	</tr>
	<tr>
		<td>`q`</td>
		<td></td>
		<td>string</td>
		<td>작성자·영화·내용 부분 일치</td>
	</tr>
	<tr>
		<td>`created_from`</td>
		<td></td>
		<td>string</td>
		<td></td>
	</tr>
	<tr>
		<td>`created_to`</td>
		<td></td>
		<td>string</td>
		<td></td>
	</tr>
	<tr>
		<td>`sort`</td>
		<td></td>
		<td>string</td>
		<td></td>
	</tr>
</table>

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

<table fit-page-width="true" header-row="true">
	<tr>
		<td>이름</td>
		<td>필수</td>
		<td>타입</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`page`</td>
		<td></td>
		<td>integer</td>
		<td>1부터 시작</td>
	</tr>
	<tr>
		<td>`size`</td>
		<td></td>
		<td>integer</td>
		<td></td>
	</tr>
	<tr>
		<td>`status`</td>
		<td></td>
		<td>ACTIVE · SUSPENDED · WITHDRAWN</td>
		<td></td>
	</tr>
	<tr>
		<td>`q`</td>
		<td></td>
		<td>string</td>
		<td>이름·이메일 부분 일치</td>
	</tr>
	<tr>
		<td>`joined_from`</td>
		<td></td>
		<td>string</td>
		<td></td>
	</tr>
	<tr>
		<td>`joined_to`</td>
		<td></td>
		<td>string</td>
		<td></td>
	</tr>
	<tr>
		<td>`sort`</td>
		<td></td>
		<td>string</td>
		<td></td>
	</tr>
</table>

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

<table fit-page-width="true" header-row="true">
	<tr>
		<td>이름</td>
		<td>필수</td>
		<td>타입</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`page`</td>
		<td></td>
		<td>integer</td>
		<td>1부터 시작</td>
	</tr>
	<tr>
		<td>`size`</td>
		<td></td>
		<td>integer</td>
		<td></td>
	</tr>
</table>

응답 — `200` `PageMeta` + 목록

### admins — 관리자 관리 (⚠️ 이번 개발 범위 아님)

#### `GET` `/admins`

**관리자 목록**

**`dev.admins_service` 뷰를 읽으세요.** `dev.users`에서 `role <> 'MEMBER'`인

파라미터

<table fit-page-width="true" header-row="true">
	<tr>
		<td>이름</td>
		<td>필수</td>
		<td>타입</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`page`</td>
		<td></td>
		<td>integer</td>
		<td>1부터 시작</td>
	</tr>
	<tr>
		<td>`size`</td>
		<td></td>
		<td>integer</td>
		<td></td>
	</tr>
	<tr>
		<td>`status`</td>
		<td></td>
		<td>ACTIVE · SUSPENDED</td>
		<td></td>
	</tr>
	<tr>
		<td>`q`</td>
		<td></td>
		<td>string</td>
		<td></td>
	</tr>
</table>

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

<table fit-page-width="true" header-row="true">
	<tr>
		<td>이름</td>
		<td>필수</td>
		<td>타입</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`page`</td>
		<td></td>
		<td>integer</td>
		<td>1부터 시작</td>
	</tr>
	<tr>
		<td>`size`</td>
		<td></td>
		<td>integer</td>
		<td></td>
	</tr>
	<tr>
		<td>`status`</td>
		<td></td>
		<td>SENT · SCHEDULED · DRAFT</td>
		<td></td>
	</tr>
</table>

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

<table fit-page-width="true" header-row="true">
	<tr>
		<td>이름</td>
		<td>필수</td>
		<td>타입</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`page`</td>
		<td></td>
		<td>integer</td>
		<td>1부터 시작</td>
	</tr>
	<tr>
		<td>`size`</td>
		<td></td>
		<td>integer</td>
		<td></td>
	</tr>
	<tr>
		<td>`action`</td>
		<td></td>
		<td>APPROVE · REJECT · RESTORE · EDIT</td>
		<td></td>
	</tr>
	<tr>
		<td>`admin`</td>
		<td></td>
		<td>string</td>
		<td>처리한 관리자 이름</td>
	</tr>
	<tr>
		<td>`q`</td>
		<td></td>
		<td>string</td>
		<td>영화 제목 부분 일치</td>
	</tr>
	<tr>
		<td>`created_from`</td>
		<td></td>
		<td>string</td>
		<td></td>
	</tr>
	<tr>
		<td>`created_to`</td>
		<td></td>
		<td>string</td>
		<td></td>
	</tr>
</table>

응답 — `200` `PageMeta` + 목록

### batches — 배치 실행 현황

#### `GET` `/batch-runs`

**배치 실행 이력**

대시보드의 "배치 실행 현황" 패널이 사용합니다.

파라미터

<table fit-page-width="true" header-row="true">
	<tr>
		<td>이름</td>
		<td>필수</td>
		<td>타입</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`page`</td>
		<td></td>
		<td>integer</td>
		<td>1부터 시작</td>
	</tr>
	<tr>
		<td>`size`</td>
		<td></td>
		<td>integer</td>
		<td></td>
	</tr>
	<tr>
		<td>`job_name`</td>
		<td></td>
		<td>string</td>
		<td></td>
	</tr>
	<tr>
		<td>`status`</td>
		<td></td>
		<td>PENDING · PROCESSING · SUCCEEDED · FAILED</td>
		<td></td>
	</tr>
</table>

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

<table fit-page-width="true" header-row="true">
	<tr>
		<td>필드</td>
		<td>타입</td>
		<td>필수</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`id`</td>
		<td>integer</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`kofic_movie_cd`</td>
		<td>string</td>
		<td>✅</td>
		<td>KOFIC 영화 코드. 필수·유니크한 원천 키</td>
	</tr>
	<tr>
		<td>`kmdb_id`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`kmdb_matched`</td>
		<td>boolean</td>
		<td>✅</td>
		<td>false면 포스터·줄거리가 비어 있을 가능성이 높음 (실 데이터의 6%)</td>
	</tr>
	<tr>
		<td>`title_ko`</td>
		<td>string</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`title_en`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`title_original`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`release_date`</td>
		<td>string</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`production_year`</td>
		<td>integer · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`runtime_minutes`</td>
		<td>integer · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`movie_type`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`production_status`</td>
		<td>string · null</td>
		<td></td>
		<td>개봉 · 개봉예정</td>
	</tr>
	<tr>
		<td>`production_countries`</td>
		<td>array</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`representative_country`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`genres`</td>
		<td>array</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`representative_genre`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`directors`</td>
		<td>array</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`director_names_en`</td>
		<td>array</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`actors`</td>
		<td>array</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`actor_roles`</td>
		<td>array</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`production_companies`</td>
		<td>array</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`viewing_grade`</td>
		<td>string · null</td>
		<td></td>
		<td>KOFIC 원문 그대로. 목록에서는 축약해 보여줌</td>
	</tr>
	<tr>
		<td>`poster_url`</td>
		<td>string · null</td>
		<td></td>
		<td>비어 있으면 `media`의 대표 포스터를 씀 (그런 영화가 35편)</td>
	</tr>
	<tr>
		<td>`plot`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`source_keywords`</td>
		<td>array</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`service_status`</td>
		<td>DRAFT · PUBLISHED · HIDDEN</td>
		<td>✅</td>
		<td>준비중 · 노출중 · 숨김</td>
	</tr>
	<tr>
		<td>`approval_status`</td>
		<td>PENDING · APPROVED · REJECTED</td>
		<td>✅</td>
		<td>인증대기 · 인증완료 · 반려</td>
	</tr>
	<tr>
		<td>`approved_by`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`approved_at`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`rejection_reason`</td>
		<td>string · null</td>
		<td></td>
		<td>`approval_status=REJECTED`면 비어 있을 수 없음</td>
	</tr>
	<tr>
		<td>`source_system`</td>
		<td>string</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`source_hash`</td>
		<td>string</td>
		<td></td>
		<td>원본 행 변경 감지를 위한 SHA-256. 배치가 채우며 admin은 읽기만 합니다</td>
	</tr>
	<tr>
		<td>`source_synced_at`</td>
		<td>string</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`created_at`</td>
		<td>string</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`updated_at`</td>
		<td>string</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`is_embedded`</td>
		<td>boolean</td>
		<td></td>
		<td>뷰가 계산합니다. `PROFILE` 임베딩이 `READY`이고 벡터가 실제로 있는지.</td>
	</tr>
	<tr>
		<td>`media`</td>
		<td>array</td>
		<td></td>
		<td>포스터·스틸 전부. 영화당 평균 8.3개, 최대 53개</td>
	</tr>
	<tr>
		<td>`pop_talk_score`</td>
		<td>number · null</td>
		<td></td>
		<td>**DB에 아직 없는 컬럼.** 추가 예정</td>
	</tr>
	<tr>
		<td>`categories`</td>
		<td>array</td>
		<td></td>
		<td>**DB에 아직 테이블이 없음.** 추가 예정</td>
	</tr>
</table>

### `MovieSummary`

서비스 영화 화면의 요약 카드 4장

<table fit-page-width="true" header-row="true">
	<tr>
		<td>필드</td>
		<td>타입</td>
		<td>필수</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`total`</td>
		<td>integer</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`published`</td>
		<td>integer</td>
		<td>✅</td>
		<td>노출 중</td>
	</tr>
	<tr>
		<td>`pending`</td>
		<td>integer</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`approved`</td>
		<td>integer</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`rejected`</td>
		<td>integer</td>
		<td>✅</td>
		<td></td>
	</tr>
</table>

### `Member`

`dev.users` — 앱 사용자 테이블입니다. `id`는 **uuid**입니다.

<table fit-page-width="true" header-row="true">
	<tr>
		<td>필드</td>
		<td>타입</td>
		<td>필수</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`id`</td>
		<td>string</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`nickname`</td>
		<td>string</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`email`</td>
		<td>string</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`status`</td>
		<td>ACTIVE · SUSPENDED · WITHDRAWN</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`joined_at`</td>
		<td>string</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`status_updated_by`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`status_updated_at`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`status_reason`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`review_count`</td>
		<td>integer</td>
		<td>✅</td>
		<td>뷰가 집계</td>
	</tr>
	<tr>
		<td>`avg_rating`</td>
		<td>number · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`has_survey`</td>
		<td>boolean</td>
		<td>✅</td>
		<td></td>
	</tr>
</table>

### `Review`

<table fit-page-width="true" header-row="true">
	<tr>
		<td>필드</td>
		<td>타입</td>
		<td>필수</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`id`</td>
		<td>string</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`member_id`</td>
		<td>string</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`author`</td>
		<td>string</td>
		<td>✅</td>
		<td>회원 닉네임</td>
	</tr>
	<tr>
		<td>`source_system`</td>
		<td>string · null</td>
		<td></td>
		<td>감상평의 출처. `dev.reviews.source_system`입니다.</td>
	</tr>
	<tr>
		<td>`movie_id`</td>
		<td>integer</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`movie`</td>
		<td>string</td>
		<td>✅</td>
		<td>영화 제목</td>
	</tr>
	<tr>
		<td>`rating`</td>
		<td>number</td>
		<td>✅</td>
		<td>팝콘점수. `dev.reviews.rating`이 `numeric(2,1)`이고</td>
	</tr>
	<tr>
		<td>`content`</td>
		<td>string</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`status`</td>
		<td>NORMAL · HIDDEN · DELETED</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`created_at`</td>
		<td>string</td>
		<td>✅</td>
		<td></td>
	</tr>
</table>

### `Admin`

<table fit-page-width="true" header-row="true">
	<tr>
		<td>필드</td>
		<td>타입</td>
		<td>필수</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`id`</td>
		<td>integer</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`name`</td>
		<td>string</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`email`</td>
		<td>string</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`role`</td>
		<td>ADMIN · SUPER_ADMIN</td>
		<td>✅</td>
		<td>관리자 권한입니다. `SUPER_ADMIN`만 관리자를 추가·정지할 수 있습니다.</td>
	</tr>
	<tr>
		<td>`status`</td>
		<td>ACTIVE · SUSPENDED</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`joined_at`</td>
		<td>string</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`last_login`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`created_by`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
</table>

### `BatchRun`

`dev.batch_runs`

<table fit-page-width="true" header-row="true">
	<tr>
		<td>필드</td>
		<td>타입</td>
		<td>필수</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`id`</td>
		<td>integer</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`job_name`</td>
		<td>string</td>
		<td>✅</td>
		<td>자유 문자열. `load-initial-movies` 등</td>
	</tr>
	<tr>
		<td>`scheduled_for`</td>
		<td>string</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`status`</td>
		<td>PENDING · PROCESSING · SUCCEEDED · FAILED</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`source_hash`</td>
		<td>string</td>
		<td></td>
		<td>원본 파일 SHA-256. 같은 파일을 두 번 적재했는지 판별합니다</td>
	</tr>
	<tr>
		<td>`source_file`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`processed_count`</td>
		<td>integer</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`inserted_count`</td>
		<td>integer</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`updated_count`</td>
		<td>integer</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`failed_count`</td>
		<td>integer</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`result`</td>
		<td>object</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`last_error`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`started_at`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
	<tr>
		<td>`finished_at`</td>
		<td>string · null</td>
		<td></td>
		<td></td>
	</tr>
</table>

### `Health`

`apps/api`의 `GET /health` 응답. 구현을 그대로 따릅니다.

<table fit-page-width="true" header-row="true">
	<tr>
		<td>필드</td>
		<td>타입</td>
		<td>필수</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`status`</td>
		<td>ok · degraded</td>
		<td>✅</td>
		<td>이 서버가 정상인지. DB에 못 붙으면 `degraded`</td>
	</tr>
	<tr>
		<td>`database`</td>
		<td>connected · unreachable</td>
		<td>✅</td>
		<td>PostgreSQL 연결 상태. 원인 메시지는 담지 않습니다</td>
	</tr>
	<tr>
		<td>`timestamp`</td>
		<td>string</td>
		<td>✅</td>
		<td>점검한 시각 (ISO 8601)</td>
	</tr>
</table>

### `LoginResult`

<table fit-page-width="true" header-row="true">
	<tr>
		<td>필드</td>
		<td>타입</td>
		<td>필수</td>
		<td>설명</td>
	</tr>
	<tr>
		<td>`access_token`</td>
		<td>string</td>
		<td>✅</td>
		<td>`Authorization: Bearer ＜값＞`으로 보냅니다. 메모리에만 두세요</td>
	</tr>
	<tr>
		<td>`token_type`</td>
		<td>string</td>
		<td>✅</td>
		<td></td>
	</tr>
	<tr>
		<td>`expires_in`</td>
		<td>integer</td>
		<td>✅</td>
		<td>초. 900 = 15분</td>
	</tr>
	<tr>
		<td>`admin`</td>
		<td>object</td>
		<td>✅</td>
		<td></td>
	</tr>
</table>

## 백엔드 없이 먼저 시작하기

명세만으로 목 서버가 뜹니다. 프런트는 백엔드를 기다릴 필요가 없습니다.

```bash
npx @stoplight/prism-cli mock docs/openapi.yaml -p 4010 --cors
```

Swagger UI에서 **Servers**를 `http://localhost:4010`으로 고르고 `Authorize`에
아무 문자열이나 넣으면 문서에서 바로 호출됩니다.

## 아직 정해지지 않은 것

<table fit-page-width="true" header-row="true">
	<tr>
		<td>항목</td>
		<td>상태</td>
	</tr>
	<tr>
		<td>인증 방식</td>
		<td>액세스 15분 + 리프레시 14일 회전은 **제안**입니다. SSO 여부·만료 정책은 팀 결정</td>
	</tr>
	<tr>
		<td>영화 점수</td>
		<td>`movies.pop_talk_score`로 **생겼습니다**. 다만 admin이 보는 `popcorn_movies`에는 없습니다</td>
	</tr>
	<tr>
		<td>`categories`</td>
		<td>테이블 없음. 초안은 `docs/category-domain-draft.sql` (미실행)</td>
	</tr>
	<tr>
		<td>`/members` 계열 7개</td>
		<td>테이블은 생겼으나 **구조가 다름** — 실제는 `users.id`가 uuid, `role` 없음, `reviews.rating`</td>
	</tr>
	<tr>
		<td>취향 갱신 배치</td>
		<td>일정상 **이번 범위 아님**. `/members/{memberId}/preference-updates`도 함께 보류</td>
	</tr>
	<tr>
		<td>backend 포트</td>
		<td>아키텍처 문서 9000 · 실제 ACG 8000. 명세는 문서 기준</td>
	</tr>
</table>

회원 도메인은 `docs/user-domain-draft.sql`의 열린 질문 8개가 정해지면 응답 필드가 바뀝니다.
인프라 관련 사항은 `docs/infra-findings.md`를 참고하세요.
