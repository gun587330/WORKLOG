import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

// i18n — src/i18n/request.ts 를 서버 요청별 설정으로 연결 (docs/frontend/I18N.md)
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /* build:check 용 산출물 분리 — dev 서버가 떠 있는 동안 build 가 .next 를 덮는 사고 방지 (web/CLAUDE.md 절대규칙 1) */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* 루트(스크립트용)와 web 에 lockfile 이 둘이라 Next 가 워크스페이스 루트를 헷갈린다 — web 을 루트로 고정 */
  outputFileTracingRoot: path.join(__dirname),
};

export default withNextIntl(nextConfig);
