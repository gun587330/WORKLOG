import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { ProjectsView } from "@/components/worklog/projects-view";

/** 프로젝트 — 소개 · 목표 · 진행상황. 명세: 이 폴더 projects-SPEC.md. ?project=<slug> 는 useSearchParams 라 Suspense 로 감싼다 */
export default async function Page({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Suspense><ProjectsView /></Suspense>;
}
