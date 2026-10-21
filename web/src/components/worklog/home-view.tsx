"use client";

/**
 * 홈 (명세: app/[locale]/(app)/home/home-SPEC.md, 가안 v11). 세로 100%.
 * 1행 = KPI 3종(오늘 · 이번 주 · 이번 달 작업량, 면 스파크라인 + 호버) | 이번 주 투입(프로젝트별 순위).
 * 2행 = 달력(애플식 선 격자 · 왼쪽 색 바 · +N · 흰 호버 카드) | 앞으로 할 일(네모 체크) | 진행 중인 계획(목표별 달성률).
 * 데이터는 home_stats(p_date) 한 번(0007). 달력의 다른 달은 그 달 1일로 한 번 더 부른다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { useHomeStats, useProjectNames, useSetLogTodoDone, useSetPlanItemStatus } from "@/hooks/use-worklog";
import type { HomeStats } from "@/lib/api/worklog";
import { formatHours, pad2 } from "@/lib/work-log";
import { addDays, addMonths, daysInMonth, fmtKDate, fmtMD, fmtMonth, fmtPeriod, logCodeToMD, parseISO, sameMonth, todayISO } from "@/lib/format";
import { KpiChart } from "./charts";
import { HomeLinks } from "./home-links";
import { TodoFormModal, type TodoFormValue } from "./todo-form-modal";
import s from "./worklog.module.css";

const DOW = ["월", "화", "수", "목", "금", "토", "일"];

export function HomeView() {
  const t = useTranslations("wl.home");
  const tc = useTranslations("wl.common");
  const router = useRouter();
  const [today, setToday] = useState("");
  useEffect(() => setToday(todayISO()), []);
  const stats = useHomeStats(today);
  const names = useProjectNames();
  const d = stats.data;

  /* KPI 값 */
  const todayHours = useMemo(() => {
    const arr = Array<number>(24).fill(0);
    for (const h of d?.today_hours ?? []) arr[h.hour] += Number(h.value);
    return arr;
  }, [d]);
  const weekHours = (d?.week_days ?? []).map((x) => Number(x.hours));
  const monthHours = (d?.month_days ?? []).map((x) => Number(x.hours));
  const sum = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100;
  const days = (a: number[]) => a.filter(Boolean).length;
  const weekTotal = sum(weekHours);

  return (
    <div className={s.page}>
      <PageHeader title={today ? fmtKDate(today) : ""} actions={<HomeLinks stats={d} today={today} />} />
      {stats.isError && <p className={s.errorNote}>{tc("loadFailed")}</p>}
      <div className={s.home}>
        <div className={s.kpis}>
          <Kpi label={t("kpiToday")} value={formatHours(sum(todayHours))} hint={t("hintToday")}>
            <KpiChart values={todayHours} label={(i) => `${pad2(i)}시`} />
          </Kpi>
          <Kpi label={t("kpiWeek")} value={`${sum(weekHours)}`} unit={t("hoursDays", { days: days(weekHours) })} hint={t("hintWeek")}>
            <KpiChart values={weekHours.length ? weekHours : Array(7).fill(0)} label={(i) => DOW[i]} />
          </Kpi>
          <Kpi label={t("kpiMonth")} value={`${sum(monthHours)}`} unit={t("hoursDays", { days: days(monthHours) })} hint={today ? t("hintMonth", { month: parseISO(today).getMonth() + 1, last: daysInMonth(today) }) : ""}>
            <KpiChart values={monthHours.length ? monthHours : Array(30).fill(0)} label={(i) => `${i + 1}일`} />
          </Kpi>
        </div>

        <section className={`${s.card} ${s.inputCard}`}>
          <p className={s.secLab}>{t("weekInput")} <small>{t("weekInputSub", { hours: formatHours(weekTotal) })}</small></p>
          <div className={s.projList}>
            {stats.isLoading && <Skeleton height="2rem" radius={8} />}
            {d && d.week_projects.length === 0 && <p className={s.hint}>{t("weekEmpty")}</p>}
            {(d?.week_projects ?? []).map((p, i) => (
              <div key={p.slug} className={s.proj}>
                <span><b className={s.rank}>{i + 1}</b><Chip static size="sm" tone="accent">{p.name}</Chip></span>
                <span>{formatHours(Number(p.hours))}</span>
              </div>
            ))}
          </div>
        </section>

        <Calendar today={today} name={names.name} />

        <Todos stats={d} loading={stats.isLoading} name={names.name} />

        <section className={`${s.colCard} ${s.planCard}`}>
          <div className={s.row}>
            <p className={s.secLab}>{t("activePlan")} {d?.active_plan && <small>{d.active_plan.title} · {fmtPeriod(d.active_plan.period_start, d.active_plan.period_end)}</small>}</p>
            {d?.active_plan && <Button variant="secondary" size="sm" onClick={() => router.push(`/plans?plan=${d.active_plan!.id}`)}>{t("open")}</Button>}
          </div>
          <div className={s.scrollArea} style={{ marginTop: ".25rem" }}>
            {stats.isLoading && <Skeleton height="4rem" radius={8} />}
            {d && !d.active_plan && <p className={s.hint}>{t("noPlan")}</p>}
            {(d?.active_plan?.goals ?? []).map((g) => {
              const pct = g.total ? Math.round((g.done / g.total) * 100) : 0;
              return (
                <div key={g.code} className={s.goal}>
                  <div className={s.goalHead}>
                    <span className={s.code}>{g.code}</span>
                    <span>{g.title}</span>
                    <Chip static size="sm" tone="accent">{names.name(g.project_slug)}</Chip>
                    <small>{g.done}/{g.total} · {pct}%</small>
                  </div>
                  <div className={s.bar}><i className={s.barFill} style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
          <div className={s.cfoot}><span><b>{t("rateFoot")}</b> {t("rateFootDesc")}</span></div>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, unit, hint, children }: { label: string; value: string; unit?: string; hint: string; children: React.ReactNode }) {
  return (
    <div className={s.kpi}>
      <div className={s.kpiHead}>
        <span className={s.kpiLabel}>{label}</span>
        <span className={s.kpiVal}>{value}{unit && <small>{unit}</small>}</span>
      </div>
      {children}
      <span className={s.kpiHint}>{hint}</span>
    </div>
  );
}

/* ── 달력 ──
 * 기간 할 일(시작일 ~ 기한)은 애플 캘린더처럼 여러 날을 잇는 줄로 그린다. 주(행)마다 겹치는 기간에 줄 번호(lane)를 나눠 주고,
 * 각 칸은 자기 주의 줄 수만큼 자리를 먼저 깐 뒤(빈 줄은 같은 높이의 빈칸) 계획 · 기록 항목을 그 아래에 둔다.
 * 그래서 같은 기간의 조각들이 가로로 한 줄에 맞물린다. 제목은 시작일과 주의 첫 칸(월요일)에만 쓴다. */
type Ev = { kind: "plan" | "log" | "range"; text: string; id?: string };
type Seg = { id: string; text: string; done: boolean; start: boolean; end: boolean; label: boolean; span: number };
function Calendar({ today, name }: { today: string; name: (slug: string) => string }) {
  const t = useTranslations("wl.home");
  const router = useRouter();
  const [month, setMonth] = useState<string>("");          // 보고 있는 달의 1일. "" = 이번 달
  const viewDate = month && today && !sameMonth(month, today) ? month : today;
  const stats = useHomeStats(viewDate);
  const cal = stats.data?.calendar;
  const gridRef = useRef<HTMLDivElement>(null);
  const [maxEv, setMaxEv] = useState(2);
  const [tip, setTip] = useState<{ date: string; evs: Ev[]; left: number; top: number; up: boolean } | null>(null);

  useEffect(() => {
    const g = gridRef.current;
    if (!g) return;
    const fit = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const dow = g.firstElementChild as HTMLElement | null;
      const cellH = (g.clientHeight - (dow?.offsetHeight ?? 0)) / 6;
      setMaxEv(Math.max(1, Math.floor((cellH / rem - 1.65) / 1.0)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(g);
    return () => ro.disconnect();
  }, []);

  const byDate = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const p of cal?.planned ?? []) (m.get(p.date) ?? m.set(p.date, []).get(p.date)!).push({ kind: "plan", text: `${p.code} ${p.title}` });
    for (const l of cal?.logs ?? []) (m.get(l.date) ?? m.set(l.date, []).get(l.date)!).push({ kind: "log", text: l.projects.map(name).join(" · ") || l.code, id: l.id });
    return m;
  }, [cal, name]);

  const cells = useMemo(() => (cal ? Array.from({ length: 42 }, (_, i) => addDays(cal.start, i)) : []), [cal]);

  /* 주마다 기간 줄 배치: lanes[주][줄] = 그 줄을 쓰는 기간, cellLanes[날짜] = 그 칸의 줄별 조각(없으면 null) */
  const { cellLanes, rangeByDate } = useMemo(() => {
    const cellLanes = new Map<string, (Seg | null)[]>();
    const rangeByDate = new Map<string, Ev[]>();
    if (!cal) return { cellLanes, rangeByDate };
    const ranges = (cal.ranges ?? []).slice().sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
    for (let w = 0; w < 6; w++) {
      const days = cells.slice(w * 7, w * 7 + 7);
      if (!days.length) continue;
      const lanes: string[][] = [];          // 줄마다 차지한 날짜들
      const rows: { r: (typeof ranges)[number]; lane: number }[] = [];
      for (const r of ranges) {
        const span = days.filter((d) => d >= r.start && d <= r.end);
        if (!span.length) continue;
        let lane = lanes.findIndex((used) => span.every((d) => !used.includes(d)));
        if (lane < 0) { lane = lanes.length; lanes.push([]); }
        lanes[lane].push(...span);
        rows.push({ r, lane });
      }
      for (const d of days) {
        const slots: (Seg | null)[] = Array(lanes.length).fill(null);
        for (const { r, lane } of rows) {
          if (d < r.start || d > r.end) continue;
          const text = `${r.plan_item_code ? r.plan_item_code + " " : ""}${r.text}`;
          const span = days.filter((x) => x >= d && x <= r.end).length;   // 이 칸부터 이 주 안에서 이어지는 칸 수(제목이 그만큼 뻗는다)
          slots[lane] = { id: r.id, text, done: r.done, start: d === r.start, end: d === r.end, label: d === r.start || d === days[0], span };
          (rangeByDate.get(d) ?? rangeByDate.set(d, []).get(d)!).push({ kind: "range", text: `${text} (${fmtMD(r.start)} ~ ${fmtMD(r.end)})` });
        }
        cellLanes.set(d, slots);
      }
    }
    return { cellLanes, rangeByDate };
  }, [cal, cells]);
  const showMonth = viewDate || today;

  return (
    <section className={`${s.cal} ${s.calCard}`}>
      <div className={s.calHead}>
        <button type="button" className={s.calNav} aria-label={t("prevMonth")} onClick={() => setMonth(addMonths(showMonth, -1))}><ChevronLeft aria-hidden="true" /></button>
        <b>{showMonth ? fmtMonth(showMonth) : ""}</b>
        <button type="button" className={s.calNav} aria-label={t("nextMonth")} onClick={() => setMonth(addMonths(showMonth, 1))}><ChevronRight aria-hidden="true" /></button>
      </div>
      <div ref={gridRef} className={s.calGrid}>
        {DOW.map((d) => <div key={d} className={s.dow}>{d}</div>)}
        {cells.map((iso) => {
          const own = byDate.get(iso) ?? [];
          const slots = cellLanes.get(iso) ?? [];
          const lanesShown = slots.slice(0, maxEv);
          const room = Math.max(0, maxEv - lanesShown.length);
          const shown = own.length > room ? own.slice(0, Math.max(0, room - 1)) : own;
          const hiddenRanges = slots.slice(maxEv).filter(Boolean).length;
          const more = own.length - shown.length + hiddenRanges;
          const evs = [...(rangeByDate.get(iso) ?? []), ...own];
          const dim = !sameMonth(iso, showMonth);
          return (
            <div
              key={iso}
              className={`${s.day} ${evs.length ? s.dayHas : ""} ${dim ? s.dayDim : ""} ${iso === today ? s.dayToday : ""}`}
              onMouseEnter={(e) => {
                if (!evs.length) return;
                const r = e.currentTarget.getBoundingClientRect();
                const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
                const up = r.bottom + 14 * rem > window.innerHeight;
                setTip({ date: iso, evs, left: Math.min(r.left, window.innerWidth - 16 * rem - 12), top: up ? r.top - 6 : r.bottom + 6, up });
              }}
              onMouseLeave={() => setTip(null)}
            >
              <span className={s.dn}>{parseISO(iso).getDate()}</span>
              {lanesShown.map((seg, i) => seg ? (
                <div key={`r${i}`} className={`${s.rangeSeg} ${seg.label ? s.rangeLabel : ""} ${seg.start ? s.rangeStart : ""} ${seg.end ? s.rangeEnd : ""} ${seg.done ? s.rangeDone : ""}`} title={seg.text} style={{ "--span": seg.span } as React.CSSProperties}>
                  {seg.label ? <span>{seg.text}</span> : null}
                </div>
              ) : <div key={`r${i}`} className={s.rangeGap} aria-hidden="true" />)}
              {shown.map((ev, i) => ev.kind === "log" ? (
                <button key={i} type="button" className={`${s.ev} ${s.evDone} ${s.evLink}`} onClick={() => router.push(`/logs/${ev.id}`)}><i /><span>{ev.text}</span></button>
              ) : (
                <div key={i} className={s.ev}><i /><span>{ev.text}</span></div>
              ))}
              {more > 0 && <div className={s.evMore}>+{more}</div>}
            </div>
          );
        })}
      </div>
      <div className={s.calFoot}>
        <span><i className={s.sw} /> {t("legendPlanned")}</span>
        <span><i className={`${s.sw} ${s.swDone}`} /> {t("legendDone")}</span>
        <span>{t("legendMore")}</span>
        <span>{t("readonly")}</span>
      </div>
      {tip && (
        <div className={s.calTip} style={{ left: tip.left, top: tip.top, transform: tip.up ? "translateY(-100%)" : undefined }}>
          <div className={s.tipDate}>{fmtKDate(tip.date)}</div>
          {tip.evs.some((e) => e.kind === "range") && <>
            <div className={s.tipGroup}>{t("tipRanges", { count: tip.evs.filter((e) => e.kind === "range").length })}</div>
            {tip.evs.filter((e) => e.kind === "range").map((e, i) => <div key={i} className={`${s.ev} ${s.evRange}`}><i /><span>{e.text}</span></div>)}
          </>}
          {tip.evs.some((e) => e.kind === "plan") && <>
            <div className={s.tipGroup}>{t("tipPlanned", { count: tip.evs.filter((e) => e.kind === "plan").length })}</div>
            {tip.evs.filter((e) => e.kind === "plan").map((e, i) => <div key={i} className={s.ev}><i /><span>{e.text}</span></div>)}
          </>}
          {tip.evs.some((e) => e.kind === "log") && <>
            <div className={s.tipGroup}>{t("tipLogs", { count: tip.evs.filter((e) => e.kind === "log").length })}</div>
            {tip.evs.filter((e) => e.kind === "log").map((e, i) => <div key={i} className={`${s.ev} ${s.evDone}`}><i /><span>{e.text}</span></div>)}
          </>}
        </div>
      )}
    </section>
  );
}

/* ── 앞으로 할 일: 계획 항목(미완) + 기록의 할 일(최근 14일) + 직접 추가한 할 일. 체크 = 저장. 행(체크 제외)을 누르면 폼이 열리고 수정 · 삭제는 폼 안에서 ── */
type TodoRow = {
  key: string; kind: "plan" | "log"; id: string; code: string | null; text: string; done: boolean; ask: boolean; source: string; due: string | null;
  projectSlug: string | null; goalCode: string | null; logId: string | null; note: string | null; start: string | null;
};
function Todos({ stats, loading, name }: { stats: HomeStats | undefined; loading: boolean; name: (slug: string) => string }) {
  const t = useTranslations("wl.home");
  const setLog = useSetLogTodoDone();
  const setPlan = useSetPlanItemStatus();
  const [form, setForm] = useState<{ open: boolean; todo: TodoFormValue | null }>({ open: false, todo: null });

  const rows = useMemo<TodoRow[]>(() => {
    if (!stats) return [];
    const active = stats.active_plan?.code;
    const plan: TodoRow[] = stats.plan_items_open.map((p) => ({
      key: `p-${p.id}`, kind: "plan", id: p.id, code: p.code, text: p.text, done: p.done, ask: false,
      source: p.source === active ? t("srcThisPlan") : p.source, due: p.due_date, projectSlug: null, goalCode: null, logId: null, note: null, start: null,
    }));
    const linked = new Set(stats.todos.map((x) => x.plan_item_code).filter(Boolean));
    const log: TodoRow[] = stats.todos.map((x) => ({
      key: `l-${x.id}`, kind: "log", id: x.id, code: x.plan_item_code, text: x.text, done: x.done, ask: x.needs_decision,
      source: x.source ? t("srcLog", { date: logCodeToMD(x.source) }) : t("srcManual"), due: x.due_date,
      projectSlug: x.project_slug, goalCode: x.goal_code, logId: x.log_id, note: x.note, start: x.start_date,
    }));
    const all = [...plan.filter((p) => !linked.has(p.code)), ...log];
    const rank = (r: TodoRow) => (r.done ? 3 : r.ask ? 0 : r.kind === "plan" ? 1 : 2);
    return all.sort((a, b) => rank(a) - rank(b) || (a.due ?? "9").localeCompare(b.due ?? "9"));
  }, [stats, t]);
  const open = rows.filter((r) => !r.done).length;
  const planItems = useMemo(() => (stats?.plan_items_open ?? []).map((p) => ({ code: p.code, text: p.text, done: p.done })), [stats]);

  const toggle = (r: TodoRow) => {
    if (r.kind === "log") setLog.mutate({ id: r.id, done: !r.done });
    else setPlan.mutate({ id: r.id, status: r.done ? "open" : "done" });
  };
  const edit = (r: TodoRow) => setForm({ open: true, todo: {
    id: r.id, text: r.text, needsDecision: r.ask, projectSlug: r.projectSlug, goalCode: r.goalCode, planItemCode: r.code, startDate: r.start, dueDate: r.due, note: r.note, done: r.done,
  } });

  return (
    <section className={`${s.colCard} ${s.todoCard}`}>
      <div className={s.row} style={{ marginBottom: ".25rem" }}>
        <p className={s.secLab}>{t("todos")} <small>{t("todosSub", { count: open })}</small></p>
        <Button size="sm" onClick={() => setForm({ open: true, todo: null })}>{t("addTodo")}</Button>
      </div>
      <ul className={s.todo}>
        {loading && <li><Skeleton height="1.25rem" radius={6} /></li>}
        {!loading && rows.length === 0 && <li><span className={s.hint}>{t("todoEmpty")}</span></li>}
        {rows.map((r) => (
          <li key={r.key} className={r.kind === "log" ? s.todoClickable : undefined} onClick={r.kind === "log" ? () => edit(r) : undefined}>
            <button type="button" className={`${s.todoBox} ${r.done ? s.todoBoxOn : ""}`} aria-label={r.done ? t("markOpen") : t("markDone")} aria-pressed={r.done} onClick={(e) => { e.stopPropagation(); toggle(r); }} disabled={setLog.isPending || setPlan.isPending} />
            <span className={`${s.todoText} ${r.done ? s.todoDone : ""}`}>
              {r.ask && <><span className={s.todoAsk}>{t("needsDecision")}</span> · </>}
              {r.code && <><span className={s.code}>{r.code}</span> </>}
              {r.text}
              {(r.projectSlug || r.due) && (
                <span className={s.todoMeta}>
                  {r.projectSlug && <Chip static size="sm" tone="accent">{name(r.projectSlug)}</Chip>}
                  {r.due && <span className={s.todoDue}>{r.start ? `${fmtMD(r.start)} ~ ${fmtMD(r.due)}` : fmtMD(r.due)}</span>}
                </span>
              )}
            </span>
            <span className={s.todoSrc}>{r.kind === "log" ? r.source : <Link href="/plans" onClick={(e) => e.stopPropagation()}>{r.source}</Link>}</span>
          </li>
        ))}
      </ul>
      <div className={s.cfoot}><span>{t("todoFoot1")}</span><span>{t("todoFoot2")}</span></div>
      <TodoFormModal open={form.open} todo={form.todo} planItems={planItems} onClose={() => setForm({ open: false, todo: null })} />
    </section>
  );
}
