"use client";

/**
 * 세션이 끊기면 로그인으로 — 모든 화면에 한 번 (ANSERX 에서 옮김, 동일).
 * 사용자가 직접 누른 로그아웃은 auth.ts 가 표시를 남겨 두 번 이동하지 않게 한다.
 */
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { consumeIntentionalSignOut } from "@/lib/api/auth";
import { isPublicPath, splitLocale } from "@/lib/public-paths";

export function SessionGuard() {
  useEffect(() => {
    const { data: sub } = createClient().auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      if (consumeIntentionalSignOut()) return;
      const { locale, path } = splitLocale(window.location.pathname);
      if (isPublicPath(path)) return;
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`${locale ? `/${locale}/login` : "/login"}?next=${next}`);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return null;
}
