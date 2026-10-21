import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { ScrapsView } from "@/components/worklog/scraps-view";

/** 스크랩 — 파일 · 링크 보관. 명세: 이 폴더 scraps-SPEC.md */
export default async function Page({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ScrapsView />;
}
