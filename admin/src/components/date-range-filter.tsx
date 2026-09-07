"use client";

import { TextFieldInput, TextFieldRoot, VisuallyHidden } from "@seed-design/react";
import { useId } from "react";

import { IconCalendar } from "@/lib/icons";
import ui from "@/styles/ui.module.css";
import styles from "./date-range-filter.module.css";

/**
 * 목록 화면들이 공유하는 "언제부터 언제까지" 필터.
 * 값은 yyyy-MM-dd 문자열이고, 비어 있으면 그쪽 경계는 열려 있다는 뜻이다.
 *
 * 라벨은 화면마다 다르다(적재일시·인증일시·작성일·가입일). 스크린리더가 어느
 * 날짜인지 알 수 있어야 해서 label을 받아 VisuallyHidden으로 붙인다.
 */
export function DateRangeFilter({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
}) {
  const id = useId();
  const fromId = `${id}-from`;
  const toId = `${id}-to`;

  return (
    <div className={styles.range}>
      <IconCalendar size={13} />

      <VisuallyHidden asChild>
        <label htmlFor={fromId}>{label} 시작</label>
      </VisuallyHidden>
      <TextFieldRoot
        className={ui.filterDate}
        value={from}
        onValueChange={(v) => onChange({ from: v, to })}
        size="medium"
      >
        <TextFieldInput id={fromId} type="date" />
      </TextFieldRoot>

      <span className={ui.caption} aria-hidden="true">
        ~
      </span>

      <VisuallyHidden asChild>
        <label htmlFor={toId}>{label} 종료</label>
      </VisuallyHidden>
      <TextFieldRoot
        className={ui.filterDate}
        value={to}
        onValueChange={(v) => onChange({ from, to: v })}
        size="medium"
      >
        <TextFieldInput id={toId} type="date" />
      </TextFieldRoot>

      {(from || to) && (
        <button
          type="button"
          className={styles.clear}
          onClick={() => onChange({ from: "", to: "" })}
        >
          기간 해제
        </button>
      )}
    </div>
  );
}

/**
 * yyyy-MM-dd 또는 "yyyy-MM-dd HH:mm:ss" 값이 [from, to] 안에 드는지 본다.
 * 경계는 양쪽 다 포함이다. 값이 없으면 기간 필터를 통과시킨다 — 미인증 영화의
 * 인증일시처럼 비어 있는 것이 정상인 경우가 있어서, 없는 값을 걸러내지 않는다.
 */
export function withinRange(value: string | undefined, from: string, to: string) {
  if (!from && !to) return true;
  if (!value) return false;
  const day = value.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}
