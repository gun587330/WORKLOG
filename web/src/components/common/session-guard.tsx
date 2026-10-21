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
    // env 가 없으면(배포에 환경 변수를 안 넣은 상태) createClient 가 던져 화면 전체가 오류 경계("화면을 불러오지 못했어요")로
    // 떨어진다(2026-10-22 Vercel 첫 배포). 감시를 건너뛰고 로그인 화면의 안내가 사유를 말하게 둔다.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) return;
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
