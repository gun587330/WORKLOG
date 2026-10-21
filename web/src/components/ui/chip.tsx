"use client";

/**
 * Chip / ChipGroup — 칩·배지의 컴포넌트 형태 (스타일 원본: chip.module.css).
 *
 * 배지·칩 전역 통일의 기준 문법이다 (DESIGN.md §5-2, 2026-09-04 대표 확정).
 * 화면마다 칩 CSS 를 새로 쓰지 말 것 — 온보딩·바이어 설정이 이 컴포넌트를 쓰고,
 * 브랜드·운영자 구역은 C0 에서 이쪽으로 갈아탄다.
 *
 * `on` 을 주면 토글(aria-pressed 포함), 안 주면 단순 액션 칩이다.
 *
 * ── 읽기 전용 배지 (2026-09-06 C0) ──
 * `static` 을 주면 **버튼이 아니라 `<span>`** 으로 그린다. 상태 표시에 button 을 쓰면
 * 탭 순서에 끼어들고 스크린리더가 "누를 수 있다"고 읽는다. `tone` 은 의미색(통과·주의·
 * 차단·강조), `size="sm"` 은 카드 오버레이처럼 좁은 자리, `count` 는 숫자 배지다.
 */
import s from "./chip.module.css";

export function ChipGroup({ className, ...rest }: React.ComponentProps<"div">) {
  return <div className={`${s.chips} ${className ?? ""}`} {...rest} />;
}

/** 상태 톤 — 의미는 넷뿐이다. 여기 없는 상태색을 화면에서 새로 만들지 말 것 */
export type ChipTone =
  | "pass"
  | "caution"
  | "block"
  | "accent"
  /** 채움 — 안읽음 카운트처럼 눈에 띄는 것이 목적인 자리 (틴트로 낮추면 알림 구실을 못 한다) */
  | "accentSolid"
  | "blockSolid";

type ChipVariant = {
  /** 토글 상태 (누를 수 있는 칩) */
  on?: boolean;
  /** 상태 톤 — 안 주면 중립 */
  tone?: ChipTone;
  /** 읽기 전용 배지로 그린다 (button 이 아니라 span) */
  static?: boolean;
  /** sm = 카드 오버레이 등 좁은 자리 */
  size?: "md" | "sm";
  /** 숫자 배지 — 최소 폭·자리수 고정 */
  count?: boolean;
  /** 국기·아이콘을 품을 때 (세로 정렬 + 간격) */
  icon?: boolean;
};

const TONE_CLASS: Record<ChipTone, string> = {
  pass: s.tonePass,
  caution: s.toneCaution,
  block: s.toneBlock,
  accent: s.toneAccent,
  accentSolid: s.toneAccentSolid,
  blockSolid: s.toneBlockSolid,
};

function variantClass({ on, tone, size, count, icon, static: isStatic }: ChipVariant) {
  return [
    s.chip,
    isStatic ? s.chipStatic : "",
    on ? s.chipOn : "",
    tone ? TONE_CLASS[tone] : "",
    size === "sm" ? s.chipSm : "",
    count ? s.chipCount : "",
    icon ? s.chipIcon : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function Chip({
  on,
  tone,
  size,
  count,
  icon,
  static: isStatic,
  className,
  ...rest
}: React.ComponentProps<"button"> & ChipVariant) {
  const cls = `${variantClass({ on, tone, size, count, icon, static: isStatic })} ${className ?? ""}`;

  /* 읽기 전용은 span — button 이면 탭 순서에 끼어들고 "누를 수 있다"고 읽힌다 */
  if (isStatic) {
    const { onClick: _onClick, disabled: _disabled, type: _type, ...spanRest } = rest;
    return <span className={cls} {...(spanRest as React.ComponentProps<"span">)} />;
  }

  return <button type="button" aria-pressed={on} className={cls} {...rest} />;
}
