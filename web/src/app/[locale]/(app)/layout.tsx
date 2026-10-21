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
  // env 미설정(백엔드 미연결)은 UI 개발 모드 — 운영에서는 env 없이는 데이터를 못 읽으므로 열리지 않는다
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <AppShell account={null}>{children}</AppShell>;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect({ href: "/login", locale: await getLocale() });

  const name = (user.user_metadata?.name as string | undefined) || user.email?.split("@")[0] || "";
  return <AppShell account={{ displayName: name, email: user.email ?? "" }}>{children}</AppShell>;
}
