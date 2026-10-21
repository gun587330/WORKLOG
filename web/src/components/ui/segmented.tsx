"use client";

/**
 * Segmented — 라디오 그룹 기반 세그먼트 컨트롤 (게시 상태·규제 자가신고 상태 공용).
 * 토스식: soft 트랙 위에서 선택 항목만 paper 카드로 떠 보인다 (DESIGN.md §4-1).
 */
import { useId } from "react";
import s from "./segmented.module.css";

type Option<T extends string> = {
  value: T;
  label: string;
  /**
   * 항목 설명 — hover·포커스 시 뜬다 (opt-in, 2026-09-07). 라벨만으로 뜻이 갈리지 않는
   * 세그먼트가 있다(바이어 발굴의 「가입·리드」처럼 우리 내부 개념). 안 주면 없던 대로다.
   */
  hint?: string;
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "md" | "sm";
}) {
  const name = useId();

  return (
    <div
      className={`${s.track} ${size === "sm" ? s.sm : ""}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <label
          key={o.value}
          className={`${s.item} ${o.value === value ? s.on : ""}`}
          title={o.hint}
        >
          <input
            type="radio"
            className={s.radio}
            name={name}
            value={o.value}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
