/**
 * Next.js 미들웨어 — 두 가지 일을 순서대로 (docs/frontend/I18N.md §4):
 *   ① next-intl: 로케일 감지 → rewrite(/en/... → [locale] 세그먼트)·리다이렉트(/ko → /)
 *   ② Supabase: 세션 쿠키 갱신 + 미인증 접근 차단 — ①이 만든 응답 위에 쿠키만 얹는다
 *
 * ⚠️ 순서 고정: ①이 먼저다. ②에서 응답을 새로 만들면 ①의 rewrite 헤더가 유실된다.
 * role(side) 검사는 여기가 아니라 각 구역 layout.tsx 에서 (구조 결정).
 */
import createIntlMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const handleI18n = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  const response = handleI18n(request);

  // 로케일 리다이렉트(/ko → / 등)면 세션 갱신은 목적지 요청에서 하면 된다
  if (response.headers.has("location")) return response;

  return updateSession(request, response);
}

export const config = {
  // 정적 파일·이미지·문서·favicon 은 제외하고 모든 경로에 적용
  // (pdf·ppt·pptx = 브랜드 소개서 정적 서빙 — 빠지면 로케일 rewrite 를 타서 404, 2026-07-27)
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pdf|ppt|pptx)$).*)",
  ],
};
