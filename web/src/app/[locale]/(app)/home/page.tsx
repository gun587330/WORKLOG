import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { PageHeader } from "@/components/common/page-header";

/** 홈 — 자리표시자. 화면 구현(6단계)에서 교체한다. 명세: 이 폴더 *-SPEC.md */
export default async function Page({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("app.nav");
  return <PageHeader title={t("home")} />;
}
