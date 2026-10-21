import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { PageHeader } from "@/components/common/page-header";
import { BackLink } from "@/components/common/back-link";

/** 기록 상세 — 자리표시자. 화면 구현(6단계)에서 교체한다 */
export default async function LogDetailPage({ params }: { params: Promise<{ locale: Locale; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <PageHeader title={id} leading={<BackLink href="/logs" label="작업 기록으로" />} />;
}
