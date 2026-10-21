"use client";

/**
 * 프롬프트 모음 박스 — 작업 기록 화면 상단(명세: app/[locale]/(app)/logs/logs-SPEC.md §2).
 * 카드 = 제목 · 용도 · 수정일 · [복사] [전체 보기]. 가로 드래그. 끝에 점선 [프롬프트 추가], 머리에도 같은 버튼(블랙).
 * 전체 보기 = 읽기 전용 폼 모달, 추가 = 폼 모달. 시드 2종(기록용 · 계획용)의 원본은 supabase/seed/prompts.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { usePrompts, useUpsertPrompt } from "@/hooks/use-worklog";
import type { Prompt } from "@/lib/api/worklog";
import { fmtMD } from "@/lib/format";
import { useDragScroll } from "./use-drag-scroll";
import s from "./worklog.module.css";

export function PromptsSection() {
  const t = useTranslations("wl.logs");
  const tc = useTranslations("wl.common");
  const toast = useToast();
  const prompts = usePrompts();
  const strip = useDragScroll<HTMLDivElement>();
  const [viewing, setViewing] = useState<Prompt | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const copy = async (p: Prompt) => {
    try {
      await navigator.clipboard.writeText(p.body);
      toast({ title: tc("copied") });
    } catch {
      toast({ title: tc("copyFailed"), variant: "destructive" });
    }
  };

  return (
    <section className={s.promptCard}>
      <div className={s.row}>
        <p className={s.secLab}>{t("prompts")} <small>{t("promptCount", { count: prompts.data?.length ?? 0 })}</small></p>
        <Button size="sm" onClick={() => setAddOpen(true)}>{t("addPrompt")}</Button>
      </div>
      <div ref={strip.ref} className={`${s.strip} ${strip.dragging ? s.stripDrag : ""}`} {...strip.handlers}>
        {prompts.isLoading && <Skeleton width="16rem" height="6.5rem" radius={18} />}
        {prompts.isError && <p className={s.errorNote}>{tc("loadFailed")}</p>}
        {(prompts.data ?? []).map((p) => (
          <div key={p.id} className={s.pcard}>
            <b>{p.title}</b>
            <small title={p.purpose ?? ""}>{p.purpose ? `${p.purpose} · ` : ""}{fmtMD(p.updated_at)}</small>
            <div className={s.pcardActs}>
              <Button size="sm" onClick={() => copy(p)}>{t("copy")}</Button>
              <Button variant="secondary" size="sm" onClick={() => setViewing(p)}>{t("viewAll")}</Button>
            </div>
          </div>
        ))}
        <button type="button" className={s.padd} onClick={() => setAddOpen(true)}>
          <Plus aria-hidden="true" /> {t("addPrompt")}
        </button>
      </div>
      <div className={s.cfoot}><span>{t("promptFoot")}</span></div>

      <PromptViewModal prompt={viewing} onClose={() => setViewing(null)} onCopy={copy} />
      <PromptAddModal open={addOpen} onClose={() => setAddOpen(false)} />
    </section>
  );
}

function PromptViewModal({ prompt, onClose, onCopy }: { prompt: Prompt | null; onClose: () => void; onCopy: (p: Prompt) => void }) {
  const t = useTranslations("wl.logs");
  const tc = useTranslations("wl.common");
  return (
    <Modal
      open={!!prompt}
      title={prompt?.title ?? ""}
      onClose={onClose}
      size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tc("close")}</Button>
        {prompt && <Button onClick={() => onCopy(prompt)}>{t("copyPrompt")}</Button>}
      </>}
    >
      {prompt && (
        <div className={s.formFill}>
          <Field label={t("fieldPurpose")} value={`${prompt.purpose ?? ""}${prompt.purpose ? " · " : ""}${fmtMD(prompt.updated_at)}`} readOnly />
          <div className={s.fill}>
            <Textarea label={t("fieldBody")} value={prompt.body} readOnly className={s.monoBody} hint={t("readonlyHint")} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function PromptAddModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("wl.logs");
  const tc = useTranslations("wl.common");
  const toast = useToast();
  const upsert = useUpsertPrompt();
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [body, setBody] = useState("");
  const reset = () => { setTitle(""); setPurpose(""); setBody(""); };
  const submit = async () => {
    try {
      await upsert.mutateAsync({ title: title.trim(), purpose: purpose.trim(), body });
      toast({ title: t("promptAdded"), variant: "success" });
      reset();
      onClose();
    } catch {
      toast({ title: tc("saveFailed"), variant: "destructive" });
    }
  };
  return (
    <Modal
      open={open}
      title={t("addPrompt")}
      onClose={() => { reset(); onClose(); }}
      size="lg"
      footer={<>
        <Button variant="secondary" onClick={() => { reset(); onClose(); }}>{tc("cancel")}</Button>
        <Button onClick={submit} disabled={!title.trim() || !body.trim()} loading={upsert.isPending}>{tc("add")}</Button>
      </>}
    >
      <div className={s.formFill}>
        <Field label={t("fieldTitle")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("phTitle")} />
        <Field label={t("fieldPurpose")} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={t("phPurpose")} />
        <div className={s.fill}>
          <Textarea label={t("fieldBody")} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("phBody")} className={s.monoBody} />
        </div>
      </div>
    </Modal>
  );
}
