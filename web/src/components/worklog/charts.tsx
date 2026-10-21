"use client";

/**
 * 면 스파크라인 + 호버 말풍선 — 홈 KPI 3종(24시간 · 7일 · 한 달)과 상세의 시간대별 작업량이 같은 그림을 쓴다.
 * 수식은 anserx brand/kpi-tile 과 같다(W 100 · H 32 · PAD 2). 바닥은 0 고정(최솟값이 아니라) — 투입이 없는
 * 시간은 바닥에 붙어야 "없음" 으로 읽힌다(가안 v11).
 */
import { useTranslations } from "next-intl";
import { formatHours } from "@/lib/work-log";
import s from "./worklog.module.css";

export function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const W = 100, H = 32, PAD = 2;
  const max = Math.max(...points, 0.001);
  const xy = points.map((v, i) => [(i / (points.length - 1)) * W, PAD + (1 - v / max) * (H - PAD * 2)]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [ex, ey] = xy[xy.length - 1];
  return (
    <svg className={s.spark} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path className={s.sparkFill} d={`${line} L${W} ${H} L0 ${H} Z`} />
      <path className={s.sparkLine} d={line} />
      <path className={s.sparkDot} d={`M${ex.toFixed(1)} ${ey.toFixed(1)} l0.01 0`} />
    </svg>
  );
}

/** 스파크라인 + 칸별 호버(세로선 · 말풍선: 라벨 · 투입 · 보조 글) */
export function KpiChart({ values, label, extra, className }: {
  values: number[];
  label: (i: number) => string;
  extra?: (i: number) => string | null;
  className?: string;
}) {
  const t = useTranslations("wl.home");
  return (
    <div className={className ?? s.chart}>
      <Sparkline points={[0, ...values, 0]} />
      <div className={s.hover} style={{ "--n": values.length } as React.CSSProperties}>
        {values.map((v, i) => {
          const x = extra?.(i);
          return (
            <div key={i} className={s.hour}>
              <span className={s.tip}>
                {label(i)} · {v ? formatHours(v) : t("noWork")}
                {x ? <><br />{x}</> : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
