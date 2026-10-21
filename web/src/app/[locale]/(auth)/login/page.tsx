import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { LoginForm } from "@/components/auth/login-form";
import s from "./login.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return { title: t("metaTitle") };
}

/**
 * 로그인 — 소유자 1명. ANSERX 에서 옮김 · 바뀐 점: 좌 히어로 · 아이콘 월 없이 흰 지면 가운데 폼 하나.
 * LoginForm 은 `useSearchParams()` 를 읽으므로 Suspense 경계가 필요하다(프리렌더 bailout 방지).
 */
export default async function LoginPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth.login");
  return (
    <main className={s.page}>
      <section className={s.panel}>
        <p className={s.brand}><i aria-hidden="true" />WORK LOG</p>
        <h1 className={s.title}>{t("title")}</h1>
        <p className={s.lead}>{t("lead")}</p>
        {(!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) && (
          <p className={s.notice} role="alert">{t("noBackend")}</p>
        )}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
