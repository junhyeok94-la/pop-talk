# 개발·검증 가이드

이 문서는 팝콘 프로젝트를 다른 PC 또는 다른 개발자가 이어서 작업할 때 필요한 공통 개발 기준을 정리한다. 챗봇 Agent의 설계·품질 계획은 [06-chatbot-development-and-test-plan.md](06-chatbot-development-and-test-plan.md)를, 실제 노드 흐름은 [05-chatbot-flow.md](05-chatbot-flow.md)를 기준으로 한다.

## 1. 저장소와 책임 경계

```text
popcorn-repo/
├── front-end/       # 사용자 웹 UI
├── was/             # 핵심 비즈니스 API
├── back-end/        # 챗봇 Agent API와 AI 연동
├── batch/           # 스케줄·데이터 처리
├── database/        # migration과 seed
├── docs/            # 설계·운영·인수인계 문서
└── scripts/         # 공통 개발·배포 스크립트
```

`back-end`는 챗봇 클라이언트의 질문을 받아 LangGraph를 실행하는 App Server다. 영화 데이터의 원본 관리나 일반 카탈로그 API를 담당하지 않는다. FastAPI 라우터는 요청·응답과 세션 저장만 담당하고, 의도 분류·검색·답변 생성·검수는 `back-end/app/agents/graph.py`에 둔다.

## 2. 브랜치와 변경 원칙

- `main`: 시연 또는 배포 가능한 상태
- `develop`: 기능 통합이 필요한 경우 사용
- `feature/<name>`, `fix/<name>`: 짧게 만들고 PR로 검토
- 이미 적용한 migration은 수정하지 않고 새 migration을 추가한다.
- 비밀 값과 개인 데이터는 커밋하지 않는다. `.env.example`에는 이름과 안전한 기본값만 둔다.

기능을 바꿀 때는 코드, 테스트, 관련 문서를 같은 변경 단위로 갱신한다. Agent의 노드명·재시도 정책·근거 정책을 바꾸면 `docs/05`와 `docs/06`도 함께 확인한다.

## 3. 백엔드 로컬 실행

```powershell
cd back-end
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

헬스 체크는 `GET http://127.0.0.1:8000/health`다. 테스트는 반드시 `back-end`를 작업 디렉터리로 하여 실행한다.

```powershell
cd back-end
python -m pytest -q
```

## 4. 설정과 외부 연동

주요 환경변수는 `back-end/.env.example`을 기준으로 한다.

| 범주 | 설정 | 용도 |
|---|---|---|
| DB | `DATABASE_URL` | 영화·리뷰·대화 저장소 연결 |
| CLOVA | `CLOVA_STUDIO_API_KEY`, `CLOVA_STUDIO_CHAT_MODEL` | Router, 임베딩, 답변 생성 |
| 검수 모델 | `CLOVA_STUDIO_REVIEW_MODEL` | 비어 있으면 생성 모델을 검수에도 사용 |
| 품질 게이트 | `CHAT_REVIEW_PASS_SCORE`, `CHAT_REVIEW_MAX_RETRIES` | 통과 점수와 재시도 한도 |
| 벡터 검색 | `CHAT_REVIEW_VECTOR_MAX_DISTANCE` | 리뷰 근거로 허용할 최대 cosine distance |
| YouTube | `YOUTUBE_API_KEY` | 리뷰 영상 링크 조회 |
| 로컬 검증 | `CHAT_MOCK_MODE` | 외부 LLM 없이 결정적 응답으로 흐름 테스트 |

운영에서는 API 키를 서버 비밀 관리 도구 또는 환경변수로만 주입한다. URL·개인정보·원문 리뷰를 로그나 trace에 그대로 남기지 않는다.

## 5. Agent 변경 규칙

1. `graph.py`의 노드는 `step_순서_역할` 이름을 유지한다.
2. 검색 결과는 `sources`와 답변용 `evidence_units`를 함께 만든다.
3. 모델이 검색 근거 밖의 사실을 쓰지 않도록 프롬프트를 제한하고, 코드 기반 검증을 우회하지 않는다.
4. 검수 불합격 초안을 사용자에게 그대로 반환하지 않는다. 재시도 한도 뒤에는 안전 응답으로 종료한다.
5. 외부 API 실패는 적절한 폴백 또는 사용자에게 이해 가능한 안내로 변환한다.
6. 새 분기가 필요하면 Router 도메인 수를 늘리기보다 `QueryPlan`의 세부 필드와 `step_05_*` 검색 노드로 먼저 확장 가능한지 검토한다.

## 6. 테스트 기준

코드 변경 전후로 다음을 확인한다.

- `pytest -q`: 라우팅, 재시도, 근거 ID·URL 검증, YouTube 클라이언트 단위 테스트
- 외부 API 없이 `CHAT_MOCK_MODE=true`로 그래프가 끝까지 종료되는지 확인
- 실제 CLOVA/DB가 연결된 Dev 환경에서 대표 질문셋을 실행하고 trace를 확인
- 벡터 임계값 변경 시 “관련 리뷰가 남는 비율”과 “무관 리뷰가 섞이는 비율”을 함께 비교
- 프롬프트·모델·튜닝 변경 시 기존 평가셋과 동일한 조건으로 전후 점수를 비교

구체적인 평가 질문셋, 통과 기준, 튜닝 실험 절차는 [06-chatbot-development-and-test-plan.md](06-chatbot-development-and-test-plan.md)에 기록한다.

## 7. 배포 전 확인

1. 변경 코드·테스트·문서를 PR에서 검토한다.
2. 단위 테스트와 API 입력/오류 응답을 확인한다.
3. 필요한 migration을 별도 적용하고 복구 절차를 확인한다.
4. 운영 환경변수와 API 키 권한을 확인한다.
5. `/health`, 외부 API timeout, 로그 마스킹, LB target 상태를 확인한다.
6. 대표 챗봇 질문과 검수 실패 안전 종료를 실제 호출로 확인한다.

## 8. 다른 PC에서 재개하는 순서

1. 저장소를 clone하고 `back-end/.env.example`을 복사해 개인 `.env`를 만든다.
2. Python 의존성을 설치하고 `pytest -q`가 통과하는지 확인한다.
3. [05-chatbot-flow.md](05-chatbot-flow.md)로 실행 흐름을, [06-chatbot-development-and-test-plan.md](06-chatbot-development-and-test-plan.md)로 현재 우선순위를 파악한다.
4. 실제 CLOVA/DB 키가 없는 동안에는 `CHAT_MOCK_MODE=true`로 노드·라우팅·안전 종료를 개발한다.
5. 외부 연동이 필요한 변경은 Dev 환경에서 평가셋을 실행한 뒤 결과를 문서에 기록한다.
