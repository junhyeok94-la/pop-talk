# 통합 검토 기록

## 최종 소스 선택

통합본은 팀 조직 저장소의 `main` 브랜치를 기준으로 구성했습니다.

- `admin`: `ncp-team-hope/pop_talk`의 `apps/admin`만 사용했습니다. 같은 저장소의 `apps/api`, `apps/fe`는 최종 서비스의 별도 Backend·Frontend 저장소와 역할이 겹치므로 포함하지 않았습니다.
- `frontend`: `ncp-team-hope/pop_talk_fe`
- `backend`: `ncp-team-hope/pop_talk_was`
- `chatbot`: `ncp-team-hope/pop_talk_chatbot`
- `batch`: `ncp-team-hope/pop_talk_batch`

## 기존 `popcorn-repo` 검토

기존 개인 저장소의 추적 파일 76개를 팀 저장소의 최종 코드와 비교했습니다.

| 기존 파일군 | 처리 | 판단 근거 |
|---|---|---|
| `back-end` | 최종 `chatbot`으로 대체 | 최종 Agent 구현과 테스트가 조직 저장소에서 발전함 |
| `batch` 코드 | 최종 `batch`로 대체 | 스케줄러와 임베딩 구현의 최종본을 사용함 |
| `database/migrations` | 최종 `backend/migrations`로 대체 | 서비스 스키마가 이후 마이그레이션까지 확장됨 |
| `docs` | 일부를 `historical-planning`에 보존 | 초기 의사결정과 Agent 흐름을 이해하는 자료로 가치가 있음 |
| 초기 수집 JSON·CSV | 제외 | 실행 산출물이며 공개 배포에 불필요함 |
| API 참고 XLSX | 제외 | 원본 출처와 재배포 범위를 별도로 확인해야 함 |
| `.env` | 제외 | 실제 API 키가 포함된 환경파일 |
| `infra_setting/keys/*.pem` | 제외 | 실제 RSA 개인키 |
| Terraform 및 상세 인프라 문서 | 제외 | 초기 보안 경계와 네트워크 접근 규칙이 포함됨 |

기존 저장소는 이 통합 작업이 끝날 때까지 비공개 비교 원본으로 유지합니다. 삭제하거나 공개 전환하지 않습니다.

## 공개 전 확인사항

- 기존 `.env`에 기록된 KOFIC·KMDB 키 폐기 또는 재발급
- 기존 Git 이력에 포함된 RSA 개인키 폐기
- `.env.example`에는 빈 값이나 명백한 예시 값만 유지
- 팀원 개인정보와 내부 배포 주소가 없는지 재검색
- 팀 프로젝트 및 원본 저장소 출처 표시 유지
