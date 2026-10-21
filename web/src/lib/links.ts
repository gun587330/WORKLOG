/**
 * 홈 머리 우측 바로가기 링크 — 단일 원본. 주소가 비어 있으면 그 아이콘은 그리지 않는다.
 * 아이콘은 배경이 있는 정사각 타일(public/links/*.svg). ANSERX 는 anserx-code 의 실제 파비콘(web/src/app/icon.svg)을 그대로 복사했다.
 */
export type QuickLink = { key: string; label: string; url: string; icon: string };

export const QUICK_LINKS: QuickLink[] = [
  { key: "github", label: "GitHub", url: "https://github.com/gun587330", icon: "/links/github.svg" },
  { key: "instagram", label: "Instagram", url: "https://www.instagram.com/softscenes.ai/", icon: "/links/instagram.svg" },
  { key: "anserx", label: "ANSERX", url: "https://anserx.co.kr", icon: "/links/anserx.svg" },
];
