/**
 * 홈 머리 우측 바로가기 링크 — 단일 원본. 주소가 비어 있으면 그 아이콘은 그리지 않는다.
 * 아이콘은 각 사이트의 파비콘(구글 파비콘 서비스)이다.
 */
export type QuickLink = { key: string; label: string; url: string; domain: string };

export const QUICK_LINKS: QuickLink[] = [
  { key: "github", label: "GitHub", url: "https://github.com/gun587330", domain: "github.com" },
  { key: "instagram", label: "Instagram", url: "", domain: "instagram.com" },   // 개인 계정 주소를 받으면 채운다
  { key: "anserx", label: "ANSERX", url: "https://anserx.co.kr", domain: "anserx.co.kr" },
];

export const faviconOf = (domain: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
