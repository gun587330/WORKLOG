"use client";

/**
 * 홈 머리 우측: 바로가기(GitHub · Instagram · ANSERX, 배경 있는 아이콘 타일) + 오늘 할 일 체크 아이콘(명세: home-SPEC.md §2 머리).
 * 체크 아이콘 우상단 빨간 숫자 = 기한이 걸린 미완 할 일 전부(지난 기한 · 오늘 · 앞으로). 기한이 남아 있어도 오늘 챙겨야 할 일이라서다(2026-10-22 지시).
 * 누르면 드롭다운으로 기한순 목록(지난 기한은 빨간 「N일 지남」, 오늘은 「오늘」, 앞으로는 「D-N」).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ListChecks } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { HomeStats } from "@/lib/api/worklog";
import { QUICK_LINKS } from "@/lib/links";
import { fmtMD, parseISO } from "@/lib/format";
import s from "./worklog.module.css";

type Item = { key: string; code: string | null; text: string; source: string; href: string | null; due: string };

export function HomeLinks({ stats, today }: { stats: HomeStats | undefined; today: string }) {
  const t = useTranslations("wl.home");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const items = useMemo<Item[]>(() => {
    if (!stats || !today) return [];
    const plan = stats.plan_items_open
      .filter((p) => !p.done && p.due_date)
      .map((p) => ({ key: `p-${p.id}`, code: p.code, text: p.text, source: p.source, href: "/plans", due: p.due_date as string }));
    const linked = new Set(plan.map((p) => p.code));
    const todo = stats.todos
      .filter((x) => !x.done && x.due_date && !(x.plan_item_code && linked.has(x.plan_item_code)))
      .map((x) => ({ key: `t-${x.id}`, code: x.plan_item_code, text: x.text, source: x.source ?? t("srcManual"), href: x.log_id ? `/logs/${x.log_id}` : null, due: x.due_date as string }));
    return [...plan, ...todo].sort((a, b) => a.due.localeCompare(b.due));
  }, [stats, today, t]);

  return (
    <div className={s.homeLinks}>
      {QUICK_LINKS.filter((l) => l.url).map((l) => (
        <a key={l.key} className={s.linkTile} href={l.url} target="_blank" rel="noopener noreferrer" aria-label={l.label} title={l.label}>
          {/* 정적 SVG 타일 · 크기 고정이라 next/image 를 쓰지 않는다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={l.icon} alt="" width={36} height={36} />
        </a>
      ))}
      <div className={s.todayWrap} ref={ref}>
        <button type="button" className={s.linkBtn} aria-label={t("todayTodos")} title={t("todayTodos")} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}>
          <ListChecks aria-hidden="true" />
          {items.length > 0 && <span className={s.badge}>{items.length > 99 ? "99+" : items.length}</span>}
        </button>
        {open && (
          <div className={s.todayPanel} role="dialog" aria-label={t("todayTodos")}>
            <p className={s.todayHead}>{t("todayTodos")} <small>{t("todayCount", { count: items.length })}</small></p>
            {items.length === 0 ? (
              <p className={s.hint}>{t("todayEmpty")}</p>
            ) : (
              <ul className={s.todayList}>
                {items.map((it) => (
                  <li key={it.key}>
                    <span className={s.todayText}>{it.code && <><span className={s.code}>{it.code}</span> </>}{it.text}</span>
                    <DueTag due={it.due} today={today} />
                    {it.href ? <Link className={s.todaySrc} href={it.href} onClick={() => setOpen(false)}>{it.source}</Link> : <span className={s.todaySrc}>{it.source}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 기한 꼬리표: 지난 기한 = 빨강 「N일 지남」, 오늘 = 「오늘」, 앞으로 = 「D-N · MM-DD」 */
function DueTag({ due, today }: { due: string; today: string }) {
  const t = useTranslations("wl.home");
  const days = Math.round((parseISO(due).getTime() - parseISO(today).getTime()) / 86400000);
  if (days < 0) return <span className={`${s.dueTag} ${s.dueOver}`}>{t("dueOver", { days: -days })}</span>;
  if (days === 0) return <span className={`${s.dueTag} ${s.dueToday}`}>{t("dueToday")}</span>;
  return <span className={s.dueTag}>D-{days} · {fmtMD(due)}</span>;
}

