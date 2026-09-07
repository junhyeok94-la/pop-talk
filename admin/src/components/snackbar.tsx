"use client";

import {
  SnackbarMessage,
  SnackbarRegion,
  SnackbarRenderer,
  SnackbarRoot,
  SnackbarRootProvider,
  useSnackbarAdapter,
} from "@seed-design/react";

/**
 * 인증·인증취소·삭제처럼 화면이 조용히 바뀌는 동작에 결과를 알려준다.
 * layout에서 한 번 감싸고, 화면에서는 useToast()로 띄운다.
 */
export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  return (
    <SnackbarRootProvider>
      {children}
      <SnackbarRegion>
        <SnackbarRenderer />
      </SnackbarRegion>
    </SnackbarRootProvider>
  );
}

export function useToast() {
  const adapter = useSnackbarAdapter();

  return (message: string, variant: "default" | "positive" | "critical" = "default") =>
    adapter.create({
      render: () => (
        <SnackbarRoot variant={variant}>
          <SnackbarMessage>{message}</SnackbarMessage>
        </SnackbarRoot>
      ),
    });
}
