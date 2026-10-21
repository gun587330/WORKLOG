/**
 * Skeleton — 로딩 자리표시자 (atom).
 * mock DAL 의 인위적 지연(150ms)과 짝 — 데이터 훅이 pending 인 동안 형태를 잡아준다.
 */
import s from "./skeleton.module.css";

export function Skeleton({
  width,
  height = 16,
  radius = 8,
  className,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  className?: string;
}) {
  // 숫자는 px가 아니라 rem으로 해석 — 전 화면 rem 체계(루트 clamp 스케일)와 함께 늘어난다
  const r = (v: number | string | undefined) =>
    typeof v === "number" ? `${v / 16}rem` : v;
  return (
    <span
      className={`${s.skeleton} ${className ?? ""}`}
      style={{ width: r(width), height: r(height), borderRadius: r(radius) }}
      aria-hidden="true"
    />
  );
}
