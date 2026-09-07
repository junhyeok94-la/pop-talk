# Pop Talk WAS

기존 `pop_talk/apps/api`의 NestJS WAS 계약을 FastAPI로 이전한 서비스입니다. 배치와 챗봇처럼 동일한 PostgreSQL에 직접 연결하며, 연결마다 `DATABASE_SCHEMA, public`을 `search_path`로 고정합니다.

## 제공 API

- `GET /health`
- `GET /movies`, `GET /movies/{movie_id}` (서비스 뷰, 공개)
- `GET /members`, `GET /members/{member_id}` (Bearer 인증 필요)
- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- Swagger UI: `GET /docs`

오류는 `application/problem+json`으로 응답합니다. 리프레시 토큰은 `/auth` 경로의 HttpOnly/SameSite=Strict 쿠키로 전달되고 DB에는 SHA-256 해시만 저장됩니다.

## 로컬 실행

Python 3.11 이상이 필요합니다.

```powershell
cd pop_talk_was
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
.venv\Scripts\python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 3200
```

`DATABASE_SCHEMA`는 개발 `dev`, 운영 `prd`처럼 반드시 명시합니다. 인증 사용 전 기존 `pop_talk/apps/api/docs/006_auth_password.up.sql` 마이그레이션이 적용되어 있어야 합니다. 프론트엔드는 쿠키 전송을 위해 요청에 credentials 옵션을 켜야 합니다.

## 운영 배치 원칙

WAS, 배치, 챗봇은 같은 DB를 쓰되 각각 별도 서버/프로세스로 배치합니다. 서버별 `.env`에 동일한 `DATABASE_URL`과 환경에 맞는 `DATABASE_SCHEMA`를 넣고, DB 보안그룹은 각 애플리케이션 서브넷만 허용합니다. `JWT_SECRET`은 NestJS에서 사용하던 값과 같게 두면 전환 중 액세스 토큰 호환성을 유지할 수 있습니다.
