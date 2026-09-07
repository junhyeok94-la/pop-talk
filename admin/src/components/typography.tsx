import { Text } from "@seed-design/react";

/**
 * 화면 공통 텍스트. Seed의 textStyle 스케일에 맞춰 한 곳에서 정의한다.
 * 이렇게 두면 개별 화면이 font-size를 직접 지정할 일이 없다.
 */

export function PageTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <Text as="h1" textStyle="t6Bold" id={id}>
      {children}
    </Text>
  );
}

export function PageSub({
  children,
  as = "p",
}: {
  children: React.ReactNode;
  as?: "p" | "span";
}) {
  return (
    <Text as={as} textStyle="t4Regular" color="fg.neutralMuted">
      {children}
    </Text>
  );
}

export function CardTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <Text as="h2" textStyle="t4Bold" id={id}>
      {children}
    </Text>
  );
}

/** 대시보드의 "영화 인증 현황"처럼 섹션을 묶는 작은 제목. */
export function GroupTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <Text as="h2" textStyle="t2Bold" color="fg.neutralSubtle" id={id}>
      {children}
    </Text>
  );
}
