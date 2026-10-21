"use client";

/**
 * 기록 상세 (명세: app/[locale]/(app)/logs/logs-SPEC.md §3). 원문 md 를 파서로 다시 그린다.
 * 좌(목차 · 프로젝트 · 태그 필터) · 중앙(날짜 · 요약 · 타임라인, 기본 접힘) · 우(통계 · 시간대별 작업량 · 목표 진행 · 앞으로 할 일).
 * anserx 작업 공유 상세와 같고 카테고리 → 프로젝트(P-코드) · 목표 칩 · 「목표 진행」 박스가 더해졌다.
 * 머리(꺾쇠 · 코드)는 화면에 고정되고 그 아래만 스크롤된다(2026-10-21 지시). 앞으로 할 일은 홈과 같은 체크 · 수정 · 삭제(0011).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { BackLink } from "@/components/common/back-link";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useDeleteTodo, useHomeStats, useProjectNames, useSetLogTodoDone, useWorkLog } from "@/hooks/use-worklog";
import type { WorkLogDetail } from "@/lib/api/worklog";
import { formatHours, pad2, parseWorkLog, type WorkItem } from "@/lib/work-log";
import { fmtKDateLong, fmtMD, todayISO } from "@/lib/format";
import { TodoFormModal, type TodoFormValue } from "./todo-form-modal";
import { KpiChart } from "./charts";
import { WorkMarkdown } from "./work-markdown";
import s from "./worklog.module.css";

const STATUS_TONE = { 완료: "pass", "진행 중": "caution", 보류: undefined, "": undefined } as const;
const itemId = (it: WorkItem) => `item-${it.seq}`;

export function LogDetailView({ id }: { id: string }) {
  const t = useTranslations("wl.detail");
  const tc = useTranslations("wl.common");
  const log = useWorkLog(id);
  const names = useProjectNames();
  const parsed = useMemo(() => (log.data ? parseWorkLog(log.data.log.raw_md) : null), [log.data]);

  const [proj, setProj] = useState<string | null>(null);
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [allOpen, setAllOpen] = useState(false);
  const tlRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);

  const items = parsed?.items ?? [];
  const visible = useMemo(
    () => items.filter((it) => (!proj || it.projectSlug === proj) && [...tags].every((tg) => it.tags.includes(tg))),
    [items, proj, tags],
  );
  const allTags = useMemo(() => {
    const freq = new Map<string, number>();
    for (const it of items) for (const tg of it.tags) freq.set(tg, (freq.get(tg) ?? 0) + 1);
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [items]);
  const projCount = (sl: string) => items.filter((it) => it.projectSlug === sl).length;

  useEffect(() => {
    const root = tlRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); }),
      { root: scrollRef.current, rootMargin: "-30% 0px -60% 0px" },
    );
    root.querySelectorAll("details").forEach((d) => io.observe(d));
    return () => io.disconnect();
  }, [visible.length]);

  const toggleAll = () => {
    const next = !allOpen;
    tlRef.current?.querySelectorAll<HTMLDetailsElement>(`.${s.item}`).forEach((d) => { d.open = next; });
    setAllOpen(next);
  };
  const openItem = (anchor: string) => {
    const d = document.getElementById(anchor) as HTMLDetailsElement | null;
    if (d) d.open = true;
  };

  if (log.isError) {
    return <div className={s.detailPage}><PageHeader title={id} leading={<BackLink href="/logs" label={t("backLabel")} />} /><p className={s.errorNote}>{tc("loadFailed")}</p></div>;
  }
  if (log.isLoading || !parsed || !log.data) {
    return <div className={s.detailPage}><Skeleton height="20rem" radius={24} /></div>;
  }

  const { meta, hours, ranges, hoursTotal, doneCount, completions, touched } = parsed;
  const detail = log.data;
  const completionTitle = new Map(detail.completions.map((c) => [c.code, c.title]));

  return (
    <div className={s.detailPage}>
      <PageHeader title={detail.log.code} leading={<BackLink href="/logs" label={t("backLabel")} />} />
      <div ref={scrollRef} className={s.detailScroll}>
      <div className={s.detail}>
        <aside className={s.sideCol}>
          <section className={`${s.card} ${s.tocWrap}`}>
            <p className={s.secLab}>{t("toc")}</p>
            <ol className={s.toc}>
              {visible.map((it) => (
                <li key={it.seq}>
                  <a href={`#${itemId(it)}`} className={active === itemId(it) ? s.tocOn : undefined} onClick={() => openItem(itemId(it))}>
                    <span>{it.time}</span><span>{it.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </section>
          <section className={s.card}>
            <p className={s.secLab}>{t("project")}</p>
            <div className={s.sideChips}>
              <Chip on={proj === null} count size="sm" onClick={() => setProj(null)}>{tc("all")}<span>{items.length}</span></Chip>
              {parsed.projectSlugs.map((sl) => (
                <Chip key={sl} on={proj === sl} count size="sm" onClick={() => setProj(proj === sl ? null : sl)}>{names.name(sl)}<span>{projCount(sl)}</span></Chip>
              ))}
            </div>
          </section>
          {allTags.length > 0 && (
            <section className={s.card}>
              <p className={s.secLab}>{t("tags")}</p>
              <div className={s.sideChips}>
                {allTags.map((tg) => (
                  <Chip key={tg} on={tags.has(tg)} size="sm" onClick={() => setTags((prev) => { const n = new Set(prev); if (n.has(tg)) n.delete(tg); else n.add(tg); return n; })}>{tg}</Chip>
                ))}
              </div>
            </section>
          )}
        </aside>

        <div className={s.centerCol}>
          <section className={s.hero}>
            <h2 className={s.date}>{fmtKDateLong(meta.date)}</h2>
            <p className={s.who}><b>{meta.author}</b>{meta.role ? <span>· {meta.role}</span> : null}<span className={s.code}>{detail.log.code}</span></p>
          </section>
          {meta.summary && (
            <section className={s.card}>
              <p className={s.secLab} style={{ marginBottom: ".75rem" }}>{t("summary")}</p>
              <p className={s.summary}>{meta.summary}</p>
            </section>
          )}
          <div className={s.tlHead}>
            <p className={s.secLab}>{t("timeline")}</p>
            <Button variant="secondary" size="sm" onClick={toggleAll}>{allOpen ? t("collapseAll") : t("expandAll")}</Button>
          </div>
          <div ref={tlRef} className={s.tl}>
            {visible.length === 0 && <p className={s.empty}>{t("emptyFiltered")}</p>}
            {visible.map((it) => <TimelineItem key={it.seq} item={it} projectName={names.name(it.projectSlug)} />)}
          </div>
        </div>

        <aside className={s.sideCol}>
          <section className={s.card}>
            <dl className={s.stats}>
              <div className={s.stat}><dt>{t("statTasks")}</dt><dd>{tc("countUnit", { count: items.length })}</dd></div>
              <div className={s.stat}><dt>{t("statDone")}</dt><dd>{tc("countUnit", { count: doneCount })}</dd></div>
              <div className={s.stat}><dt>{t("statInProgress")}</dt><dd>{tc("countUnit", { count: items.length - doneCount })}</dd></div>
              <div className={s.stat}><dt>{t("statHours")}</dt><dd>{formatHours(hoursTotal)}</dd></div>
            </dl>
          </section>
          <section className={s.card}>
            <div className={s.kpiHead}>
              <span className={s.kpiLabel}>{t("hourly")}</span>
              <div className={s.kpiValRow}><b>{formatHours(hoursTotal)}</b><span>{t("actualHours")}</span></div>
            </div>
            <KpiChart className={s.hourlyChart} values={hours.map((h) => h.value)} label={(i) => `${pad2(i)}~${pad2(i + 1)}시`} extra={(i) => hours[i].label || null} />
            <div className={s.axis}>{hours.map((h) => <span key={h.hour}>{h.hour % 6 === 0 ? pad2(h.hour) : ""}</span>)}</div>
            {ranges.length > 0 && (
              <div className={s.ranges}>
                {ranges.map((r, i) => (
                  <div key={i} className={s.range}>
                    <span className={s.r}>{pad2(r.start)}~{pad2(r.end)}시</span>
                    <span className={s.h}>{formatHours(r.hours)}</span>
                    <span className={s.w} title={r.label}>{r.label}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          {(completions.length > 0 || touched.length > 0) && (
            <section className={s.card}>
              <p className={s.secLab} style={{ marginBottom: ".5rem" }}>{t("progress")} <small>{tc("countUnit", { count: completions.length + touched.length })}</small></p>
              <ul className={s.progressList}>
                {completions.map((c) => (
                  <li key={c}><span className={`${s.todoBox} ${s.todoBoxOn} ${s.todoBoxStatic}`} aria-hidden="true" /><span><span className={s.code}>{c}</span> {completionTitle.get(c) ?? ""}</span></li>
                ))}
                {touched.map((c) => (
                  <li key={c}><span className={`${s.todoBox} ${s.todoBoxStatic}`} aria-hidden="true" /><span><span className={s.code}>{c}</span> {t("progressTouched")}</span></li>
                ))}
              </ul>
            </section>
          )}
          <LogTodos todos={detail.todos} name={names.name} />
        </aside>
      </div>
      </div>
    </div>
  );
}

/* ── 앞으로 할 일: 홈과 같은 체크(저장) · 수정 · 삭제. 데이터는 get_work_log 의 todos(0011) ── */
function LogTodos({ todos, name }: { todos: WorkLogDetail["todos"]; name: (slug: string) => string }) {
  const t = useTranslations("wl.detail");
  const th = useTranslations("wl.home");
  const tc = useTranslations("wl.common");
  const toast = useToast();
  const setDone = useSetLogTodoDone();
  const del = useDeleteTodo();
  const home = useHomeStats(todayISO());
  const planItems = useMemo(() => (home.data?.plan_items_open ?? []).map((p) => ({ code: p.code, text: p.text, done: p.done })), [home.data]);
  const [form, setForm] = useState<{ open: boolean; todo: TodoFormValue | null }>({ open: false, todo: null });
  const [delRow, setDelRow] = useState<WorkLogDetail["todos"][number] | null>(null);
  if (todos.length === 0) return null;
  const remove = async () => {
    if (!delRow) return;
    try { await del.mutateAsync(delRow.id); toast({ title: tc("deleted"), variant: "success" }); setDelRow(null); }
    catch { toast({ title: tc("deleteFailed"), variant: "destructive" }); }
  };
  return (
    <section className={s.card}>
      <p className={s.secLab} style={{ marginBottom: ".5rem" }}>{t("todos")} <small>{tc("countUnit", { count: todos.length })}</small></p>
      <ul className={s.todo}>
        {todos.map((td) => (
          <li key={td.id}>
            <button type="button" className={`${s.todoBox} ${td.done ? s.todoBoxOn : ""}`} aria-label={td.done ? th("markOpen") : th("markDone")} aria-pressed={td.done} disabled={setDone.isPending} onClick={() => setDone.mutate({ id: td.id, done: !td.done })} />
            <span className={`${s.todoText} ${td.done ? s.todoDone : ""}`}>
              {td.needs_decision && <><span className={s.todoAsk}>{t("needsDecision")}</span> · </>}
              {td.plan_item_code && <><span className={s.code}>{td.plan_item_code}</span> </>}
              {td.text}
              {(td.project_slug || td.due_date) && (
                <span className={s.todoMeta}>
                  {td.project_slug && <Chip static size="sm" tone="accent">{name(td.project_slug)}</Chip>}
                  {td.due_date && <span className={s.todoDue}>{fmtMD(td.due_date)}</span>}
                </span>
              )}
            </span>
            <span className={s.todoActs}>
              <button type="button" className={s.iconBtn} aria-label={th("edit")} title={th("edit")} onClick={() => setForm({ open: true, todo: { id: td.id, text: td.text, needsDecision: td.needs_decision, projectSlug: td.project_slug, goalCode: td.goal_code, planItemCode: td.plan_item_code, dueDate: td.due_date, note: td.note, done: td.done } })}><Pencil size={12} aria-hidden="true" /></button>
              <button type="button" className={s.iconDel} aria-label={tc("delete")} title={tc("delete")} onClick={() => setDelRow(td)}><Trash2 size={12} aria-hidden="true" /></button>
            </span>
          </li>
        ))}
      </ul>
      <TodoFormModal open={form.open} todo={form.todo} planItems={planItems} onClose={() => setForm({ open: false, todo: null })} />
      <Modal
        open={!!delRow}
        title={th("deleteTodoTitle")}
        onClose={() => setDelRow(null)}
        footer={<>
          <Button variant="secondary" onClick={() => setDelRow(null)}>{tc("cancel")}</Button>
          <Button variant="danger" onClick={remove} loading={del.isPending}>{tc("delete")}</Button>
        </>}
      >
        <p className={s.hint}>{delRow ? th("deleteTodoBody", { text: delRow.text }) : ""}</p>
      </Modal>
    </section>
  );
}

function TimelineItem({ item, projectName }: { item: WorkItem; projectName: string }) {
  const tone = STATUS_TONE[item.status];
  return (
    <details id={itemId(item)} className={`${s.item} ${item.status === "완료" ? "" : s.itemProg}`}>
      <summary>
        <span className={s.itemLeft}>
          <span className={s.time}>{item.time}</span>
          <h3 className={s.itemTitle}>{item.title}</h3>
          <span className={s.itemChips}>
            {item.projectSlug && <Chip static size="sm" tone="accent">{projectName}</Chip>}
            {item.goalCode && <span className={s.code}>{item.goalCode}</span>}
            {item.status && <Chip static size="sm" tone={tone}>{item.status}</Chip>}
          </span>
        </span>
        <span className={s.arrow} aria-hidden="true" />
      </summary>
      <div className={s.inner}>
        {item.tags.length > 0 && (
          <div className={`${s.sideChips} ${s.tags}`}>{item.tags.map((tg) => <Chip key={tg} static size="sm">{tg}</Chip>)}</div>
        )}
        {item.body && <WorkMarkdown md={item.body} />}
      </div>
    </details>
  );
}
