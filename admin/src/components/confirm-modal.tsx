"use client";

import {
  ActionButton,
  DialogBackdrop,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
  Portal,
} from "@seed-design/react";

import styles from "./modal.module.css";

/**
 * 되돌리기 어려운 동작 앞에 세우는 확인 모달.
 * 일반 콘텐츠용 ContentDialog가 아니라 경고·확인용 Dialog를 쓴다.
 */
export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "확인",
  tone = "brand",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: "brand" | "critical";
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <DialogRoot open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Portal>
        <DialogBackdrop />
        <DialogPositioner>
          <DialogContent>
            {/* 좌우 여백과 제목·설명 사이 간격은 header가 준다.
                description을 header 밖에 두면 여백 없이 다이얼로그 가장자리에 붙는다. */}
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            {/* Seed footer는 모바일 기준 세로 스택이라 데스크톱용 가로 배치로 되돌린다. */}
            <DialogFooter className={styles.footer}>
              <ActionButton type="button" variant="neutralWeak" size="medium" onClick={onClose}>
                취소
              </ActionButton>
              <ActionButton
                type="button"
                variant={tone === "critical" ? "criticalSolid" : "brandSolid"}
                size="medium"
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
              >
                {confirmLabel}
              </ActionButton>
            </DialogFooter>
          </DialogContent>
        </DialogPositioner>
      </Portal>
    </DialogRoot>
  );
}
