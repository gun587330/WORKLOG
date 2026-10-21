/**
 * i18n 라우팅 — 로케일 목록의 단일 원본 (docs/frontend/I18N.md).
 * ANSERX 에서 옮김 · 바뀐 점: 노출 로케일은 ko 하나. localePrefix "as-needed" 라 URL 에 프리픽스가 없다.
 * 로케일을 늘릴 때는 이 배열에 추가하고 messages/<locale>.json 을 만든다.
 */
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ko"],
  defaultLocale: "ko",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
