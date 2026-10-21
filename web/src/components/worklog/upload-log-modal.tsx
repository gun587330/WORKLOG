"use client";

/**
 * 새 기록 올리기 — 입력(파일 · 붙여넣기) → 검수 → 게시(insert_work_log, 항상 새 행) → 상세로 이동.
 * 검수는 파서 문제 + **코드 대조**(프로젝트 P-코드 · 목표 G-코드가 실제로 있는지, VOCAB §2) 를 함께 보인다.
 * 계획 항목 코드(G12-3)의 존재는 서버(RPC)가 확인하고 거절 사유를 그대로 띄운다.
 */
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useGoals, useInsertWorkLog, useProjects } from "@/hooks/use-worklog";
import { formatHours, parseWorkLog, type ParsedWorkLog } from "@/lib/work-log";
import { fmtKDate } from "@/lib/format";
import { MdInput } from "./md-input";
import s from "./worklog.module.css";

const BLOCKING = /머리말|date |author|작업 섹션|kind |프로젝트\(P-코드\)가 없어요|P-코드 모양|G-코드 모양|등록된 프로젝트|목표는 없어요|화면에 보이는 글/;

export function UploadLogModal({ open, onClose, onPublished }: { open: boolean; onClose: () => void; onPublished: (id: string) => void }) {
  const t = useTranslations("wl.upload");
  const tc = useTranslations("wl.common");
  const tl = useTranslations("wl.logs");
  const insert = useInsertWorkLog();
  const projects = useProjects(true);
  const goals = useGoals();
  const [md, setMd] = useState("");
  const [step, setStep] = useState<"input" | "review">("input");
  const [serverError, setServerError] = useState<string | null>(null);

  const parsed: ParsedWorkLog | null = useMemo(() => (md.trim() ? parseWorkLog(md) : null), [md]);
  const problems = useMemo(() => {
    if (!parsed) return [];
    const out = [...parsed.problems];
    const slugs = new Set((projects.data ?? []).map((p) => p.slug));
    const codes = new Set((goals.data ?? []).map((g) => g.code));
    if (projects.data) for (const sl of parsed.projectSlugs) if (!slugs.has(sl)) out.push(t("unknownProject", { slug: sl }));
    if (goals.data) for (const g of new Set(parsed.items.map((i) => i.goalCode).filter(Boolean) as string[])) if (!codes.has(g)) out.push(t("unknownGoal", { code: g }));
    return out;
  }, [parsed, projects.data, goals.data, t]);
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
          <Button onClick={() => setStep("review")} disabled={!parsed}>{t("review")}</Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={() => setStep("input")}>{t("back")}</Button>
          <Button onClick={publish} disabled={blocking} loading={insert.isPending}>{t("publish")}</Button>
        </>
      )}
    >
      {step === "input" ? (
        <MdInput md={md} onChange={setMd} dropHint={t("dropHint")} />
      ) : parsed && (
        <div className={s.form}>
          <div className={s.previewBox}>
            <b>{parsed.meta.date ? `${fmtKDate(parsed.meta.date)} · ${parsed.meta.date}` : t("noDate")}</b>
            <span>{parsed.meta.author || t("noAuthor")}{parsed.meta.role ? ` · ${parsed.meta.role}` : ""}</span>
            <span>{parsed.meta.summary}</span>
            <div className={s.previewStats}>
              <span>{tl("statTasks")} <strong>{tc("countUnit", { count: parsed.items.length })}</strong></span>
              <span>{tl("statDone")} <strong>{tc("countUnit", { count: parsed.doneCount })}</strong></span>
              <span>{tl("statHours")} <strong>{formatHours(parsed.hoursTotal)}</strong></span>
              <span>{tl("statTodos")} <strong>{tc("countUnit", { count: parsed.todos.length })}</strong></span>
              <span>{tl("statProjects")} <strong>{parsed.projectSlugs.map((p) => `P-${p}`).join(" · ") || "-"}</strong></span>
            </div>
          </div>
          {problems.length > 0 ? (
            <ul className={s.problems}>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
          ) : (
            <p className={s.hint}>{t("reviewOk")}</p>
          )}
          {parsed.completions.length > 0 && (
            <ul className={s.notes}><li>{t("completionsNote", { count: parsed.completions.length, codes: parsed.completions.join(", ") })}</li></ul>
          )}
          {serverError && <ul className={s.problems}><li>{t("serverFailed", { message: serverError })}</li></ul>}
          <p className={s.hint}>{t("appendHint")}</p>
        </div>
      )}
    </Modal>
  );
}
