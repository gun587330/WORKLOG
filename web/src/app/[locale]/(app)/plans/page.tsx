import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { PlansView } from "@/components/worklog/plans-view";

/** 작업 계획 및 목표 — 명세: 이 폴더 plans-SPEC.md. ?plan=<id> 는 useSearchParams 라 Suspense 로 감싼다 */
export default async function Page({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Suspense><PlansView /></Suspense>;
}
