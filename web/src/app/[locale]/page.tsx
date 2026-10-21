import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

/** `/` → `/home`. 미들웨어가 로그인을 요구하므로 비로그인은 /login 으로 먼저 간다 */
export default async function RootPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  redirect({ href: "/home", locale });
}
