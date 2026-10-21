/**
 * 서버(서버 컴포넌트·레이아웃·서버 액션·라우트 핸들러)용 Supabase 클라이언트.
 * 쿠키에서 세션을 읽고, 인가 판정은 반드시 getUser()(토큰 서명 검증)로 한다.
 * getSession()(로컬 신뢰)으로 판정하지 않는다 — SECURITY §2.5.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 서버 컴포넌트에서 set 호출 시 무시 가능 (미들웨어가 세션 갱신을 담당).
          }
        },
      },
    },
  );
}
