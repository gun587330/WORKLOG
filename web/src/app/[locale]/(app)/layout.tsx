/**
 * 앱 구역 문지기 — ANSERX (admin)/layout 에서 옮김 · 바뀐 점: role 판정 없음("로그인한 사용자 = 소유자").
 * 미인증은 미들웨어가 먼저 /login 으로 보내고, 여기서는 getUser()(서명 검증)로 한 번 더 확인한다.
 * 진짜 방어선은 RLS + assert_owner() RPC 다 (docs/backend/SECURITY.md).
 */
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/common/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // env 미설정(백엔드 미연결)이면 앱 화면을 열지 않고 로그인으로 보낸다. 빈 셸에 "불러오지 못했어요" 만 뜨는 화면을 운영에서
  // 보이지 않기 위함(2026-10-22, Vercel 첫 배포가 환경 변수 없이 홈을 열었다). 로그인 화면이 연결 전 상태를 안내한다.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    return redirect({ href: "/login", locale: await getLocale() });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect({ href: "/login", locale: await getLocale() });

  const name = (user.user_metadata?.name as string | undefined) || user.email?.split("@")[0] || "";
  return <AppShell account={{ displayName: name, email: user.email ?? "" }}>{children}</AppShell>;
}
