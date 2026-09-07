"use client";

import {
  SelectContent,
  SelectHiddenSelect,
  SelectItem,
  SelectItemIndicator,
  SelectItemLabel,
  SelectPlaceholder,
  SelectPositioner,
  SelectRoot,
  SelectSuffixIcon,
  SelectTrigger,
} from "@seed-design/react";

import { IconApprove, IconChevronDown } from "@/lib/icons";

export type SelectOption = { value: string; label: string };

/**
 * Seed Select는 합성 컴포넌트라 호출부가 길어진다.
 * 필터 바에서 반복해서 쓰므로 옵션 배열만 받는 얇은 래퍼로 감싼다.
 * 빈 문자열 value는 "전체"(필터 해제)를 뜻한다.
 */
export function SelectField({
  id,
  value,
  options,
  placeholder,
  ariaLabel,
  onChange,
  className,
  disabled,
}: {
  id?: string;
  value: string;
  options: SelectOption[];
  placeholder: string;
  ariaLabel: string;
  onChange: (value: string) => void;
  /** 필터 바처럼 폭을 제한해야 하는 곳에서 넘긴다. */
  className?: string;
  /** 값은 보여주되 고를 수는 없게 한다. 수정 창에서 못 바꾸는 칸에 쓴다. */
  disabled?: boolean;
}) {
  const selected = options.find((o) => o.value === value);

  // SelectRoot는 컨텍스트 제공자라 className을 받지 않는다. 폭 제어는 바깥 div로 한다.
  return (
    <div className={className}>
      <SelectRoot
        value={value ? [value] : []}
        onValueChange={(next) => onChange(next[0] ?? "")}
        size="medium"
        disabled={disabled}
      >
        <SelectTrigger id={id} aria-label={ariaLabel}>
          {/* SelectValue는 원시 value를 그대로 찍는다. 값과 라벨이 다른 경우
              (예: ADMIN → 관리자) 라벨을 직접 찾아 보여준다. */}
          {selected ? <span>{selected.label}</span> : <SelectPlaceholder>{placeholder}</SelectPlaceholder>}
          <SelectSuffixIcon svg={<IconChevronDown />} />
        </SelectTrigger>
        <SelectPositioner>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <SelectItemLabel>{option.label}</SelectItemLabel>
                <SelectItemIndicator selected={<IconApprove />} />
              </SelectItem>
            ))}
          </SelectContent>
        </SelectPositioner>
        <SelectHiddenSelect />
      </SelectRoot>
    </div>
  );
}
