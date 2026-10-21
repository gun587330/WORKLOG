import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { LogsView } from "@/components/worklog/logs-view";

/** 작업 기록 — 명세: 이 폴더 logs-SPEC.md */
export default async function Page({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LogsView />;
}
