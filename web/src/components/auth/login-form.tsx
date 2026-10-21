"use client";

/**
 * 로그인 폼 — ANSERX components/auth/login-form 에서 옮김 · 바뀐 점: side 분기 · 가입 · 재설정 링크 없음.
 * 흐름: signIn() → ?next=(내부 경로만) 또는 /home 으로 replace. 성공 시 버튼을 잠근 채 화면 전환을 기다린다.
 */
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { Lock, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, PasswordField } from "@/components/ui/field";
import { HOME_PATH, safeNextPath, signIn } from "@/lib/api/auth";
import s from "./login-form.module.css";

export function LoginForm() {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = email.trim().length > 0 && password.length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !ready) return;
    setPending(true);
    setError(null);
    try {
      const res = await signIn({ email, password });
      if (res.error) {
        setError(res.error.message || t("failed"));
        setPending(false);
        return;
      }
      router.replace(safeNextPath(params.get("next")) ?? HOME_PATH);
    } catch (err) {
      console.error("[login] 예외", err);
      setError(t("unexpected"));
      setPending(false);
    }
  }

  return (
    <form className={s.form} onSubmit={onSubmit} noValidate>
      <Field id="email" name="email" label={t("email")} type="email" autoComplete="email" placeholder="name@example.com"
        icon={Mail} value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} required />
      <PasswordField id="password" name="password" label={t("password")} autoComplete="current-password"
        placeholder={t("passwordPlaceholder")} icon={Lock} value={password} onChange={(e) => setPassword(e.target.value)}
        disabled={pending} required />
      {error && <p className={s.error} role="alert">{error}</p>}
      <Button type="submit" className={s.submit} loading={pending} disabled={!ready}>{t("submit")}</Button>
    </form>
  );
}
