/**
 * 로그인 없이 열리는 경로 — 미들웨어와 브라우저 세션 감시가 같은 목록을 본다.
 * ANSERX 에서 옮김 · 바뀐 점: 공개 경로는 /login 뿐이다(가입 · 초대 · 재설정 · 공개 프로필 없음).
 * `/` 는 (app)/page 가 /home 으로 보내므로 보호 경로다.
 * 이 모듈은 `next/server` 를 import 하지 않는다 — 클라이언트 번들에 들어간다.
 */
import { routing } from "@/i18n/routing";

export const PUBLIC_PREFIXES = ["/login"];

export function splitLocale(pathname: string): { locale: string | null; path: string } {
  const seg = pathname.split("/")[1];
  if ((routing.locales as readonly string[]).includes(seg)) {
    return { locale: seg, path: pathname.slice(seg.length + 1) || "/" };
  }
  return { locale: null, path: pathname };
}

export function isPublicPath(path: string): boolean {
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}
