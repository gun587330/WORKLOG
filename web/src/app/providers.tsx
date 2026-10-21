"use client";

/**
 * 전역 클라이언트 프로바이더 — TanStack Query + Toast + 세션 감시 (ANSERX 에서 옮김, 동일).
 */
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import { SessionGuard } from "@/components/common/session-guard";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60 * 1000, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SessionGuard />
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
