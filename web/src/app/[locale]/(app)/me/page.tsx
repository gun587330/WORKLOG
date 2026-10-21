import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { MeView } from "@/components/worklog/me-view";

/** 개인 — 일기 · 사용 방법. 명세: 이 폴더 me-SPEC.md */
export default async function Page({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MeView />;
}
