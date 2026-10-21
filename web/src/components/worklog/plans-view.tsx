"use client";

/**
 * 작업 계획 및 목표 (명세: app/[locale]/(app)/plans/plans-SPEC.md). 세로 100%, 좌우 1:1.
 * 좌 = 계획 목록(카드 → 상세 모달: 목표별 할 일 체크 · 원문 · 삭제) + [새 계획 올리기].
 * 우 = 목표 평면 목록(행마다 프로젝트 배지 · 달성률 · 수정 · 삭제) + 필터 칩 + [목표 추가](폼 모달).
 * 머리 우측 [이번 주 컨텍스트 복사] = context_pack 을 클립보드로(VOCAB §5). ?plan=<id> 로 오면 그 계획을 바로 연다(홈의 열기).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
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
import {
  useContextPack, useDeleteGoal, useDeletePlan, useGoals, usePlan, usePlans, useProjectNames, useProjects,
  useSetPlanItemStatus, useUpsertGoal,
} from "@/hooks/use-worklog";
import type { GoalRow, PlanRow } from "@/lib/api/worklog";
import { fmtPeriod, fmtMD } from "@/lib/format";
import { UploadPlanModal } from "./upload-plan-modal";
import s from "./worklog.module.css";

type GoalFilter = "active" | "done" | "all";

export function PlansView() {
  const t = useTranslations("wl.plans");
  const tc = useTranslations("wl.common");
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const plans = usePlans();
  const goals = useGoals();
  const names = useProjectNames();
  const ctx = useContextPack();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [goalFilter, setGoalFilter] = useState<GoalFilter>("active");
  const [goalForm, setGoalForm] = useState<{ open: boolean; goal: GoalRow | null }>({ open: false, goal: null });
  const [goalDel, setGoalDel] = useState<GoalRow | null>(null);

  useEffect(() => {
    const q = params.get("plan");
    if (q) { setPlanId(q); router.replace("/plans"); }
  }, [params, router]);

  const copyContext = async () => {
    try {
      const text = await ctx.mutateAsync();
      await navigator.clipboard.writeText(text);
      toast({ title: t("contextCopied"), variant: "success" });
    } catch {
      toast({ title: tc("copyFailed"), variant: "destructive" });
    }
  };

  const allGoals = goals.data ?? [];
  const activeCount = allGoals.filter((g) => g.status === "active").length;
  const shownGoals = useMemo(() => allGoals.filter((g) => goalFilter === "all" || g.status === goalFilter), [allGoals, goalFilter]);

  return (
    <div className={s.page}>
      <PageHeader title={t("title")} actions={<Button variant="secondary" size="sm" onClick={copyContext} loading={ctx.isPending}>{t("copyContext")}</Button>} />
      <div className={s.split}>
        {/* 좌: 계획 */}
        <section className={s.colCard}>
          <div className={s.row}>
            <p className={s.secLab}>{t("plans")} <small>{t("plansSub", { count: plans.data?.length ?? 0 })}</small></p>
            <Button size="sm" onClick={() => setUploadOpen(true)}>{t("newPlan")}</Button>
          </div>
          <div className={s.planList}>
            {plans.isLoading && <Skeleton height="5.5rem" radius={18} />}
            {plans.isError && <p className={s.errorNote}>{tc("loadFailed")}</p>}
            {!plans.isLoading && !plans.isError && (plans.data?.length ?? 0) === 0 && <p className={s.empty}>{t("plansEmpty")}</p>}
            {(plans.data ?? []).map((p) => <PlanCard key={p.id} plan={p} name={names.name} onOpen={() => setPlanId(p.id)} />)}
          </div>
          <div className={s.cfoot}><span>{t("planFoot1")}</span><span>{t("planFoot2")}</span></div>
        </section>

        {/* 우: 목표 */}
        <section className={s.colCard}>
          <div className={s.row}>
            <p className={s.secLab}>{t("goals")} <small>{t("goalsSub", { count: allGoals.length, active: activeCount })}</small></p>
            <div className={s.chips}>
              <Chip on={goalFilter === "active"} size="sm" onClick={() => setGoalFilter("active")}>{t("filterActive")}</Chip>
              <Chip on={goalFilter === "done"} size="sm" onClick={() => setGoalFilter("done")}>{t("filterDone")}</Chip>
              <Chip on={goalFilter === "all"} size="sm" onClick={() => setGoalFilter("all")}>{t("filterAll")}</Chip>
            </div>
            <Button size="sm" onClick={() => setGoalForm({ open: true, goal: null })}>{t("addGoal")}</Button>
          </div>
          <div className={s.glist}>
            {goals.isLoading && <Skeleton height="4rem" radius={16} />}
            {goals.isError && <p className={s.errorNote}>{tc("loadFailed")}</p>}
            {!goals.isLoading && !goals.isError && shownGoals.length === 0 && <p className={s.empty}>{t("goalsEmpty")}</p>}
            {shownGoals.map((g) => {
              const pct = g.item_count ? Math.round((g.done_count / g.item_count) * 100) : null;
              return (
                <div key={g.id} className={`${s.goalRow} ${g.status !== "active" ? s.goalRowDim : ""}`}>
                  <span className={s.code}>{g.code}</span>
                  <div>
                    <div className={s.goalT}>{g.title} <Chip static size="sm" tone="accent">{g.project_name}</Chip>{g.status !== "active" && <Chip static size="sm" tone={g.status === "done" ? "pass" : undefined}>{t(g.status === "done" ? "statusDone" : "statusPaused")}</Chip>}</div>
                    <div className={s.goalM}>{g.period_start || g.period_end ? t("goalMeta", { period: fmtPeriod(g.period_start, g.period_end), count: g.item_count }) : t("goalMetaNoPeriod", { count: g.item_count })}</div>
                  </div>
                  <div className={s.pct}>{pct === null ? "-" : `${pct}%`}<small>{g.done_count}/{g.item_count}</small></div>
                  <div className={s.ico}>
                    <button type="button" className={s.iconBtn} aria-label={t("edit")} title={t("edit")} onClick={() => setGoalForm({ open: true, goal: g })}><Pencil size={13} aria-hidden="true" /></button>
                    <button type="button" className={s.iconDel} aria-label={tc("delete")} title={tc("delete")} onClick={() => setGoalDel(g)}><Trash2 size={13} aria-hidden="true" /></button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className={s.cfoot}><span>{t("goalFoot1")}</span><span>{t("goalFoot2")}</span></div>
        </section>
      </div>

      <UploadPlanModal open={uploadOpen} onClose={() => setUploadOpen(false)} onPublished={(id) => { setUploadOpen(false); toast({ title: t("planPublished"), variant: "success" }); setPlanId(id); }} />
      <PlanDetailModal id={planId} onClose={() => setPlanId(null)} name={names.name} />
      <GoalFormModal open={goalForm.open} goal={goalForm.goal} onClose={() => setGoalForm({ open: false, goal: null })} />
      <GoalDeleteModal goal={goalDel} onClose={() => setGoalDel(null)} />
    </div>
  );
}

function PlanCard({ plan, name, onOpen }: { plan: PlanRow; name: (s: string) => string; onOpen: () => void }) {
  const t = useTranslations("wl.plans");
  return (
    <button type="button" className={s.plan} onClick={onOpen}>
      <div>
        <span className={s.planPer}>{fmtPeriod(plan.period_start, plan.period_end)} · {plan.code}</span>
        <h3 className={s.planTitle}>{plan.title}</h3>
        <div className={s.chips}>
          {(plan.project_slugs ?? []).map((sl) => <Chip key={sl} static size="sm" tone="accent">{name(sl)}</Chip>)}
          <Chip static size="sm" tone={plan.status === "done" ? "pass" : "caution"}>{t(plan.status === "done" ? "statusDone" : "statusActive")}</Chip>
        </div>
      </div>
      <div className={s.planRight}><b>{plan.goal_count}</b>{t("planRight", { items: plan.item_count, done: plan.done_count })}</div>
    </button>
  );
}

/* ── 계획 상세: 목표별 할 일(체크 = set_plan_item_status) · 원문 · 삭제 ── */
function PlanDetailModal({ id, onClose, name }: { id: string | null; onClose: () => void; name: (s: string) => string }) {
  const t = useTranslations("wl.plans");
  const tc = useTranslations("wl.common");
  const toast = useToast();
  const plan = usePlan(id);
  const setStatus = useSetPlanItemStatus();
  const del = useDeletePlan();
  const [confirm, setConfirm] = useState(false);
  const d = plan.data;
  const groups = useMemo(() => {
    const m = new Map<string, { title: string; project: string; items: NonNullable<typeof d>["items"] }>();
    for (const it of d?.items ?? []) {
      const g = m.get(it.goal_code) ?? { title: it.goal_title, project: it.project_slug, items: [] };
      g.items.push(it);
      m.set(it.goal_code, g);
    }
    return [...m.entries()];
  }, [d]);
  const remove = async () => {
    if (!id) return;
    try {
      await del.mutateAsync(id);
      toast({ title: tc("deleted"), variant: "success" });
      setConfirm(false);
      onClose();
    } catch {
      toast({ title: tc("deleteFailed"), variant: "destructive" });
    }
  };
  return (
    <Modal
      open={!!id}
      title={d ? d.plan.title : t("planDetail")}
      onClose={onClose}
      size="lg"
      titleAside={d ? <span className={s.code}>{d.plan.code}</span> : undefined}
      footer={<>
        <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>{t("deletePlan")}</Button>
        <Button variant="secondary" onClick={onClose}>{tc("close")}</Button>
      </>}
    >
      {plan.isLoading && <Skeleton height="10rem" radius={16} />}
      {plan.isError && <p className={s.errorNote}>{tc("loadFailed")}</p>}
      {d && (
        <div className={s.form}>
          <p className={s.hint}>{fmtPeriod(d.plan.period_start, d.plan.period_end)}{d.plan.summary ? ` · ${d.plan.summary}` : ""}</p>
          {groups.map(([code, g]) => (
            <div key={code} className={s.piGroup}>
              <div className={s.piGroupHead}><span className={s.code}>{code}</span>{g.title}<Chip static size="sm" tone="accent">{name(g.project)}</Chip></div>
              {g.items.map((it) => (
                <div key={it.id} className={s.piRow}>
                  <button
                    type="button"
                    className={`${s.todoBox} ${it.status === "done" ? s.todoBoxOn : ""}`}
                    aria-label={it.status === "done" ? t("markOpen") : t("markDone")}
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate({ id: it.id, status: it.status === "done" ? "open" : "done" })}
                  />
                  <span className={`${s.todoText} ${it.status === "done" ? s.todoDone : ""}`}>
                    <span className={s.code}>{it.code}</span> {it.title}
                    {it.done_log_id && <> · <Link href={`/logs/${it.done_log_id}`}>{t("doneBy")}</Link></>}
                  </span>
                  <span className={s.piDue}>{it.due_date ? fmtMD(it.due_date) : t("noDue")}</span>
                </div>
              ))}
            </div>
          ))}
          <details>
            <summary className={s.hint} style={{ cursor: "pointer" }}>{t("rawMd")}</summary>
            <pre className={s.rawMd}>{d.plan.raw_md}</pre>
          </details>
        </div>
      )}
      <Modal
        open={confirm}
        title={t("deletePlanTitle")}
        onClose={() => setConfirm(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirm(false)}>{tc("cancel")}</Button>
          <Button variant="danger" onClick={remove} loading={del.isPending}>{tc("delete")}</Button>
        </>}
      >
        <p className={s.hint}>{t("deletePlanBody", { code: d?.plan.code ?? "", count: d?.items.length ?? 0 })}</p>
      </Modal>
    </Modal>
  );
}

/* ── 목표 추가 · 수정 폼 ── */
function GoalFormModal({ open, goal, onClose }: { open: boolean; goal: GoalRow | null; onClose: () => void }) {
  const t = useTranslations("wl.plans");
  const tc = useTranslations("wl.common");
  const toast = useToast();
  const projects = useProjects();
  const upsert = useUpsertGoal();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [status, setStatus] = useState<"active" | "paused" | "done">("active");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!open) return;
    setTitle(goal?.title ?? "");
    setSlug(goal?.project_slug ?? "");
    setStart(goal?.period_start ?? "");
    setEnd(goal?.period_end ?? "");
    setStatus((goal?.status as "active" | "paused" | "done") ?? "active");
    setNote(goal?.note ?? "");
  }, [open, goal]);
  const submit = async () => {
    try {
      await upsert.mutateAsync({ id: goal?.id ?? null, title: title.trim(), projectSlug: slug, periodStart: start || null, periodEnd: end || null, status, note });
      toast({ title: t("goalSaved"), variant: "success" });
      onClose();
    } catch (e) {
      toast({ title: tc("saveFailed"), description: (e as Error).message, variant: "destructive" });
    }
  };
  return (
    <Modal
      open={open}
      title={goal ? t("editGoal") : t("addGoal")}
      onClose={onClose}
      size="lg"
      titleAside={goal ? <span className={s.code}>{goal.code}</span> : undefined}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tc("cancel")}</Button>
        <Button onClick={submit} disabled={!title.trim() || !slug} loading={upsert.isPending}>{tc("save")}</Button>
      </>}
    >
      <div className={s.form}>
        <Field label={t("fieldTitle")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("phGoalTitle")} />
        <div className={s.chipPick}>
          <span>{t("fieldProject")}</span>
          <div className={s.chips}>
            {(projects.data ?? []).map((p) => <Chip key={p.slug} on={slug === p.slug} size="sm" onClick={() => setSlug(p.slug)}>{p.name}</Chip>)}
          </div>
        </div>
        <div className={s.twoCol}>
          <Field label={t("fieldStart")} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <Field label={t("fieldEnd")} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        {goal && (
          <div className={s.chipPick}>
            <span>{t("fieldStatus")}</span>
            <Segmented
              ariaLabel={t("fieldStatus")}
              size="sm"
              value={status}
              onChange={setStatus}
              options={[{ value: "active", label: t("statusActive") }, { value: "paused", label: t("statusPaused") }, { value: "done", label: t("statusDone") }]}
            />
          </div>
        )}
        <Textarea label={t("fieldNote")} value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </div>
    </Modal>
  );
}

function GoalDeleteModal({ goal, onClose }: { goal: GoalRow | null; onClose: () => void }) {
  const t = useTranslations("wl.plans");
  const tc = useTranslations("wl.common");
  const toast = useToast();
  const del = useDeleteGoal();
  const remove = async () => {
    if (!goal) return;
    try {
      await del.mutateAsync(goal.id);
      toast({ title: tc("deleted"), variant: "success" });
      onClose();
    } catch (e) {
      toast({ title: tc("deleteFailed"), description: (e as Error).message, variant: "destructive" });
    }
  };
  return (
    <Modal
      open={!!goal}
      title={t("deleteGoalTitle")}
      onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tc("cancel")}</Button>
        <Button variant="danger" onClick={remove} loading={del.isPending} disabled={!!goal && goal.item_count > 0}>{tc("delete")}</Button>
      </>}
    >
      <p className={s.hint}>{goal ? t("deleteGoalBody", { code: goal.code, title: goal.title }) : ""}</p>
      {goal && goal.item_count > 0 && <p className={s.errorNote}>{t("deleteGoalBlocked", { count: goal.item_count })}</p>}
    </Modal>
  );
}
