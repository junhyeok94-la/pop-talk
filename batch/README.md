# Pop Talk Batch

> DB 마이그레이션의 단일 기준 위치는 `../pop_talk_was/migrations/`입니다. 배치 서버는
> 마이그레이션을 실행하지 않고 작업 큐를 처리합니다. 스키마 변경은 WAS 저장소의 이력을
> 기준으로 Bastion 등 DB 접근이 허용된 배포 호스트에서 적용합니다.

Naver Cloud 배치 서버에서 실행하는 영화 일일 동기화와 CLOVA 임베딩 처리 코드입니다.

초기 영화 데이터 수집과 적재는 개발용 원본 저장소에서 이미 완료했으므로, 이 저장소에는 포함하지 않습니다. 이 저장소는 운영 배치 서버에서 필요한 코드와 설정 예시만 관리합니다.

## 디렉터리 구조

```text
pop_talk_batch/
├── scheduler/                  # 매일 영화 정보를 수집하고 DB에 동기화
│   ├── daily_scheduler.py      # APScheduler 실행 진입점
│   ├── daily_sync.py           # KOFIC·KMDB 수집 및 DB UPSERT
│   ├── db_writer.py            # PostgreSQL 기록
│   ├── kofic_*.py, kmdb_client.py, normalizer.py
│   └── .env.example            # 배치 서버 환경변수 예시
├── embedding/                  # 임베딩 작업 큐를 소비하는 워커
│   └── worker.py
├── scripts/                    # 외부 API·DB에 접속하지 않는 검증 스크립트
├── .python-version
├── requirements.txt
├── setup.sh
└── .gitignore
```

## 서비스 역할

### 일일 동기화 스케줄러

`scheduler.daily_scheduler`는 APScheduler를 계속 실행하다가 지정한 시각(기본 매일 03:00 KST)에 KOFIC와 KMDB를 조회합니다. 변경된 영화 정보를 PostgreSQL에 UPSERT합니다.

영화가 공개·승인 상태이고 메타데이터가 변경되면 DB trigger가 `movie_embedding_jobs`에 임베딩 작업을 생성합니다.

### 임베딩 워커

`embedding.worker`는 `movie_embedding_jobs` 큐를 상시 확인합니다. 작업을 lease 방식으로 선점한 뒤 CLOVA Embedding v2를 호출하고, 생성된 1024차원 벡터를 저장합니다.

워커가 중단되더라도 lease 만료 뒤 다른 워커가 작업을 다시 처리할 수 있습니다.

## 설치와 환경변수 설정

Python 3.11 이상을 지원합니다. Rocky Linux/RHEL 계열 서버의 저장소 루트에서
설치 스크립트를 실행하면 Python 3.11과 서비스 전용 가상환경을 구성합니다.

```bash
chmod +x setup.sh
./setup.sh
cp scheduler/.env.example scheduler/.env
```

기존 `.venv`가 Python 3.11 미만이면 삭제하지 않고 `.venv-backup-날짜시간`으로
이동한 후 Python 3.11 가상환경을 새로 생성합니다.

`scheduler/.env`에 다음 값을 설정합니다.

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@DB_PRIVATE_DOMAIN:5432/DB_NAME
DATABASE_SCHEMA=prd
KOFIC_API_KEY=...
KMDB_API_KEY=...
CLOVA_EMBEDDING_API_KEY=...
CLOVA_EMBEDDING_REQUEST_INTERVAL_SECONDS=1.1
```

`scheduler/.env`에는 운영 비밀정보가 있으므로 Git에 커밋하면 안 됩니다.

의존성을 설치하고 외부 API나 DB에 연결하지 않는 정적 검증을 실행합니다.

```bash
source .venv/bin/activate
PYTHON_BIN=python bash scripts/verify_embedding_worker.sh
```

운영 DB에는 쓰지 않고 스키마·권한·트리거·큐·미임베딩 건수를 확인합니다.

```bash
.venv/bin/python scripts/preflight_embedding_worker.py
```

출력의 `database_schema`가 `prd`, 모든 `relation/domain/trigger/permission`이
`ok`, 마지막 줄이 `preflight: passed`인지 확인한 후 canary를 실행합니다.

## 실행 명령

아래 명령은 모두 저장소 루트에서 실행합니다.

### 일일 동기화 스케줄러 시작

```bash
# 기본: 매일 03:00 KST 실행
python -m scheduler.daily_scheduler

# 시작 직후 1회 실행한 뒤, 이후에도 매일 스케줄대로 대기
python -m scheduler.daily_scheduler --now

# 매일 04:30 KST로 변경
python -m scheduler.daily_scheduler --hour 4 --minute 30
```

### 임베딩 워커 canary 실행

처음 배포할 때는 한 작업만 처리해 DB·CLOVA 연결을 확인합니다.

```bash
python -m embedding.worker --batch-size 1 --max-cycles 1
```

### 초기 임베딩 backlog 처리

대기 중인 임베딩 작업을 모두 처리한 뒤 종료합니다.

```bash
python -m embedding.worker --once --batch-size 20 --lease-seconds 600
```

워커는 기본적으로 CLOVA 요청 사이에 1.1초 대기하고, HTTP 429 또는 API
`429xx` 응답을 받으면 `Retry-After`, `x-ratelimit-reset-requests`,
`x-ratelimit-reset-tokens` 헤더의 가장 긴 초기화 시간까지 기다린 후 재시도합니다.
호출 간격은 `CLOVA_EMBEDDING_REQUEST_INTERVAL_SECONDS` 또는
`--request-interval`로 조정할 수 있습니다.

### 임베딩 워커를 5분 주기로 실행

운영 서버 경로가 `/opt/popcorn/pop_talk_batch`인 경우 `deploy/systemd`의 unit을
설치해 큐를 5분마다 소진하고 종료하도록 실행할 수 있습니다.

```bash
sudo install -m 0644 deploy/systemd/pop-talk-embedding.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/pop-talk-embedding.timer /etc/systemd/system/
sudo systemctl daemon-reload

# 현재 backlog를 즉시 한 번 처리
sudo systemctl start pop-talk-embedding.service
sudo systemctl status pop-talk-embedding.service --no-pager
sudo journalctl -u pop-talk-embedding.service -n 100 --no-pager

# 단독 실행 완료 후 5분 주기 timer 활성화
sudo systemctl enable --now pop-talk-embedding.timer
systemctl list-timers pop-talk-embedding.timer
```

`Type=oneshot` 서비스가 실행 중일 때 timer가 도래해도 동일 서비스가 중복 실행되지
않습니다. `OnUnitInactiveSec=5min`이므로 한 번의 처리가 끝난 시점부터 5분 뒤 다음
실행을 예약합니다.

### 일일 동기화를 systemd timer로 실행

운영 환경에서는 APScheduler 프로세스를 상주시킬 필요 없이 `daily_sync`를 oneshot
서비스로 실행하고 systemd timer가 매일 03:00 KST에 호출하도록 구성할 수 있습니다.
이 방식은 동기화 예외가 서비스 실패 상태와 종료 코드로 직접 드러납니다.

```bash
sudo install -m 0644 deploy/systemd/pop-talk-scheduler.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/pop-talk-scheduler.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pop-talk-scheduler.timer
sudo systemctl status pop-talk-scheduler.timer --no-pager
systemctl list-timers pop-talk-scheduler.timer
sudo journalctl -u pop-talk-scheduler.service -n 100 --no-pager
```

동기화가 실패하면 5분 간격으로 최대 3회 실행을 시도합니다. `Persistent=true`이므로
03:00에 서버가 꺼져 있었다면 부팅 후 누락된 실행을 한 번 수행합니다.

## DB 사전 조건

`DATABASE_SCHEMA`는 개발 서버에서 `dev`, 운영 서버에서 `prd`로 설정합니다.
배치 프로세스는 모든 PostgreSQL 연결의 `search_path`를
`DATABASE_SCHEMA, public`으로 고정합니다.
설정한 스키마가 없거나 DB 계정에 접근 권한이 없으면 `public`으로 폴백하지 않고
프로세스 시작을 실패시킵니다.

임베딩 워커를 시작하기 전에 대상 스키마를 지정해 마이그레이션을 적용합니다.
기존 DB는 `002`, `003`, `004`를 순서대로 실행합니다. `003`은 기존
`public.embedding_vector_1024` 컬럼을 `dev/prd` 스키마 소유 도메인으로 전환합니다.
타입 변경을 막는 `popcorn_movies_service` 뷰가 있으면 정의·주석·권한·소유자를
보존해 트랜잭션 안에서 제거한 뒤 타입 변경 후 복원합니다.
`004`는 챗봇 대화 세션·메시지만 추가합니다. 평점·리뷰·리뷰 임베딩은 해당
도메인 담당자의 별도 마이그레이션에서 관리합니다.

```bash
export DATABASE_SCHEMA=prd

PGOPTIONS="-c search_path=${DATABASE_SCHEMA},public" \
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f ../pop_talk_was/migrations/002_embedding_worker_lease.up.sql

PGOPTIONS="-c search_path=${DATABASE_SCHEMA},public" \
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f ../pop_talk_was/migrations/003_schema_scoped_embedding_domain.up.sql

PGOPTIONS="-c search_path=${DATABASE_SCHEMA},public" \
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f ../pop_talk_was/migrations/004_chatbot_support.up.sql
```

신규 DB는 동일한 `PGOPTIONS`로 `001`, `002`, `003`, `004` 순서로 실행합니다.
`public.embedding_vector_1024`는 다른 환경이 아직 사용할 수 있으므로 `003`에서
자동 삭제하지 않습니다. dev와 prd 전환이 모두 끝난 뒤 의존성이 없을 때 별도로 정리합니다.

## canary 확인 SQL

canary 실행 뒤 작업이 성공했고 lease가 해제됐는지 확인합니다.

```sql
SELECT id, movie_id, status, attempts, last_error, lease_expires_at, finished_at
FROM movie_embedding_jobs
ORDER BY id DESC
LIMIT 5;

SELECT movie_id, status, embedding_model, embedding IS NOT NULL AS has_vector, embedded_at
FROM popcorn_movie_embeddings
ORDER BY embedded_at DESC NULLS LAST
LIMIT 5;
```
