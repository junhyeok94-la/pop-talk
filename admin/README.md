# 팝콘톡 Admin Console

POPCORN AI가 추천한 영화를 사람이 검수하고 인증하는 백오피스입니다.
사용자용 화면인 `pop_talk_fe`와 같은 스택·컨벤션을 씁니다.

| | |
|---|---|
| 화면 | **https://poptalkadmin.vercel.app** |
| API 명세 (읽기) | **https://poptalkadmin.vercel.app/api-docs.html** — Redoc |
| API 명세 (두드려보기) | **https://poptalkadmin.vercel.app/api-swagger.html** — Swagger UI, Try it out |

배포본의 영화 데이터는 실 DB에서 떠둔 스냅샷 300편입니다. 회원·감상평·관리자·푸시는
아직 테이블이 없어 목 데이터입니다. 자세한 내용은 [데이터 출처](#데이터-출처) 참고.

## 스택

- Next.js 16 (App Router) · React 19 · TypeScript
- [Seed Design](https://seed-design.io) — 컴포넌트, 디자인 토큰, 타이포 스케일, 아이콘
- CSS Modules (Tailwind 사용하지 않음)

### Seed 적용 범위

**토큰·타이포·폼·내비게이션은 전면 적용, 테이블만 직접 구현**입니다.

| 영역 | 상태 |
|---|---|
| 색·여백·반경 토큰 | 전면 적용 — 하드코딩된 색상값 없음 |
| 타이포 | 전면 적용 — `font-size` 하드코딩 0곳 |
| 폼 요소 | 전면 적용 — 네이티브 `input`/`select`/`textarea` 0곳 |
| 폼 라벨 구조 | `Field` (Root/Header/Label) — 21곳 |
| 사이드바 | `SideNavigation` + `GroupLabel` + `ItemCollapsible` + `Count` |
| 목록 (대시보드) | `List` |
| 아바타 / 빈 상태 / 스크린리더 텍스트 | `Avatar` / `ContentPlaceholder` / `VisuallyHidden` |
| 이미지 | `ImageFrame` (포스터 4곳) |
| 페이지네이션 | `Chip` |
| 확인 모달 / 툴팁 | `Dialog` / `HelpBubbleTooltip` |
| 동작 피드백 | `Snackbar` — 인증·인증취소·삭제·회원 정지 시 |
| 요약 카드·GNB 배치 | `Grid`·`VStack`·`HStack` |
| 페이지네이션 | `components/pagination.tsx` — 목록 9개 화면 공통 |
| 영화 목록 표 | `components/movie-table.tsx` — 서비스 영화·인증완료 영화 공통 |
| 포스터 | `components/movie-poster.tsx` — URL 없으면 자리만 채움 (실 데이터 20%가 없음) |
| **테이블** | **직접 구현** — Seed에 `Table`/`DataTable`이 없음 |

Seed 컴포넌트군 **26/86종**, 태그 기준 비중 **50%**(635 대 619)입니다.
남은 HTML은 `div`(162)·`span`(121)·`td`(84)·`th`(76)로, 대부분 **표 구조와 레이아웃 래퍼**입니다.
Seed에 `Table`/`DataTable`이 없어 대체 대상이 아닙니다.

**상태 뱃지는 `StateBadge`(Seed `Badge` 래퍼) 하나로 통일**했습니다. 예전에는 화면마다
`.statusTag`·`.actionTag`·`.changeTag`·`.reportTag`를 따로 만들어 같은 "정지"가 화면마다
다르게 보였습니다. Seed `Badge`의 tone 정의(positive=승인·완료, critical=거절·제재 …)가
이 도메인과 그대로 맞습니다.

### 테이블 타이포 규칙

Seed에는 표 전용 타이포 컴포넌트가 없어, 이미 쓰고 있는 Seed 타이포 스케일을 **두 단**으로만
씁니다. 예전엔 셀 안에 t1·t2·t4가 뒤섞여 9가지 조합이 있었습니다.

| 단 | 크기 | 쓰는 곳 |
|---|---|---|
| 본문 | `t3` (13px) | 이름·제목·내용 등 셀의 실제 값. 강조는 굵기(medium/bold)로만 |
| 보조 | `t2` (12px) | 날짜·시각처럼 값에 딸린 메타 정보 |

`t2`(12px)까지 내리면 보조 단과 같아져 두 단 구분이 사라지므로 본문은 `t3`가 하한입니다.

**셀 안의 아이콘은 `.table td svg { width: 1em }`으로 글자에 맞춥니다.** 화면마다
`size={10}`~`{14}`로 제각각이라 같은 행에서 아이콘만 크거나 작아 보였습니다.
토글은 Seed `Switch`의 최소 크기인 `size="16"`을 씁니다.

**행 높이를 결정하는 건 글자가 아니라 포스터입니다.** 3:4 비율이라 `width`의 1.33배가
행 높이 하한이 됩니다. 밀도를 조절하려면 `movie-poster.tsx`의 기본 `width`를 건드려야 합니다.

태그·뱃지(`t1`)는 Seed `Badge`와 크기를 맞춘 별개 요소라 이 규칙 밖입니다.

**`ui.muted`는 색만 담당하고 크기를 지정하지 않습니다.** 셀 기본값 `t4`를 상속받게 하려는
것으로, 예전처럼 여기에 `font-size`를 넣으면 이메일·사유 같은 본문이 통째로 작아집니다.
표 바깥(상세 화면, 페이지네이션 요약 등)에는 상속받을 크기가 없으므로 `ui.caption`
(= `muted` + `t2`)을 쓰세요.

### 사이드바 그룹

메뉴 10개를 하는 일 기준으로 네 그룹으로 묶고 접을 수 있게 했습니다.
평평하게 나열하면 "매일 여는 것"과 "분기에 한 번 여는 것"이 같은 무게로 보입니다.

| 그룹 | 메뉴 |
|---|---|
| *(단독)* | 대시보드 |
| 영화 검수 | 서비스 영화 · 인증완료 영화 |
| 콘텐츠 설정 | 카테고리 관리 · 화면 문구 관리 |
| 사용자 | 회원 관리 · 감상평 |

푸시 · 검증 로그 · 관리자 관리는 이번 범위에서 뺐습니다.
`운영` 그룹은 항목이 남지 않아 그룹째 없앴습니다.
[`docs/removed-features.md`](docs/removed-features.md)를 보세요.

**열림 상태는 `defaultOpen`이 아니라 직접 들고 있습니다.** `defaultOpen`은 마운트 때 한 번만
먹는데, 클라이언트 라우팅에서는 사이드바가 다시 마운트되지 않아 이동한 화면의 그룹이 접힌 채
남고 활성 메뉴가 숨습니다. 경로가 바뀌면 렌더 중에 그 그룹을 열고, 사용자가 열어둔 다른
그룹은 그대로 둡니다. effect가 아니라 렌더 중에 조정해야 한 프레임도 접힌 채 보이지 않습니다.

### 알아둘 점

**`Field` 안의 입력에는 `id`를 직접 주지 마세요.** `FieldLabel`이 `field:_r_N_:input` 형태의
id를 만들어 `for`로 연결하는데, 입력에 명시한 `id`가 이를 덮어써서 라벨 연결이 조용히 끊깁니다.
빌드·lint로는 안 잡히고 브라우저에서 `for` 대상이 존재하는지 확인해야 보입니다.

**`SelectValue`는 라벨이 아니라 원시 value를 출력합니다.** `ADMIN` → `관리자`처럼 값과 라벨이
다르면 그대로 노출되므로, `SelectField`에서 라벨을 직접 찾아 보여주도록 해두었습니다.

`SideNavigationRoot`는 반드시 `SideNavigationProvider` 안에 있어야 합니다.
빠뜨리면 빌드는 통과하고 런타임에 `useSideNavigationContext` 오류가 납니다.

푸시 작성의 CSV 업로드는 Seed `AttachmentInput`(FileUpload 프리미티브 기반)을 씁니다.
`accept`·`maxFiles`·숨김 input·트리거를 컴포넌트가 제공하므로 직접 만들 필요가 없습니다.

`Skeleton`은 목 데이터가 동기라 로딩 상태가 없어 아직 쓸 자리가 없습니다.

`ControlChip`은 자체적으로 deprecated 표기가 있고 후속 API(`Chip.Toggle`)는 이 버전에 아직
없어서, 현재 존재하는 `ChipRoot`+`ChipLabel`로 페이지네이션을 구성했습니다.

Seed 폼 컴포넌트는 기본이 전체 너비(모바일 기준)라, 가로 필터 바에서는
`styles/ui.module.css`의 `filterSelect`·`filterSearch`·`filterDate`로 폭을 제한해 씁니다.
새 필터를 추가할 때도 같은 방식으로 폭을 잡아야 한 줄에 들어갑니다.

`SideNavigationRoot`는 반드시 `SideNavigationProvider` 안에 있어야 합니다.
빠뜨리면 빌드는 통과하고 런타임에 `useSideNavigationContext` 오류가 납니다.

아이콘은 `@seed-design/react-icon`을 쓰는데 **이 패키지는 스스로 deprecated로 표기**하고 있습니다.
공개된 대체 패키지를 찾지 못해 그대로 두었습니다. 대응되는 아이콘이 없어 근사치로 바꾼 항목은
`src/lib/icons.ts`에 주석으로 남겨두었습니다.

## 실행

```bash
npm install
npm run dev
```

## API 문서

명세는 `docs/openapi.yaml` (OpenAPI 3.1, 엔드포인트 35개)이고, `npm run build`가 이를
정적 HTML **두 장**으로 만듭니다. 사람이 읽는 요약은 [`docs/api.md`](docs/api.md)입니다.

| 경로 | 도구 | 쓰임 |
|---|---|---|
| `/api-docs.html` | Redoc | 읽기. 스키마가 펼쳐져 있어 훑기 좋습니다 |
| `/api-swagger.html` | Swagger UI | 두드려보기. **Try it out**으로 실제 호출합니다 |

같은 명세를 두 방식으로 그린 것이라 내용은 동일합니다. 상단 머리띠에서 서로 오갑니다.

```bash
npm run docs:api                        # 문서만 다시 빌드
npm run docs:diff                       # origin/main 대비 깨뜨리는 변경 검사
npm run docs:verify                     # 만든 백엔드가 명세를 지키는지 검사
npm run docs:notion                     # Notion에 붙여넣을 마크다운 생성
npx @redocly/cli lint docs/openapi.yaml # 명세 검증
```

### 명세가 깨지는 변경은 CI가 막습니다

`docs/openapi.yaml`을 건드리는 PR에서 [`.github/workflows/api-spec.yml`](.github/workflows/api-spec.yml)이
세 가지를 봅니다. 깨뜨리는 변경이 있으면 **PR이 실패하고, 무엇이 깨지는지 댓글로 남습니다.**

1. 명세가 유효한가 — `redocly lint`
2. 이미 배포된 클라이언트를 깨뜨리는가 — `scripts/spec-diff.mjs`
3. 목 서버가 실제로 뜨고 응답하는가 — prism으로 호출

**diff 도구는 직접 만들었습니다.** `@redocly/cli`에는 diff 명령이 아예 없고,
npm `openapi-diff`는 OpenAPI 3.0까지만 읽습니다(이 명세는 3.1). 3.1을 제대로 보는
`oasdiff`는 Go 바이너리라 npm 프로젝트에 끌어오기 무겁습니다.

잡는 변경은 14가지입니다 — 엔드포인트·메서드·파라미터·응답 필드 삭제, 필수화,
타입 변경, 요청 enum 값 삭제, 성공 코드 삭제, 인증 요구 추가 등.
새 엔드포인트나 선택 파라미터 추가처럼 안전한 변경은 통과시킵니다.

**응답 enum 값 추가는 경고만 합니다.** 엄밀히는 깨뜨리는 변경이지만(클라이언트의
`switch`가 모르는 값을 만납니다) 상태값이 계속 늘어나는 단계라 빌드를 막지 않습니다.
`scripts/spec-diff.mjs`의 `BREAKING`에 넣으면 실패로 바뀝니다.

`allOf`는 펼쳐서 봅니다. 목록 응답이 전부 `allOf: [PageMeta, {items, summary}]` 꼴이라
펼치지 않으면 응답 검사가 통째로 비어버립니다. 못 잡는 항목은 스크립트 상단 주석에
적어뒀습니다.

### 서버 없이 먼저 붙일 수 있습니다

명세만으로 목 서버가 뜹니다. 백엔드가 나오기 전에 화면 개발을 시작할 수 있습니다.

```bash
npx @stoplight/prism-cli mock docs/openapi.yaml -p 4010
```

Swagger UI에서 **Servers**를 `http://localhost:4010`으로 고르고 `Authorize`에 아무 문자열이나
넣으면, 문서에서 바로 호출됩니다. 실제로 `GET /movies`가 `200`과 실 DB 레코드를 돌려주는 것을
확인했습니다.

| 확인한 것 | 결과 |
|---|---|
| `GET /movies` | 실 DB 값 그대로 응답 (총 5,985편, `summary` 포함) |
| 토큰 없이 호출 | `401` |
| `?page=abc` | `422` — 타입 검증이 명세만으로 동작 |
| 사유 없이 반려 | `400` |

응답 예시는 지어내지 않고 실 DB에서 가져왔습니다. 목 서버가 내려주는 영화는
`kofic_movie_cd=20254904` 실제 레코드입니다.

### Notion에 올릴 때

팀 문서가 Notion에 모여 있어 명세도 거기 둬야 한다면, **손으로 옮기지 마세요.**
명세가 바뀔 때마다 어긋나고, 어긋난 문서는 없는 것보다 나쁩니다.

```bash
npm run docs:notion     # docs/notion-api.md 생성 → 통째로 복사해 Notion에 붙여넣기
```

`openapi.yaml`에서 엔드포인트 표·파라미터·데이터 모델을 뽑아 마크다운으로 만듭니다.
Notion은 마크다운 표·제목·코드블록을 그대로 받습니다.
명세를 고치면 다시 생성해 **통째로 갈아끼우세요.** 부분 수정은 어긋남의 시작입니다.

문서 맨 위에 "여기서 직접 고치지 말라"는 안내가 들어갑니다.

### 백엔드를 만들 때 — 명세 준수 검사

명세를 먼저 썼으니 **명세가 곧 테스트 기준**입니다.
백엔드를 띄워두고 아래를 돌리면 응답이 명세와 다른 곳을 잡아줍니다.

```bash
npm run docs:verify                                  # 기본 http://127.0.0.1:9000
npm run docs:verify -- --upstream http://10.0.0.10:9000
npm run docs:verify -- --token "$JWT" --all          # 인증 · 쓰기 메서드까지
```

prism proxy를 백엔드 앞에 세우고 엔드포인트를 하나씩 두드립니다. 잡히는 것은 이런 것들입니다.

```
🚨 GET /movies   (listMovies)
    response.body — Response body must have required property 'summary'
    response.body.items.0.runtime_minutes — must be integer,null
    response.body.items.0.service_status — must be equal to one of: DRAFT, PUBLISHED, HIDDEN
```

기본 포트 **9000**은 아키텍처 문서를 따랐습니다 (`popcorn-backend-acg` inbound 9000,
내부 로드밸런서 `popcorn-lb-pri1`의 타겟 HTTP 9000).

**앞의 `docs:diff`와 보는 것이 다릅니다.** `docs:diff`는 명세 ↔ 명세(두 버전),
`docs:verify`는 명세 ↔ 실제 서버입니다.

값의 의미(팝콘점수가 0~100인지), 페이지네이션이 실제로 맞는지, 권한이 제대로 갈리는지는
이 검사가 못 봅니다. 그건 별도 테스트가 필요합니다.

### 인증 — 제안이지 결정이 아닙니다

`POST /auth/login` · `/auth/refresh` · `/auth/logout` 세 개를 넣어뒀습니다.
액세스 토큰 15분(응답 본문) + 리프레시 토큰 14일(httpOnly·Secure·SameSite=Strict 쿠키,
갱신 시 회전)이라는 흔한 형태입니다. **팀이 SSO를 쓰거나 만료 정책이 다르면 그대로 바꾸세요.**

액세스 토큰은 메모리에만 두는 전제입니다. `localStorage`에 넣으면 XSS 한 번에 털립니다.

### 아직 확정이 아닌 부분

`/members` 계열 7개는 **테이블이 없는 상태에서 화면 요구사항으로 역산한 것**입니다.
[`docs/user-domain-draft.sql`](docs/user-domain-draft.sql)의 열린 질문 6가지가 정해지면
응답 필드가 바뀝니다. `popcorn_score`와 `categories`도 DB에 아직 없습니다.

**CDN을 쓰지 않습니다.** `redocly build-docs`가 만드는 HTML은 번들과 웹폰트를 CDN에서
불러오는데, 그러면 CDN이 죽거나 사내망에서 막히면 문서가 통째로 안 열립니다.
`scripts/build-api-docs.mjs`가 로컬 번들(`redoc`, `swagger-ui-dist`)과 명세를 인라인해
외부 요청을 0으로 만듭니다.

둘 다 라이트 테마 전용이라 `body` 배경을 흰색으로 고정했습니다. 비워두면 브라우저
다크 모드가 비쳐 어두운 배경 위에 어두운 글씨가 됩니다.

## 데이터 출처

영화 데이터는 세 단계로 내려갑니다 (`src/lib/movies-source.ts`).

| 순위 | 출처 | 조건 |
|---|---|---|
| 1 | 실 DB (`dev` 스키마) | `DATABASE_URL`이 있고 연결됨 |
| 2 | 스냅샷 300편 | `src/lib/snapshot/movies.json` |
| 3 | 목 데이터 6편 | 스냅샷도 비었을 때 |

영화 조회는 **`dev.popcorn_movies_service` 뷰**를 씁니다. DB 담당자가 만들어둔 것으로
원장에 두 가지를 미리 붙여줍니다.

- `is_embedded` — bge-m3 PROFILE 임베딩이 `READY`이고 벡터가 실제로 있는지
- `media` — 포스터·스틸을 jsonb 배열로 (영화당 평균 8.3개, 최대 53개)

예전에는 admin이 `popcorn_movie_media`를 직접 조인했는데 뷰가 같은 일을 하므로 걷어냈습니다.

**DB는 NCP VPC 안에 있어 SSH 터널이 필요합니다.** Vercel 함수에서는 터널을 쓸 수 없으므로
배포본은 항상 스냅샷을 봅니다. 서버가 VPC 안으로 들어가면 `DATABASE_URL`만 넣으면
코드 변경 없이 실서비스가 됩니다.

터널이 열려 있는데 조회에 실패하면 화면을 죽이지 않고 스냅샷으로 내려갑니다.
**지금 어느 출처를 보고 있는지는 GNB 왼쪽 배지**에 나옵니다 (`실 DB` / `스냅샷 날짜` / `목 데이터`).

**포스터가 없는 영화가 32%입니다.** `<img src="">`는 브라우저가 현재 페이지를 다시 내려받게
만들므로, `components/movie-poster.tsx`가 URL이 없으면 img를 아예 그리지 않고 자리만 채웁니다.

### 터널 열기

```bash
ssh -i <key.pem> -N -L 15432:pg-49hqo3.vpc-cdb-kr.ntruss.com:5432 root@<bastion>
```

### 실 DB로 개발하기

```bash
DATABASE_URL='postgresql://popcorn_admin:<비번>@localhost:15432/popcorndb' npm run dev
```

### 스냅샷 갱신

```bash
DATABASE_URL='postgresql://popcorn_admin:<비번>@localhost:15432/popcorndb' npm run snapshot
```

편수는 `SNAPSHOT_LIMIT`로 조절합니다(기본 300). 비밀번호는 코드·설정 파일에 넣지 말고
환경변수로만 넘기세요.

## 도메인 모델

**영화 도메인은 실제 DB(`dev` 스키마)의 컬럼명·타입을 그대로 씁니다.** 화면에서 이름을 바꿔
쓰면 API를 붙일 때 매핑 층이 하나 더 생기므로 그러지 않습니다.

### 두 개의 상태 축

`popcorn_movies`는 검수와 노출을 **별개 컬럼**으로 가집니다. 하나로 합쳐 읽으면
"승인됐지만 아직 서비스 전"이나 "검수 전이지만 노출 중" 같은 조합을 표현할 수 없습니다.

| 컬럼 | 값 | 화면 문구 | 뜻 |
|---|---|---|---|
| `approval_status` | `PENDING` · `APPROVED` · `REJECTED` | 인증대기 · 인증완료 · 반려 | 관리자 인증 |
| `service_status` | `DRAFT` · `PUBLISHED` · `HIDDEN` | 준비중 · 노출중 · 숨김 | 사용자 화면 노출 |

**`APPROVED`는 단순한 내부 승인이 아니라 사용자에게 보내는 신호입니다.** 인증된 영화는
사용자 화면에서 **인증 뱃지**를 답니다. "관리자가 확인한 영화"라는 표시라, `인증완료 영화`
화면이 `서비스 영화`의 필터 뷰가 아니라 별도 메뉴로 존재하는 이유이기도 합니다.

**코드와 타입은 DB 컬럼명을 쓰고, 화면 문구는 팀이 쓰는 "인증" 용어로 통일합니다.**
`승인`·`검수` 같은 말을 화면에 섞으면 사이드바의 "인증완료 영화"와 어긋납니다.

두 축은 서로를 덮어쓰지 않습니다. 승인하거나 재검토로 되돌려도 `service_status`는 그대로입니다.
**예외는 반려**로, 서비스에서 내리는 조치이므로 `HIDDEN`으로 함께 바꿉니다.

**반려에는 사유가 필수입니다.** DB에 CHECK 제약이 걸려 있습니다.

```sql
CONSTRAINT ck_popcorn_movies_rejection CHECK (
  approval_status <> 'REJECTED' OR (rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '')
)
```

화면에서도 사유가 비어 있으면 반려 버튼이 눌리지 않습니다.

### 추천은 임베딩 기반

`popcorn_movies`가 바뀌면 트리거가 `movie_embedding_jobs`에 작업을 넣고, 결과가
`popcorn_movie_embeddings`(`bge-m3`, 1024차원)에 쌓입니다. 영화 상세의 "추천 임베딩" 패널이
그 상태(대기·생성 중·완료·실패·재생성 필요)와 시도 횟수, 실패 사유를 보여줍니다.

### 배치는 두 종류

`batch_runs` 한 테이블에서 `job_name`으로 구분합니다.

스케줄러는 APScheduler입니다.

| job_name | 상태 | 하는 일 |
|---|---|---|
| `load-initial-movies` | DB에 있음 | KOFIC·KMDB에서 영화 원장 수집 |

취향 갱신 배치(`refresh-member-preferences`)는 일정상 이번 범위에서 빠졌습니다.
[`docs/removed-features.md`](docs/removed-features.md)를 보세요.

### 실제 데이터 규모 (2026-08-08 기준)

`dev.popcorn_movies` **5,985편**. 목 데이터 6건으로는 안 보이던 것들이 여기서 드러납니다.

| 항목 | 값 |
|---|---|
| KMDB 매칭 | 5,312 (89%) |
| `poster_url` 있음 | 4,046 (68%) — 없으면 `popcorn_movie_media`의 대표 포스터로 폴백 |
| 줄거리 있음 | 5,292 (88%) |
| 감독 있음 | 4,781 (80%) · 배우 있음 3,968 (66%) |
| `source_keywords` 있음 | 1,029 (17%) |
| 개봉일 범위 | 2015-01 ~ 2026-09 |

`popcorn_movie_media`는 **49,486행**(포스터 15,881 · 스틸 33,605)으로 영화당 여러 장입니다.
포스터는 영화당 대표 1장이 유니크하게 보장됩니다.

`popcorn_movie_embeddings`는 **0행**이고 `movie_embedding_jobs`에 **5,985건이 전부 PENDING**입니다.
아직 임베딩 워커가 돌지 않았습니다.

**목록 페이지네이션은 이 규모를 전제로 만들어야 합니다.** 5,985편 ÷ 10 = 599페이지라
페이지 버튼을 전부 그리면 599개가 됩니다. `components/pagination.tsx`가 현재 페이지 주변
±2개와 처음·끝만 그리고 나머지는 `…`로 접습니다.

### 목록 표에 무엇을 넣을지

표가 이미 11~12칸이라 컬럼을 늘리면 가로 스크롤이 생깁니다. **DB에 있다고 넣지 않고,
채움률과 분산을 보고 "검수 판단에 쓰이는가"로 고릅니다.** 넣기로 한 것은 셀 안에 합쳤습니다.

| 정보 | 어디에 | 왜 |
|---|---|---|
| `representative_country` | 감독 옆 (`이창동 · 한국`) | 100% 채워짐. 한국 42% · 미국 19% · 일본 18%로 분산이 크다 |
| `production_status` | 연도 아래 (`개봉예정`만) | 개봉예정 42편은 관객 반응이 없어 인증 기준이 다를 수 있다 |
| `kmdb_matched = false` | 제목 옆 경고 아이콘 | 19편(6%). 포스터·줄거리가 비어 있을 신호다 |
| `rejection_reason` | 상태 아래 (반려일 때만) | 반려 행에만 있어 컬럼으로 두면 대부분 빈칸이 된다 |

넣지 않은 것과 이유입니다.

- `movie_type` — **300편 전부 '장편'.** 분산이 0이라 컬럼을 차지할 값이 없다
- `source_keywords` (13%) · `title_original` (11%) — 채움률이 낮아 표만 성겨진다
- `runtime_minutes` · `production_companies` · `title_en` — 100%지만 목록에서 판단에 안 쓰인다. 상세에 있다

**개봉예정은 warning 색을 쓰지 않습니다.** 정렬이 개봉일 역순이라 42편이 앞 4~5페이지에
몰려 있어서, 주황으로 칠하면 첫 화면이 온통 경고처럼 보입니다. 주의를 끌어야 하는 건
KMDB 미매칭 쪽입니다.

### 아직 DB에 없는 것

기획이 DB보다 앞서 있는 부분입니다. 화면은 기획 기준으로 두고, 테이블이 생기면 붙입니다.

- **`popcorn_score`** (팝콘점수) — `popcorn_movies`에 추가 예정
- **회원·감상평·카테고리·관리자·푸시·온보딩 설문** — 테이블 자체가 없음
  (2026-08-08 재확인: `dev`에 영화 관련 5개 테이블 + 서비스 뷰 1개뿐)

### 초기 적재 상태에서 유의할 점

지금 5,985편이 **전부 `APPROVED` + `PUBLISHED`** 입니다. 초기 적재가 인증을 거치지 않고
바로 인증완료·노출 상태로 들어왔다는 뜻입니다.

이건 인증 큐가 비는 것보다 큰 문제입니다. **인증 뱃지가 전 영화에 붙으면 신뢰 신호로서의
기능을 잃습니다** — 모두가 가진 표시는 아무것도 구분해주지 않습니다.
운영 시작 전에 초기값을 `PENDING`/`DRAFT`로 두고 관리자가 하나씩 올리는 구조여야 합니다.

`viewing_grade`는 KOFIC 원문이라 값이 고르지 않습니다.
`15세이상관람가`(1,808)·`청소년관람불가`(1,761)·`12세이상관람가`(1,416)·`전체관람가`(993)가
대부분이지만 `15세관람가`(3)·`연소자관람불가`(1)·`Y`(1) 같은 이상치가 섞여 있습니다.
`mock.ts`의 `gradeLabel()`이 목록용으로 줄여 쓰고, 상세에는 원문을 그대로 보여줍니다.

### 회원 취향

회원의 취향 정보는 **가입 시 온보딩 설문**으로 만들어집니다.
Q1~Q3 필수, Q4~Q6 선택(건너뛰기 가능). 문항과 선택지는 기획 문서
"온보딩 설문 & 추천 카테고리 설계"를 따릅니다.

감상평을 근거로 취향을 갱신하는 매일 03:00 배치도 설계했지만,
일정상 이번 범위에서 빠졌습니다. [`docs/removed-features.md`](docs/removed-features.md)를 보세요.

## 구조

```
src/app/                라우트. 모두 클라이언트 컴포넌트다 (아래 "상태" 참고)
  page.tsx              대시보드
  review/               서비스 영화 (검토 큐)
  movies/[id]/          영화 상세 · 판정 액션
  approved/             인증완료 영화
  movie-categories/     카테고리 관리 (영화 분류)
  categories/           화면 문구 관리 (사용자 화면 알약 문구)
  members/              회원 목록
  members/[id]/         회원 상세 · 취향 설문 · 감상평
  reviews/              감상평
src/components/         sidebar, modal, confirm-modal, status-badge,
                        movie-cell, date-time-cell
src/lib/
  mock.ts               목 데이터 + 도메인 타입
  admin-store.tsx       영화·로그·카테고리 상태와 판정 액션
  icons.ts              Seed 아이콘 매핑
src/styles/ui.module.css  화면들이 공유하는 스타일 프리미티브
docs/
  openapi.yaml          API 명세 (OpenAPI 3.1, 34개). lint 통과 + prism 목 서버 동작 확인
  api.md                API 요약 — 화면별 엔드포인트와 구현 주의점
  user-domain-draft.sql  회원 테이블 DDL 초안 (미실행)
  popcorn_admin_figma_make_brief.md  Figma Make 단계의 기획 브리프
```

## 상태

원본 Figma Make 프로토타입은 라우터 없이 루트 컴포넌트 하나가 모든 상태를 들고 있었습니다.
URL 라우팅을 도입하면서 영화·로그·화면 문구 상태를 `src/lib/admin-store.tsx`의 클라이언트
Context로 옮겼고, `layout.tsx`가 이를 감싸므로 화면을 이동해도 상태가 유지됩니다.

회원·관리자·푸시·영화 카테고리는 영화 심사와 무관해서 원본처럼 각 화면의 로컬 상태로 둡니다.

**목 데이터는 메모리에만 있습니다.** 새로고침하면 초기값으로 돌아갑니다.
실제 API 연동 시 `mock.ts`를 데이터 소스로 교체하고 `admin-store.tsx`의 액션을 서버 호출로
바꾸면 됩니다.

## 원본

Figma Make 파일 "Admin 화면 만들기"에서 이식했습니다.
Tailwind 유틸리티는 Seed 토큰 기반 CSS Module로, lucide-react 아이콘은 Seed 아이콘으로
전부 치환했습니다. 대응되는 Seed 아이콘이 없어 근사치로 바꾼 항목은 `src/lib/icons.ts`에
주석으로 남겨두었습니다.
