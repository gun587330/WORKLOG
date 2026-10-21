/**
 * 브라우저(클라이언트 컴포넌트)용 Supabase 클라이언트.
 * 쿠키 기반 세션(@supabase/ssr) — localStorage 토큰 저장 안 함 (SECURITY §2.5).
 */
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
