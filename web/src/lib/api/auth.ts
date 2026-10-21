/**
 * 인증 DAL — 로그인 · 로그아웃만 (ANSERX lib/api/auth.ts 에서 발췌 · 가입 · 초대 · 재설정 없음).
 * 소유자 1명이라 side · role 분기가 없다. 로그인 뒤 목적지는 ?next= 또는 /home.
 */
import { createClient } from "@/lib/supabase/client";
import type { ApiResult } from "./response";

export async function signIn(input: { email: string; password: string }): Promise<ApiResult<{ ok: true }>> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email.trim().toLowerCase(),
    password: input.password,
  });
  if (error) {
    console.error("[auth] 로그인 실패", error);
    // "계정 없음" 과 "비밀번호 틀림" 을 구분하지 않는다 — 이메일 존재 여부가 드러난다
    return { data: null, error: { message: "이메일 또는 비밀번호를 확인해 주세요.", status: 400 } };
  }
  return { data: { ok: true }, error: null };
}

/* 사용자가 누른 로그아웃 표시 — SessionGuard 가 SIGNED_OUT 을 받았을 때 리다이렉트를 건너뛴다 */
const INTENT_KEY = "worklog.signout.intent";
export function consumeIntentionalSignOut(): boolean {
  try {
    const v = sessionStorage.getItem(INTENT_KEY);
    if (v) sessionStorage.removeItem(INTENT_KEY);
    return !!v;
  } catch {
    return false;
  }
}

export async function signOut(): Promise<void> {
  try { sessionStorage.setItem(INTENT_KEY, "1"); } catch { /* 저장소 없음 */ }
  await createClient().auth.signOut();
}

/** 미들웨어가 붙인 ?next= — 내부 경로만 허용 (open redirect 방지) */
export function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export const HOME_PATH = "/home";
