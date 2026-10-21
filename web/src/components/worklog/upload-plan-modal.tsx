"use client";

/**
 * 새 계획 올리기 — 입력 → 검수 → 게시(insert_plan). 검수는 목표마다 "기존 코드(제목 확인)" 또는
 * "[신규] 새로 만듦(비슷한 기존 목표 경고)" 을 보이고, 할 일 수 · 기한 · 판단 필요를 요약한다 (PLAN.md §6-4 · 리스크 1).
 */
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useGoals, useInsertPlan, usePlans, useProjects } from "@/hooks/use-worklog";
import { parseWorkPlan, type ParsedWorkPlan } from "@/lib/work-plan";
import { fmtMD, fmtPeriod } from "@/lib/format";
import { MdInput } from "./md-input";
import s from "./worklog.module.css";

const BLOCKING = /머리말|period|title|kind |비어 있어요|코드로 시작|프로젝트 코드가 잘못|\(P-코드\) 가 없어요|찾지 못했어요|이상해요|목표는 없어요|등록된 프로젝트|이미 있어요/;
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export function UploadPlanModal({ open, onClose, onPublished }: { open: boolean; onClose: () => void; onPublished: (id: string) => void }) {
  const t = useTranslations("wl.planUpload");
  const tu = useTranslations("wl.upload");
  const tc = useTranslations("wl.common");
  const insert = useInsertPlan();
  const projects = useProjects(true);
  const goals = useGoals();
  const plans = usePlans();
  const [md, setMd] = useState("");
  const [step, setStep] = useState<"input" | "review">("input");
  const [serverError, setServerError] = useState<string | null>(null);

  const parsed: ParsedWorkPlan | null = useMemo(() => (md.trim() ? parseWorkPlan(md) : null), [md]);
  const goalByCode = useMemo(() => new Map((goals.data ?? []).map((g) => [g.code, g])), [goals.data]);
  const { problems, notes } = useMemo(() => {
    const problems: string[] = parsed ? [...parsed.problems] : [];
    const notes: string[] = [];
    if (!parsed) return { problems, notes };
    const slugs = new Set((projects.data ?? []).map((p) => p.slug));
    for (const g of parsed.goals) {
      if (g.isNew) {
        if (projects.data && g.projectSlug && !slugs.has(g.projectSlug)) problems.push(tu("unknownProject", { slug: g.projectSlug }));
        const similar = (goals.data ?? []).filter((x) => { const a = norm(x.title), b = norm(g.title); return a === b || a.includes(b) || b.includes(a); });
        if (similar.length) notes.push(t("similar", { title: g.title, codes: similar.map((x) => `${x.code} ${x.title}`).join(", ") }));
      } else if (goals.data && !goalByCode.has(g.ref)) problems.push(tu("unknownGoal", { code: g.ref }));
    }
    if (plans.data?.some((p) => p.code === parsed.code)) problems.push(t("dupCode", { code: parsed.code }));
    const newCount = parsed.goals.filter((g) => g.isNew).length;
    if (newCount) notes.unshift(t("newGoals", { count: newCount }));
    return { problems, notes };
  }, [parsed, projects.data, goals.data, plans.data, goalByCode, t, tu]);
  const blocking = !parsed || problems.some((p) => BLOCKING.test(p));

  const reset = () => { setMd(""); setStep("input"); setServerError(null); };
  const close = () => { reset(); onClose(); };
  const publish = async () => {
    if (!parsed) return;
    setServerError(null);
    try {
      const row = await insert.mutateAsync({ parsed, rawMd: md });
      reset();
      onPublished(row.id);
    } catch (e) {
      setServerError((e as Error).message);
    }
  };

  return (
    <Modal
      open={open}
      title={t("title")}
      onClose={close}
      size="lg"
      footer={step === "input" ? (
        <>
          <Button variant="secondary" onClick={close}>{tc("cancel")}</Button>
          <Button onClick={() => setStep("review")} disabled={!parsed}>{tu("review")}</Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={() => setStep("input")}>{tu("back")}</Button>
          <Button onClick={publish} disabled={blocking} loading={insert.isPending}>{tu("publish")}</Button>
        </>
      )}
    >
      {step === "input" ? (
        <MdInput md={md} onChange={setMd} dropHint={t("dropHint")} />
      ) : parsed && (
        <div className={s.form}>
          <div className={s.previewBox}>
            <b>{parsed.meta.title || t("noTitle")} {parsed.code && <span className={s.code}>{parsed.code}</span>}</b>
            <span>{t("period")} {fmtPeriod(parsed.meta.periodStart, parsed.meta.periodEnd)}</span>
            {parsed.meta.summary && <span>{parsed.meta.summary}</span>}
            <div className={s.previewStats}>
              <span>{t("goals")} <strong>{tc("countUnit", { count: parsed.goals.length })}</strong></span>
              <span>{t("items")} <strong>{tc("countUnit", { count: parsed.items.length })}</strong></span>
              <span>{t("decisions")} <strong>{tc("countUnit", { count: parsed.decisions.length })}</strong></span>
            </div>
          </div>
          <ul className={s.reviewList}>
            {parsed.goals.map((g) => {
              const existing = g.isNew ? null : goalByCode.get(g.ref);
              const n = parsed.items.filter((i) => i.goalRef === g.ref).length;
              return (
                <li key={g.ref}>
                  {g.isNew ? <Chip static size="sm" tone="caution">{t("newTag")}</Chip> : <span className={s.code}>{g.ref}</span>}
                  <span>{g.isNew ? `${g.title} (P-${g.projectSlug ?? "?"})` : existing ? existing.title : g.title}</span>
                  <span>{t("itemCount", { count: n })}</span>
                </li>
              );
            })}
          </ul>
          {parsed.items.some((i) => i.dueDate) && (
            <p className={s.hint}>{t("dueNote", { dates: [...new Set(parsed.items.map((i) => i.dueDate).filter(Boolean) as string[])].map(fmtMD).join(" · ") })}</p>
          )}
          {problems.length > 0 ? <ul className={s.problems}>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul> : <p className={s.hint}>{t("reviewOk")}</p>}
          {notes.length > 0 && <ul className={s.notes}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
          {serverError && <ul className={s.problems}><li>{tu("serverFailed", { message: serverError })}</li></ul>}
        </div>
      )}
    </Modal>
  );
}
