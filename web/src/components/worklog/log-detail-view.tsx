"use client";

/**
 * 기록 상세 (명세: app/[locale]/(app)/logs/logs-SPEC.md §3). 원문 md 를 파서로 다시 그린다.
 * 좌(목차 · 프로젝트 · 태그 필터) · 중앙(날짜 · 요약 · 타임라인, 기본 접힘) · 우(통계 · 시간대별 작업량 · 목표 진행 · 앞으로 할 일).
 * anserx 작업 공유 상세와 같고 카테고리 → 프로젝트(P-코드) · 목표 칩 · 「목표 진행」 박스가 더해졌다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BackLink } from "@/components/common/back-link";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectNames, useWorkLog } from "@/hooks/use-worklog";
import { formatHours, pad2, parseWorkLog, type WorkItem } from "@/lib/work-log";
import { fmtKDateLong } from "@/lib/format";
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
      { rootMargin: "-30% 0px -60% 0px" },
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

  const { meta, hours, ranges, hoursTotal, todos, doneCount, completions, touched } = parsed;
  const detail = log.data;
  const completionTitle = new Map(detail.completions.map((c) => [c.code, c.title]));

  return (
    <div className={s.detailPage}>
      <PageHeader title={detail.log.code} leading={<BackLink href="/logs" label={t("backLabel")} />} />
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
          {todos.length > 0 && (
            <section className={s.card}>
              <p className={s.secLab} style={{ marginBottom: ".5rem" }}>{t("todos")} <small>{tc("countUnit", { count: todos.length })}</small></p>
              <ul className={s.todo}>
                {todos.map((td, i) => (
                  <li key={i}>
                    <span className={`${s.todoBox} ${s.todoBoxStatic} ${td.done ? s.todoBoxOn : ""}`} aria-hidden="true" />
                    <span className={td.done ? s.todoDone : undefined}>
                      {td.needsDecision && <><span className={s.todoAsk}>{t("needsDecision")}</span> · </>}
                      {td.planItemCode && <><span className={s.code}>{td.planItemCode}</span> </>}
                      {td.text}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
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
