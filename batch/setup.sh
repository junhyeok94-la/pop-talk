#!/usr/bin/env bash
set -euo pipefail

echo "=== 1. OS 패키지 설치 (Rocky Linux / RHEL 계열) ==="
sudo yum update -y
sudo yum install -y \
    python3.11 \
    python3.11-pip \
    python3.11-devel \
    gcc \
    gcc-c++ \
    make \
    libpq-devel \
    tzdata \
    curl \
    git

echo "=== 2. 가상환경 생성 및 패키지 설치 ==="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
PYTHON_BIN="${PYTHON_BIN:-python3.11}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    echo "ERROR: Python 실행 파일을 찾을 수 없습니다: $PYTHON_BIN" >&2
    exit 1
fi

if ! "$PYTHON_BIN" -c 'import sys; raise SystemExit(sys.version_info < (3, 11))'; then
    echo "ERROR: Python 3.11 이상이 필요합니다." >&2
    exit 1
fi

# Python 버전이 다른 기존 가상환경은 삭제하지 않고 복구 가능한 이름으로 보관한다.
if [ -x ".venv/bin/python" ] && \
   ! .venv/bin/python -c 'import sys; raise SystemExit(sys.version_info < (3, 11))'; then
    BACKUP_DIR=".venv-backup-$(date +%Y%m%d%H%M%S)"
    mv .venv "$BACKUP_DIR"
    echo "기존 가상환경을 $BACKUP_DIR 로 이동했습니다."
fi

if [ ! -x ".venv/bin/python" ]; then
    "$PYTHON_BIN" -m venv .venv
fi

.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt

echo "=== setup 완료 ==="
echo "스케줄러: .venv/bin/python -m scheduler.daily_scheduler"
echo "임베딩 워커: .venv/bin/python -m embedding.worker"
