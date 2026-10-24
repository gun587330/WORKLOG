"use client";

/**
 * 프로젝트 (명세: app/[locale]/(app)/projects/projects-SPEC.md). 세로 100%, 좌 카드 목록(고정 폭) · 우 선택한 프로젝트 상세.
 * 좌 = 프로젝트 카드(이름 · 코드 · 한 줄 설명 · 할 일 진행 바 · 목표 · 기록 · 투입 · 마지막 기록) + 필터 칩 + [프로젝트 추가].
 * 우 = 통계 4칸 · 소개 · 목표 글(마크다운) · 최근 8주 투입 · 목표 목록 · 미완 항목 · 최근 기록. 머리 우측 [수정] = 폼 모달(save_project).
 * 삭제는 없다. 과거 기록이 가리키는 프로젝트가 사라지면 안 되므로 보관(archived)만 한다(0003 · 0022).
 * ?project=<slug> 로 오면 그 프로젝트를 고른 채 열고 주소에서 지운다.
 * 「최근 8주 투입」 · 최근 28일 투입은 오늘 기준이다. 오늘 날짜를 1분마다 확인해 쿼리 키에 넣으므로 날짜가 바뀌면(자정) 다시 읽는다(홈 useHomeStats(date) 와 같은 방식).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { GripVertical } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useProject, useProjectOverview, useSaveProject, useSetProjectStatus, useUpsertProject } from "@/hooks/use-worklog";
import type { ProjectDetail, ProjectOverview } from "@/lib/api/worklog";
import { formatHours } from "@/lib/work-log";
import { fmtKDate, fmtMD, fmtPeriod, todayISO } from "@/lib/format";
import { WorkMarkdown } from "./work-markdown";
import s from "./worklog.module.css";

type Filter = "active" | "archived" | "all";
type SortMode = "hours" | "manual";
const SORT_KEY = "worklog.projects.sort";
const SLUG_RE = /^[A-Z0-9][A-Z0-9-]{0,30}$/;
const pctOf = (done: number, total: number) => (total ? Math.round((done / total) * 100) : null);

/** 오늘(YYYY-MM-DD). 마운트 뒤 채우고(SSR 불일치 방지) 1분마다 다시 확인해 자정을 넘기면 값이 바뀐다 */
function useToday() {
  const [today, setToday] = useState("");
  useEffect(() => {
    const tick = () => setToday(todayISO());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

export function ProjectsView() {
  const t = useTranslations("wl.projects");
  const tc = useTranslations("wl.common");
  const router = useRouter();
  const params = useSearchParams();
  const today = useToday();
  const overview = useProjectOverview(today);
  const [filter, setFilter] = useState<Filter>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; project: ProjectOverview | null }>({ open: false, project: null });
  // 정렬: 투입순(총 투입 많은 순, 기본) · 내 순서(sort 컬럼, 끌어서 바꿈). 선택은 브라우저에 기억
  const [sortMode, setSortMode] = useState<SortMode>("hours");
  useEffect(() => { try { if (localStorage.getItem(SORT_KEY) === "manual") setSortMode("manual"); } catch { /* 저장소 없음 */ } }, []);
  const changeSort = (m: SortMode) => { setSortMode(m); setManualOrder(null); try { localStorage.setItem(SORT_KEY, m); } catch { /* 저장소 없음 */ } };
  // 끌어 놓는 동안의 순서(전체 프로젝트 id). 놓으면 sort 를 저장하고, 서버가 같은 순서를 돌려주므로 그대로 둔다
  const [manualOrder, setManualOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const upsert = useUpsertProject();
  const toast = useToast();

  const rows = overview.data ?? [];
  const activeCount = rows.filter((p) => p.status === "active").length;
  const sorted = useMemo(() => {
    const list = rows.slice();
    if (sortMode === "hours") return list.sort((a, b) => Number(b.hours_total) - Number(a.hours_total) || a.sort - b.sort || a.name.localeCompare(b.name));
    list.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    if (!manualOrder) return list;
    const idx = new Map(manualOrder.map((id, i) => [id, i]));
    return list.sort((a, b) => (idx.get(a.id) ?? 1e9) - (idx.get(b.id) ?? 1e9));
  }, [rows, sortMode, manualOrder]);
  const shown = useMemo(() => sorted.filter((p) => filter === "all" || p.status === filter), [sorted, filter]);

  /* 끌어서 순서 바꾸기(내 순서일 때만). 카드 위로 끌고 가면 그 자리로 미리 옮겨 보여 주고, 놓으면 바뀐 sort 만 저장한다 */
  const onDragStart = (id: string) => { setDragId(id); setManualOrder(sorted.map((p) => p.id)); };
  const onDragEnter = (overId: string) => {
    if (!dragId || dragId === overId) return;
    setManualOrder((prev) => {
      const cur = prev ?? sorted.map((p) => p.id);
      const from = cur.indexOf(dragId), to = cur.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = cur.slice(); next.splice(from, 1); next.splice(to, 0, dragId);
      return next;
    });
  };
  const onDragEnd = async () => {
    const id = dragId;
    setDragId(null);
    if (!id || !manualOrder) return;
    const byId = new Map(rows.map((p) => [p.id, p]));
    const changed = manualOrder.map((pid, i) => ({ p: byId.get(pid), sort: (i + 1) * 10 })).filter((x): x is { p: ProjectOverview; sort: number } => !!x.p && x.p.sort !== x.sort);
    if (changed.length === 0) return;
    try {
      await Promise.all(changed.map(({ p, sort }) => upsert.mutateAsync({ id: p.id, slug: p.slug, name: p.name, abbr: p.abbr, description: p.description ?? "", sort })));
      toast({ title: t("orderSaved"), variant: "success" });
    } catch (e) {
      setManualOrder(null);
      toast({ title: tc("saveFailed"), description: (e as Error).message, variant: "destructive" });
    }
  };

  // 처음 열면 ?project=<slug> 또는 첫 진행 중 프로젝트를 고른다
  useEffect(() => {
    if (selectedId || rows.length === 0) return;
    const q = params.get("project");
    const hit = q ? rows.find((p) => p.slug === q.toUpperCase()) : null;
    if (q) router.replace("/projects");
    const first = hit ?? rows.find((p) => p.status === "active") ?? rows[0];
    if (first) {
      setSelectedId(first.id);
      if (hit && hit.status !== "active") setFilter("all");
    }
  }, [rows, selectedId, params, router]);

  const selected = rows.find((p) => p.id === selectedId) ?? null;

  return (
    <div className={s.page}>
      <PageHeader title={t("title")} />
      <div className={s.pjSplit}>
        {/* 좌: 프로젝트 카드 목록 */}
        <section className={s.colCard}>
          <div className={s.row}>
            <p className={s.secLab}>{t("list")} <small>{t("listSub", { count: rows.length, active: activeCount })}</small></p>
            <Button size="sm" onClick={() => setForm({ open: true, project: null })}>{t("add")}</Button>
          </div>
          <div className={`${s.row} ${s.pjTools}`}>
            <div className={s.chips}>
              <Chip on={filter === "active"} size="sm" onClick={() => setFilter("active")}>{t("filterActive")}</Chip>
              <Chip on={filter === "archived"} size="sm" onClick={() => setFilter("archived")}>{t("filterArchived")}</Chip>
              <Chip on={filter === "all"} size="sm" onClick={() => setFilter("all")}>{t("filterAll")}</Chip>
            </div>
            <Segmented ariaLabel={t("sortAria")} size="sm" value={sortMode} onChange={changeSort} options={[{ value: "hours", label: t("sortHours") }, { value: "manual", label: t("sortManual") }]} />
          </div>
          <div className={s.pjCards}>
            {overview.isLoading && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height="5rem" radius={16} />)}
            {overview.isError && <p className={s.errorNote}>{tc("loadFailed")}</p>}
            {!overview.isLoading && !overview.isError && shown.length === 0 && <p className={s.empty}>{t("empty")}</p>}
            {shown.map((p) => (
              <ProjectCard
                key={p.id} p={p} on={p.id === selectedId} onPick={() => setSelectedId(p.id)}
                draggable={sortMode === "manual"} dragging={dragId === p.id}
                onDragStart={() => onDragStart(p.id)} onDragEnter={() => onDragEnter(p.id)} onDragEnd={onDragEnd}
              />
            ))}
          </div>
          <div className={s.cfoot}><span>{sortMode === "manual" ? t("footReorder") : t("foot")}</span></div>
        </section>

        {/* 우: 선택한 프로젝트 상세 */}
        <section className={s.colCard}>
          {selected ? (
            <ProjectDetailPanel p={selected} today={today} onEdit={() => setForm({ open: true, project: selected })} />
          ) : (
            <>
              <div className={s.row}><p className={s.secLab}>{t("detail")}</p></div>
              {overview.isLoading ? <Skeleton height="10rem" radius={16} /> : <p className={s.empty}>{t("pick")}</p>}
            </>
          )}
          <div className={s.cfoot}><span>{t("detailFoot1")}</span><span>{t("detailFoot2")}</span></div>
        </section>
      </div>
      <ProjectFormModal open={form.open} project={form.project} onClose={() => setForm({ open: false, project: null })} onSaved={(id) => setSelectedId(id)} />
    </div>
  );
}

function ProjectCard({ p, on, onPick, draggable, dragging, onDragStart, onDragEnter, onDragEnd }: {
  p: ProjectOverview; on: boolean; onPick: () => void;
  draggable: boolean; dragging: boolean; onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void;
}) {
  const t = useTranslations("wl.projects");
  const pct = pctOf(p.items_done, p.items_total);
  return (
    <button
      type="button"
      className={`${s.pjCard} ${on ? s.pjCardOn : ""} ${p.status !== "active" ? s.pjCardDim : ""} ${dragging ? s.pjCardDrag : ""}`}
      onClick={onPick}
      aria-pressed={on}
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onDragEnter={onDragEnter}
      onDragOver={(e) => { if (draggable) e.preventDefault(); }}
      onDrop={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
    >
      <span className={s.pjCardHead}>
        {draggable && <GripVertical className={s.pjGrip} aria-label={t("grip")} />}
        <b>{p.name}</b>
        <span className={s.code}>P-{p.slug}</span>
        {p.status !== "active" && <Chip static size="sm">{t("statusArchived")}</Chip>}
      </span>
      {p.description && <span className={s.pjCardDesc}>{p.description}</span>}
      <span className={s.pjCardBar}>
        <span className={s.bar}><i className={s.barFill} style={{ width: `${pct ?? 0}%` }} /></span>
        <span>{pct === null ? t("cardNoItems") : t("cardItems", { done: p.items_done, total: p.items_total })}</span>
      </span>
      <span className={s.pjCardMeta}>
        <span>{t("cardGoals", { active: p.goals_active })}</span>
        <span>{t("cardLogs", { count: p.logs_count })}</span>
        <span>{formatHours(Number(p.hours_total))}</span>
        <span>{p.last_log_date ? t("lastLog", { date: fmtMD(p.last_log_date) }) : t("noLog")}</span>
      </span>
    </button>
  );
}

/* ── 상세: [8주 투입 | 통계 세로] · 소개 · 목표 글(각 한 행) · 목표 목록 · 미완 항목 · 최근 기록 ── */
function ProjectDetailPanel({ p, today, onEdit }: { p: ProjectOverview; today: string; onEdit: () => void }) {
  const t = useTranslations("wl.projects");
  const tc = useTranslations("wl.common");
  const detail = useProject(p.id, today);
  const d = detail.data;
  const pct = pctOf(p.items_done, p.items_total);
  return (
    <>
      <div className={s.row}>
        <p className={s.secLab}>
          {p.name} <small><span className={s.code}>P-{p.slug}</span> {p.abbr}</small>
          {p.status !== "active" && <Chip static size="sm">{t("statusArchived")}</Chip>}
        </p>
        <Button variant="secondary" size="sm" onClick={onEdit}>{t("editShort")}</Button>
      </div>
      <div className={s.pjDetail}>
        {/* 1행: 최근 8주 투입(좌) · 통계 4개 세로(우), 반반 · 각각 박스 */}
        <div className={s.pjTop}>
          <div className={s.pjBox}>
            <p className={s.pjLab}>{t("weeks")} <small>{t("hours28", { hours: formatHours(Number(p.hours_28d)) })}</small></p>
            {d ? <WeekBars weeks={d.weeks} /> : <Skeleton height="7rem" radius={12} />}
          </div>
          <div className={s.pjBox}>
            <dl className={s.pjStats}>
              <div className={s.pjStat}><dt>{t("statGoalsActive")}</dt><dd>{p.goals_active}<small> / {p.goals_total}</small></dd></div>
              <div className={s.pjStat}><dt>{t("statItems")}</dt><dd>{pct === null ? "·" : `${pct}%`}<small> {p.items_done}/{p.items_total}</small></dd></div>
              <div className={s.pjStat}><dt>{t("statLogs")}</dt><dd>{tc("countUnit", { count: p.logs_count })}</dd></div>
              <div className={s.pjStat}><dt>{t("statHours")}</dt><dd>{formatHours(Number(p.hours_total))}</dd></div>
            </dl>
          </div>
        </div>

        {/* 2 · 3행: 소개 · 목표 · 방향은 각각 한 행 전체 */}
        <div className={s.pjText}>
          <p className={s.pjLab}>{t("intro")}</p>
          {p.intro_md ? <div className={s.pjMd}><WorkMarkdown md={p.intro_md} /></div> : <p className={s.hint}>{t("introEmpty")}</p>}
        </div>
        <div className={s.pjText}>
          <p className={s.pjLab}>{t("objective")}</p>
          {p.objective_md ? <div className={s.pjMd}><WorkMarkdown md={p.objective_md} /></div> : <p className={s.hint}>{t("objectiveEmpty")}</p>}
        </div>

        {detail.isLoading && <Skeleton height="8rem" radius={16} />}
        {detail.isError && <p className={s.errorNote}>{tc("loadFailed")}</p>}
        {d && (
          <>
            <div>
              <p className={s.pjLab}>{t("goals")} <small>{t("goalsSub", { count: d.goals.length })}</small></p>
              <div className={s.pjList}>
                {d.goals.length === 0 && <p className={s.hint}>{t("goalsEmpty")}</p>}
                {d.goals.map((g) => {
                  const gp = pctOf(g.done_count, g.item_count);
                  return (
                    <div key={g.id} className={`${s.pjGoal} ${g.status !== "active" ? s.goalRowDim : ""}`}>
                      <span className={s.code}>{g.code}</span>
                      <div>
                        <div className={s.goalT}>{g.title}{g.status !== "active" && <Chip static size="sm" tone={g.status === "done" ? "pass" : undefined}>{t(g.status === "done" ? "statusDone" : "statusPaused")}</Chip>}</div>
                        <div className={s.goalM}>{g.period_start || g.period_end ? t("goalMeta", { period: fmtPeriod(g.period_start, g.period_end), count: g.item_count }) : t("goalMetaNoPeriod", { count: g.item_count })}</div>
                      </div>
                      <div className={s.pct}>{gp === null ? "·" : `${gp}%`}<small>{g.done_count}/{g.item_count}</small></div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <p className={s.pjLab}>{t("open")} <small>{t("openSub", { items: d.open_items.length, todos: d.open_todos.length })}</small></p>
              {d.open_items.length + d.open_todos.length === 0 ? <p className={s.hint}>{t("openEmpty")}</p> : (
                <ul className={s.pjOpen}>
                  {d.open_items.map((it) => (
                    <li key={it.id}>
                      <span className={s.code}>{it.code}</span>
                      <span className={s.todoText}>{it.title}</span>
                      <span className={s.todoSrc}>{it.due_date ? `${fmtMD(it.due_date)} · ` : ""}<Link href="/plans">{it.plan_code}</Link></span>
                    </li>
                  ))}
                  {d.open_todos.map((td) => (
                    <li key={td.id}>
                      <span className={s.todoText}>{td.needs_decision && <span className={s.todoAsk}>{t("needsDecision")}: </span>}{td.text}</span>
                      <span className={s.todoSrc}>{td.due_date ? `${fmtMD(td.due_date)} · ` : ""}{td.log_id && td.source ? <Link href={`/logs/${td.log_id}`}>{td.source}</Link> : t("srcTodo")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className={s.pjLab}>{t("recentLogs")} <small>{t("recentSub")}</small></p>
              <div className={s.pjList}>
                {d.recent_logs.length === 0 && <p className={s.hint}>{t("logsEmpty")}</p>}
                {d.recent_logs.map((l) => (
                  <Link key={l.id} href={`/logs/${l.id}`} className={s.pjLog}>
                    <b>{fmtKDate(l.log_date)}</b>
                    <span>{l.summary || "·"}</span>
                    <small>{t("logMeta", { count: l.task_count, done: l.done_count })}</small>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** 최근 8주 투입 막대(회색 박스 안의 흰 박스). 호버 = 말풍선(주 시작일 · 투입). 주 범위는 서버가 조회 시점의 오늘(KST)로 계산한다 */
function WeekBars({ weeks }: { weeks: ProjectDetail["weeks"] }) {
  const t = useTranslations("wl.projects");
  const max = Math.max(...weeks.map((w) => Number(w.hours)), 0.001);
  return (
    <div className={s.pjChart}>
      <div className={s.pjWeeks}>
        {weeks.map((w) => (
          <div key={w.week_start} className={s.pjWeek}>
            <span className={s.tip}>{t("weekLabel", { date: fmtMD(w.week_start) })} · {formatHours(Number(w.hours))}</span>
            <i style={{ height: `${Math.max((Number(w.hours) / max) * 100, 2)}%` }} />
            <small>{fmtMD(w.week_start)}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 추가 · 수정 폼. 코드(slug)는 새로 만들 때만 입력, 보관은 수정 때만 ── */
function ProjectFormModal({ open, project, onClose, onSaved }: { open: boolean; project: ProjectOverview | null; onClose: () => void; onSaved: (id: string) => void }) {
  const t = useTranslations("wl.projects");
  const tc = useTranslations("wl.common");
  const toast = useToast();
  const save = useSaveProject();
  const setStatus = useSetProjectStatus();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [abbr, setAbbr] = useState("");
  const [description, setDescription] = useState("");
  const [intro, setIntro] = useState("");
  const [objective, setObjective] = useState("");
  const [status, setStatusValue] = useState<"active" | "archived">("active");
  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setSlug(project?.slug ?? "");
    setAbbr(project?.abbr ?? "");
    setDescription(project?.description ?? "");
    setIntro(project?.intro_md ?? "");
    setObjective(project?.objective_md ?? "");
    setStatusValue((project?.status as "active" | "archived") ?? "active");
  }, [open, project]);

  const slugUp = slug.trim().toUpperCase();
  const slugOk = !!project || SLUG_RE.test(slugUp);
  const abbrOk = abbr.trim().length >= 1 && abbr.trim().length <= 3;
  const ready = name.trim().length > 0 && slugOk && abbrOk;
  const busy = save.isPending || setStatus.isPending;

  const submit = async () => {
    try {
      const saved = await save.mutateAsync({
        id: project?.id ?? null, slug: project?.slug ?? slugUp, name, abbr, description, introMd: intro, objectiveMd: objective, sort: project?.sort,
      });
      if (project && project.status !== status) await setStatus.mutateAsync({ id: project.id, status });
      toast({ title: t("saved"), variant: "success" });
      onSaved(saved.id);
      onClose();
    } catch (e) {
      toast({ title: tc("saveFailed"), description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Modal
      open={open}
      title={project ? t("edit") : t("add")}
      onClose={onClose}
      size="lg"
      titleAside={project ? <span className={s.code}>P-{project.slug}</span> : undefined}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>{tc("cancel")}</Button>
        <Button onClick={submit} disabled={!ready} loading={busy}>{tc("save")}</Button>
      </>}
    >
      <div className={s.form}>
        <div className={s.pjSlugRow}>
          <Field label={t("fieldName")} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("phName")} />
          <Field
            label={t("fieldSlug")}
            value={project ? project.slug : slug}
            onChange={(e) => setSlug(e.target.value.toUpperCase())}
            disabled={!!project}
            placeholder="ANSERX"
            labelHint={t("slugPrefix")}
            hint={project ? t("slugLocked") : slug && !slugOk ? <span className={s.errorNote}>{t("slugInvalid")}</span> : t("slugHint")}
          />
          <Field label={t("fieldAbbr")} value={abbr} onChange={(e) => setAbbr(e.target.value.toUpperCase())} maxLength={3} placeholder="AX" hint={t("abbrHint")} />
        </div>
        <Field label={t("fieldDescription")} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("phDescription")} />
        <Textarea label={t("fieldIntro")} value={intro} onChange={(e) => setIntro(e.target.value)} rows={5} placeholder={t("phIntro")} hint={t("mdHint")} />
        <Textarea label={t("fieldObjective")} value={objective} onChange={(e) => setObjective(e.target.value)} rows={5} placeholder={t("phObjective")} hint={t("mdHint")} />
        {project && (
          <div className={s.chipPick}>
            <span>{t("fieldStatus")}</span>
            <Segmented
              ariaLabel={t("fieldStatus")}
              size="sm"
              value={status}
              onChange={setStatusValue}
              options={[{ value: "active", label: t("statusActive") }, { value: "archived", label: t("statusArchived") }]}
            />
            <p className={s.hint}>{t("archivedNote")}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
