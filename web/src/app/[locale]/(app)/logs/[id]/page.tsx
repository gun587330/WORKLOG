import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { LogDetailView } from "@/components/worklog/log-detail-view";

/** 기록 상세 — 명세: ../logs-SPEC.md §3 */
export default async function LogDetailPage({ params }: { params: Promise<{ locale: Locale; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <LogDetailView id={id} />;
}
