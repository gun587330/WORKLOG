/**
 * 서버 요청별 i18n 설정 — next.config 의 createNextIntlPlugin 이 이 파일을 찾는다.
 * ANSERX 에서 옮김 · 바뀐 점: 로케일이 ko 하나라 deep merge 폴백이 지금은 쓰이지 않지만,
 * 로케일을 늘릴 때 그대로 살아나도록 구조를 유지한다(I18N.md).
 */
import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

type Messages = Record<string, unknown>;

function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof out[k] === "object") {
      out[k] = deepMerge(out[k] as Messages, v as Messages);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const ko = (await import("../../messages/ko.json")).default as Messages;
  const messages =
    locale === "ko" ? ko : deepMerge(ko, (await import(`../../messages/${locale}.json`)).default as Messages);
  return { locale, messages };
});
