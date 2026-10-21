/**
 * 미들웨어용 세션 갱신 헬퍼.
 * 모든 요청에서 "가볍게" 실행 — 세션 쿠키를 리프레시하고, 로그인이 필요한
 * 앱 구역(/brand, /buyer)에 미인증 접근 시 /login 으로 보낸다.
 *
 * ⚠️ 여기서는 role(side) 검사를 하지 않는다 (DB 조회 = 모든 요청에 비용).
 *    side 검사는 각 구역의 서버 layout.tsx 에서 (SECURITY §2.5 / 구조 결정).
 *
 * i18n 합성 (I18N.md §4): next-intl 미들웨어가 만든 응답(rewrite 헤더 포함)을
 * `response` 로 받아 그 위에 세션 쿠키만 얹는다 — 여기서 응답을 새로 만들면
 * rewrite 가 유실되므로 금지. 경로 판정은 로케일 프리픽스(/en 등)를 벗기고 한다.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath as isPublic, splitLocale } from "@/lib/public-paths";
import type { Database } from "@/types/database";

// 로그인 없이 접근 가능한 경로 prefix (로케일 프리픽스 제거 후 기준)
// ⚠️ /legal — 약관·개인정보처리방침은 가입 전에 읽고 동의하는 문서다. 로그인을 요구하면
//    법적으로도(고지 의무) 실무적으로도(PG·스토어 심사가 URL 을 열어본다) 성립하지 않는다.
/* "/p" = 프로필 카드 공개 링크(/p/<slug>) — 콜드메일 수신 바이어(가입 전)가 여는 주소라
   반드시 익명 공개다 (2026-08-09. 빠져 있어서 링크가 로그인으로 튕겼다 — 대표 리포트) */
/* 공개 경로 목록·로케일 분리는 `lib/public-paths` 가 단일 원본이다 (2026-10-01) —
   브라우저 세션 감시(common/session-guard)와 같은 목록을 봐야 한다. 원래 이 파일에 있던
   주석(2026-08-09 `/p` 누락 사고 · 2026-09-28 `/preview`)도 그쪽으로 옮겼다. */

export async function updateSession(request: NextRequest, response?: NextResponse) {
  const supabaseResponse = response ?? NextResponse.next({ request });

  // 환경변수 미설정(백엔드 미연결) 시 인증 시도 없이 통과 — 랜딩/프리뷰 동작 보장.
  // ⚠️ trim 하는 이유: 대시보드에서 값을 붙여넣을 때 줄바꿈·공백이 섞이면 URL 이
  //    형식상 truthy 라 이 가드를 통과하고, 뒤의 fetch 가 던져 **사이트 전체가 500** 이 된다
  //    (2026-08-03 Vercel MIDDLEWARE_INVOCATION_FAILED).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) return supabaseResponse;

  const supabase = createServerClient<Database>(
    supabaseUrl,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 받은 응답을 유지한 채(rewrite 보존) 쿠키만 얹는다
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  /**
   * getUser() 로 세션 갱신 + 검증 (getClaims 아님 — 서명 검증 필요).
   *
   * ⚠️ **반드시 예외를 삼킨다.** 미들웨어는 모든 경로에 걸리므로 여기서 던지면
   *    랜딩·약관까지 포함해 **사이트 전체가 500**(MIDDLEWARE_INVOCATION_FAILED)이 된다.
   *    Supabase 일시 장애·Edge 런타임 네트워크 오류·잘못된 env 값이 전부 이 경로로 온다.
   *
   * 실패 시 **통과시킨다(fail-open)**. 위험해 보이지만 그렇지 않다 — 이 미들웨어는
   * 애초에 UX 장치이고 진짜 방어선은 RLS + 서버 layout 이다(SECURITY §2.5).
   * 인증이 흔들릴 때 로그인으로 리다이렉트하면 로그인 자체도 안 되는 상태라
   * 무한 루프가 되고, 통과시켜도 데이터는 RLS 가 0건으로 막는다.
   */
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (e) {
    console.error("[middleware] 세션 확인 실패 — 통과 처리(RLS 가 실제 방어선)", e);
    return supabaseResponse;
  }

  const { locale, path } = splitLocale(request.nextUrl.pathname);
  if (!user && !isPublic(path)) {
    const url = request.nextUrl.clone();
    // 로케일 보존: /en/brand → /en/login?next=/en/brand
    url.pathname = locale ? `/${locale}/login` : "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
