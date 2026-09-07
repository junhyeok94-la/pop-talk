"""
daily_scheduler.py
------------------
APScheduler 기반의 일단위 영화 데이터 수집 배치 스케줄러입니다.

특징:
- 매일 지정된 시각(기본값: 매일 03:00 AM)에 daily_sync.py의 증분 수집 및 중복 방지 파이프라인 자동 호출.
- 중복 데이터 발생 없이 신규 영화는 삽입, 기존 상영작은 갱신(UPSERT).
- CLI 옵션으로 즉시 실행(--now), 실행 시각 설정(--hour, --minute) 지원.

사용법:
    # 1. 스케줄러 실행 (매일 03:00 AM 주기적 자동 실행)
    python daily_scheduler.py

    # 2. 지금 즉시 1회 동기화 수행 후 스케줄러 모드 유지
    python daily_scheduler.py --now

    # 3. 매일 04:30 AM으로 시각 변경하여 실행
    python daily_scheduler.py --hour 4 --minute 30
"""

import argparse
import datetime
import logging
import sys
import time

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from . import config
from . import daily_sync

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def scheduled_job() -> None:
    """스케줄러가 매일 정해진 시각에 호출하는 배치 작업 함수"""
    logger.info("[SCHEDULER] 일단위 영화 데이터 수집 배치 작업 시작")
    try:
        stats = daily_sync.run_daily_sync(days_back=7)
        logger.info(f"[SCHEDULER] 작업 성공적으로 완료: {stats}")
    except Exception as e:
        logger.error(f"[SCHEDULER] 일일 수집 중 오류 발생: {e}", exc_info=True)


def start_scheduler(hour: int = 3, minute: int = 0, run_now: bool = False) -> None:
    """
    APScheduler 블로킹 스케줄러를 구동합니다.
    """
    config.validate_keys(require_kofic=True, require_kmdb=True)

    if run_now:
        logger.info("[SCHEDULER] --now 옵션 감지: 일일 동기화를 즉시 1회 실행합니다.")
        scheduled_job()

    scheduler = BlockingScheduler(timezone="Asia/Seoul")
    trigger = CronTrigger(hour=hour, minute=minute, timezone="Asia/Seoul")

    scheduler.add_job(
        scheduled_job,
        trigger=trigger,
        id="daily_movie_sync_job",
        name="일일 영화 데이터 증분 동기화 배치",
        replace_existing=True,
    )

    logger.info("=" * 60)
    logger.info(f"  Popcorn Challenge APScheduler 일일 수집 배치 시작")
    logger.info(f"  - 스케줄 주기: 매일 {hour:02d}:{minute:02d} (KST)")
    logger.info(f"  - 실행 대상: 최근 7일 박스오피스 & 최신 개봉 영화 중복 체크/동기화")
    logger.info(f"  - 종료하려면 Ctrl+C 를 누르세요.")
    logger.info("=" * 60)

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("[SCHEDULER] 스케줄러가 사용자에 의해 중지되었습니다.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Popcorn Challenge APScheduler 일일 배치 서비스")
    parser.add_argument("--hour", type=int, default=3, help="매일 크론 실행 시 (0~23, 기본 3)")
    parser.add_argument("--minute", type=int, default=0, help="매일 크론 실행 분 (0~59, 기본 0)")
    parser.add_argument("--now", action="store_true", help="스케줄러 구동 전 지금 즉시 1회 수집 수행")

    args = parser.parse_args()
    start_scheduler(hour=args.hour, minute=args.minute, run_now=args.now)
