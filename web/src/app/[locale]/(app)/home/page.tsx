import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { HomeView } from "@/components/worklog/home-view";

/** 홈 — 명세: 이 폴더 home-SPEC.md */
export default async function Page({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HomeView />;
}
