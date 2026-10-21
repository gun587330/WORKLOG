"use client";

/**
 * 개인 (명세: app/[locale]/(app)/me/me-SPEC.md). 세로 100%, 좌우 비율은 홈과 같다(좌 1fr · 우 = 홈 오른쪽 두 칸 폭).
 * 좌 = 일기(목록 → 카드 클릭 = 폼 모달에서 수정 · 삭제, [일기 쓰기] = 같은 폼으로 새로). 우 = 사용 방법(lib/guide.ts).
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useDeleteDiary, useDiary, useUpsertDiary } from "@/hooks/use-worklog";
import type { DiaryEntry } from "@/lib/api/worklog";
import { GUIDE_MD } from "@/lib/guide";
import { fmtKDate, todayISO } from "@/lib/format";
import { WorkMarkdown } from "./work-markdown";
import s from "./worklog.module.css";

export function MeView() {
  const t = useTranslations("wl.me");
  const tc = useTranslations("wl.common");
  const diary = useDiary();
  const [form, setForm] = useState<{ open: boolean; entry: DiaryEntry | null }>({ open: false, entry: null });
  const rows = diary.data ?? [];

  return (
    <div className={s.page}>
      <PageHeader title={t("title")} />
      <div className={s.meSplit}>
        <section className={s.colCard}>
          <div className={s.row}>
            <p className={s.secLab}>{t("diary")} <small>{t("diaryCount", { count: rows.length })}</small></p>
            <Button size="sm" onClick={() => setForm({ open: true, entry: null })}>{t("write")}</Button>
          </div>
          <div className={s.diaryList}>
            {diary.isLoading && <Skeleton height="6rem" radius={16} />}
            {diary.isError && <p className={s.errorNote}>{tc("loadFailed")}</p>}
            {!diary.isLoading && !diary.isError && rows.length === 0 && <p className={s.empty}>{t("empty")}</p>}
            {rows.map((d) => (
              <button key={d.id} type="button" className={s.diaryCard} onClick={() => setForm({ open: true, entry: d })}>
                <span className={s.diaryHead}>
                  <b>{fmtKDate(d.entry_date)}</b>
                  <span className={s.code}>{d.code}</span>
                </span>
                {d.title && <span className={s.diaryTitle}>{d.title}</span>}
                <span className={s.diaryBody}>{d.body_md}</span>
                {d.tags.length > 0 && <span className={s.chips}>{d.tags.map((tg) => <Chip key={tg} static size="sm">{tg}</Chip>)}</span>}
              </button>
            ))}
          </div>
          <div className={s.cfoot}><span>{t("foot1")}</span><span>{t("foot2")}</span></div>
        </section>

        <section className={s.colCard}>
          <div className={s.row}><p className={s.secLab}>{t("guide")}</p></div>
          <div className={`${s.scrollArea} ${s.guide}`}>
            <WorkMarkdown md={GUIDE_MD} />
          </div>
          <div className={s.cfoot}><span>{t("guideFoot")}</span></div>
        </section>
      </div>
      <DiaryFormModal open={form.open} entry={form.entry} onClose={() => setForm({ open: false, entry: null })} />
    </div>
  );
}

function DiaryFormModal({ open, entry, onClose }: { open: boolean; entry: DiaryEntry | null; onClose: () => void }) {
  const t = useTranslations("wl.me");
  const tc = useTranslations("wl.common");
  const toast = useToast();
  const upsert = useUpsertDiary();
  const del = useDeleteDiary();
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(entry?.entry_date ?? todayISO());
    setTitle(entry?.title ?? "");
    setBody(entry?.body_md ?? "");
    setTags((entry?.tags ?? []).join(", "));
  }, [open, entry]);

  const submit = async () => {
    try {
      await upsert.mutateAsync({
        id: entry?.id ?? null, entryDate: date, title, body,
        tags: tags.split(",").map((x) => x.trim()).filter(Boolean),
      });
      toast({ title: t("saved"), variant: "success" });
      onClose();
    } catch (e) {
      toast({ title: tc("saveFailed"), description: (e as Error).message, variant: "destructive" });
    }
  };
  const remove = async () => {
    if (!entry) return;
    try {
      await del.mutateAsync(entry.id);
      toast({ title: tc("deleted"), variant: "success" });
      setConfirm(false);
      onClose();
    } catch {
      toast({ title: tc("deleteFailed"), variant: "destructive" });
    }
  };

  return (
    <Modal
      open={open}
      title={entry ? t("edit") : t("write")}
      onClose={onClose}
      size="lg"
      titleAside={entry ? <span className={s.code}>{entry.code}</span> : undefined}
      footer={<>
        {entry && <Button variant="danger" className={s.footerLeft} onClick={() => setConfirm(true)}>{tc("delete")}</Button>}
        <Button variant="secondary" onClick={onClose}>{tc("cancel")}</Button>
        <Button onClick={submit} disabled={!body.trim() || !date} loading={upsert.isPending}>{tc("save")}</Button>
      </>}
    >
      <div className={s.formFill}>
        <div className={s.twoCol}>
          <Field label={t("date")} type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!!entry} hint={entry ? t("dateLocked") : undefined} />
          <Field label={t("titleField")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("phTitle")} />
        </div>
        <div className={s.fill}>
          <Textarea label={t("body")} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("phBody")} hint={t("bodyHint")} />
        </div>
        <Field label={t("tags")} value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("phTags")} />
      </div>
      <Modal
        open={confirm}
        title={t("deleteTitle")}
        onClose={() => setConfirm(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirm(false)}>{tc("cancel")}</Button>
          <Button variant="danger" onClick={remove} loading={del.isPending}>{tc("delete")}</Button>
        </>}
      >
        <p className={s.hint}>{t("deleteBody", { code: entry?.code ?? "" })}</p>
      </Modal>
    </Modal>
  );
}
