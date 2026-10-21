"use client";

/**
 * 홈 머리 우측: 바로가기(GitHub · Instagram · ANSERX, 파비콘) + 오늘 할 일 체크 아이콘(명세: home-SPEC.md §2 머리).
 * 체크 아이콘 우상단 빨간 숫자 = 오늘 기한인 미완 할 일 수(계획 항목 + 할 일). 누르면 드롭다운으로 그 목록.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ListChecks } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { HomeStats } from "@/lib/api/worklog";
import { QUICK_LINKS, faviconOf } from "@/lib/links";
import s from "./worklog.module.css";

type Item = { key: string; code: string | null; text: string; source: string; href: string | null };

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
      .filter((p) => !p.done && p.due_date === today)
      .map((p) => ({ key: `p-${p.id}`, code: p.code, text: p.text, source: p.source, href: "/plans" }));
    const linked = new Set(plan.map((p) => p.code));
    const todo = stats.todos
      .filter((x) => !x.done && x.due_date === today && !(x.plan_item_code && linked.has(x.plan_item_code)))
      .map((x) => ({ key: `t-${x.id}`, code: x.plan_item_code, text: x.text, source: x.source ?? t("srcManual"), href: x.log_id ? `/logs/${x.log_id}` : null }));
    return [...plan, ...todo];
  }, [stats, today, t]);

  return (
    <div className={s.homeLinks}>
      {QUICK_LINKS.filter((l) => l.url).map((l) => (
        <a key={l.key} className={s.linkBtn} href={l.url} target="_blank" rel="noopener noreferrer" aria-label={l.label} title={l.label}>
          {/* 외부 파비콘 · 크기 고정이라 next/image 를 쓰지 않는다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={faviconOf(l.domain)} alt="" width={18} height={18} />
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
