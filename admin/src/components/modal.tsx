"use client";

import {
  ContentDialogBackdrop,
  ContentDialogBody,
  ContentDialogCloseButton,
  ContentDialogContent,
  ContentDialogFooter,
  ContentDialogHeader,
  ContentDialogPositioner,
  ContentDialogRoot,
  ContentDialogTitle,
  Portal,
} from "@seed-design/react";

import { IconClose } from "@/lib/icons";
import styles from "./modal.module.css";

/**
 * 원본(Figma Make)의 Modal은 직접 만든 div 오버레이라 포커스 트랩도 ESC 닫기도 없었다.
 * Seed의 ContentDialog로 대체해 둘 다 얻는다.
 *
 * 액션 버튼은 body가 아니라 footer에 둔다. body만 스크롤되므로 내용이 길어져도
 * 버튼이 화면 밖으로 밀려나지 않는다. 예전에는 body 안에 있어서 푸시 작성처럼
 * 긴 폼에서 "즉시 발송"이 아예 눌리지 않았다.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = "28rem",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** 액션 버튼. footer에 고정되어 스크롤과 무관하게 항상 보인다. */
  footer?: React.ReactNode;
  width?: string;
}) {
  return (
    <ContentDialogRoot open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Portal>
        <ContentDialogBackdrop />
        <ContentDialogPositioner>
          <ContentDialogContent className={styles.content} maxWidth={width}>
            <ContentDialogHeader className={styles.header}>
              <ContentDialogTitle className={styles.title}>{title}</ContentDialogTitle>
              <ContentDialogCloseButton className={styles.close} aria-label="닫기">
                <IconClose size={16} />
              </ContentDialogCloseButton>
            </ContentDialogHeader>
            <ContentDialogBody>
              <div className={styles.body}>{children}</div>
            </ContentDialogBody>
            {footer && <ContentDialogFooter className={styles.footer}>{footer}</ContentDialogFooter>}
          </ContentDialogContent>
        </ContentDialogPositioner>
      </Portal>
    </ContentDialogRoot>
  );
}
