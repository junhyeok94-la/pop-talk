# 챗봇 백엔드

FastAPI와 LangGraph를 사용하여 챗봇 서비스 에이전트를 구현한 챗봇 백엔드입니다.

## 구성

```text
pop-talk-chatbot/
├── app/
│   ├── agents/        # LangGraph 영화 Agent
│   ├── api/           # FastAPI API 라우터
│   ├── clients/       # CLOVA Studio API 클라이언트
│   ├── repositories/  # PostgreSQL 조회 계층
│   └── schemas/       # 요청·응답 및 Agent 모델
├── tests/
├── .env.example
├── .python-version
├── setup.sh
└── requirements.txt
```

## 운영 서버 설치

Python 3.11 이상을 지원합니다. Rocky Linux/RHEL 계열 서버에서 저장소 루트의
설치 스크립트를 실행하면 Python 3.11과 서비스 전용 가상환경을 구성합니다.

```bash
chmod +x setup.sh
./setup.sh
```

기존 `.venv`가 Python 3.11 미만이면 삭제하지 않고 `.venv-backup-날짜시간`으로
이동한 후 Python 3.11 가상환경을 새로 생성합니다.

생성된 `.env`에 운영 DB와 API 키를 설정한 후 서버를 실행합니다.
`DATABASE_SCHEMA`는 개발 서버에서 `dev`, 운영 서버에서 `prd`로 설정합니다.
챗봇은 모든 PostgreSQL 연결의 `search_path`를 `DATABASE_SCHEMA, public`으로 고정합니다.
설정한 스키마가 없거나 DB 계정에 접근 권한이 없으면 `public`으로 폴백하지 않고
연결을 실패시킵니다.
DB에는 배치 저장소의 `migrations/004_chatbot_support.up.sql`까지 적용해야 합니다.
챗봇은 익명 `session_id`로 대화 문맥을 관리하며, 사용자 식별자를 요청 본문으로 받지 않습니다.
평점·리뷰·리뷰 임베딩 테이블은 별도 도메인 마이그레이션이 적용되기 전까지
빈 데이터로 처리되므로 영화 정보와 추천 흐름을 먼저 테스트할 수 있습니다.

```bash
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 로컬 실행

```powershell
cd pop-talk-chatbot
python --version  # Python 3.11 이상
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

헬스 체크는 `GET http://127.0.0.1:8000/health`에서 확인합니다.

## 영화·평점 데이터 범위

- 영화 정보와 추천은 `CATALOG_RELEASE_YEAR_FROM`~`CATALOG_RELEASE_YEAR_TO`
  (기본값 2020~2026년) 개봉작만 대상으로 합니다.
- 출처를 지정하지 않은 평점·리뷰 질문은 Pop Talk 내부 사용자 데이터를 조회합니다.
- IMDb, 로튼토마토, 왓챠피디아, 네이버, 해외 평론가처럼 외부 출처를 명시하면
  내부 데이터로 대체하지 않고 현재 지원하지 않는 출처임을 안내합니다.
- `이번 주 개봉작`은 현재 날짜가 속한 월요일~일요일의 내부 카탈로그를 조회합니다.

## 테스트

```powershell
cd pop-talk-chatbot
pytest
```

## 운영 서비스와 로그

Chatbot 서버의 저장소 경로가 `/opt/popcorn/pop_talk_chatbot`인 경우 아래 파일을
설치합니다. systemd는 Uvicorn의 표준 출력과 오류를 journal에 남기고, rsyslog가
`/var/log/pop-talk/chatbot.log`로 내보냅니다. 이 파일 경로를 Batch와 동일한 Naver
Cloud 로그 수집·Analytics·Object Storage 보관 정책에 등록합니다.

```bash
sudo install -m 0644 deploy/systemd/pop-talk-chatbot.service /etc/systemd/system/
sudo install -m 0644 deploy/rsyslog/30-pop-talk-chatbot.conf /etc/rsyslog.d/
sudo install -m 0644 deploy/logrotate/pop-talk-chatbot /etc/logrotate.d/
sudo systemctl daemon-reload
sudo systemctl restart rsyslog
sudo systemctl enable --now pop-talk-chatbot.service

sudo systemctl status pop-talk-chatbot.service --no-pager
sudo journalctl -u pop-talk-chatbot.service -n 100 --no-pager
tail -f /var/log/pop-talk/chatbot.log
```

로그에는 세션 ID, intent, 검색 리뷰·출처 수와 오류만 남깁니다. 질문 원문, 리뷰
본문, CLOVA API 키·프롬프트, DB 연결 문자열은 기록하지 않습니다.
