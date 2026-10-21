"use client";

/**
 * 작업 기록 목록 (명세: app/[locale]/(app)/logs/logs-SPEC.md). 세로 100%.
 * 위 = 제목 + 프로젝트 필터 칩 · 프롬프트 박스(고정) · 아래 = 기록 박스(나머지 높이): 머리 [기록 N건 · 최근순 | 새 기록 올리기],
 * 한 줄 가로 카드(회색 면 · 테두리 없음 · 드래그), 푸터 안내. 카드는 오래된 것이 왼쪽, 새 기록이 오른쪽 끝에 쌓이고
 * 처음 열면 오른쪽 끝(최신)이 보인다(2026-10-22 지시). 카드 = 날짜 · 요약 · 프로젝트 칩 · 작업/완료/투입 · 호버 삭제 아이콘.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useDeleteWorkLog, useProjectNames, useWorkLogs } from "@/hooks/use-worklog";
import type { WorkLogRow } from "@/lib/api/worklog";
import { formatHours } from "@/lib/work-log";
import { fmtKDate } from "@/lib/format";
import { PromptsSection } from "./prompts-section";
import { UploadLogModal } from "./upload-log-modal";
import { useDragScroll } from "./use-drag-scroll";
import s from "./worklog.module.css";

export function LogsView() {
  const t = useTranslations("wl.logs");
  const tc = useTranslations("wl.common");
  const router = useRouter();
  const logs = useWorkLogs();
  const names = useProjectNames();
  const [project, setProject] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const grid = useDragScroll<HTMLDivElement>();

  const rows = logs.data ?? [];
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) for (const sl of r.project_slugs ?? []) m.set(sl, (m.get(sl) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  // 서버는 최신순으로 준다. 화면은 오래된 것 → 새것(왼쪽 → 오른쪽)으로 뒤집어 새 기록이 오른쪽에 쌓이게 한다
  const filtered = useMemo(() => rows.filter((r) => !project || (r.project_slugs ?? []).includes(project)).slice().reverse(), [rows, project]);
  useEffect(() => {
    const el = grid.ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [filtered.length, project, grid.ref]);

  return (
    <div className={s.page}>
      <PageHeader
        title={t("title")}
        actions={
          <div className={s.chips}>
            <Chip on={project === null} count size="sm" onClick={() => setProject(null)}>{tc("all")}<span>{rows.length}</span></Chip>
            {counts.map(([sl, n]) => (
              <Chip key={sl} on={project === sl} count size="sm" onClick={() => setProject(project === sl ? null : sl)}>{names.name(sl)}<span>{n}</span></Chip>
            ))}
          </div>
        }
      />
      <PromptsSection />
      <section className={s.logsBox}>
        <div className={s.row}>
          <p className={s.secLab}>{t("records")} <small>{t("recordCount", { count: filtered.length })}</small></p>
          <Button size="sm" onClick={() => setUploadOpen(true)}>{t("newRecord")}</Button>
        </div>
        <div ref={grid.ref} className={s.hgrid} {...grid.handlers}>
          {logs.isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} height="100%" radius={18} />)}
          {logs.isError && <p className={s.empty}>{tc("loadFailed")}</p>}
          {!logs.isLoading && !logs.isError && filtered.length === 0 && <p className={s.empty} style={{ gridColumn: "1 / -1", width: "100%" }}>{t("empty")}</p>}
          {filtered.map((r) => <EntryCard key={r.id} row={r} name={names.name} />)}
        </div>
        <div className={s.cfoot}><span>{t("foot1")}</span><span>{t("foot2")}</span></div>
      </section>
      <UploadLogModal open={uploadOpen} onClose={() => setUploadOpen(false)} onPublished={(id) => { setUploadOpen(false); router.push(`/logs/${id}`); }} />
    </div>
  );
}

function EntryCard({ row, name }: { row: WorkLogRow; name: (slug: string) => string }) {
  const t = useTranslations("wl.logs");
  const tc = useTranslations("wl.common");
  const toast = useToast();
  const del = useDeleteWorkLog();
  const [confirm, setConfirm] = useState(false);
  const remove = async () => {
    try {
      await del.mutateAsync(row.id);
      toast({ title: tc("deleted"), variant: "success" });
      setConfirm(false);
    } catch {
      toast({ title: tc("deleteFailed"), variant: "destructive" });
    }
  };
  return (
    <div className={s.entryWrap}>
      <Link href={`/logs/${row.id}`} className={s.entry} draggable={false}>
        <div className={s.entryDate}>{fmtKDate(row.log_date)}<small>{row.code}</small></div>
        <p className={s.entrySum}>{row.summary ?? ""}</p>
        <div className={s.entryChips}>
          {(row.project_slugs ?? []).map((sl) => <Chip key={sl} static size="sm" tone="accent">{name(sl)}</Chip>)}
        </div>
        <dl className={s.entryNums}>
          <div><dt>{t("statTasks")}</dt><dd>{tc("countUnit", { count: row.task_count })}</dd></div>
          <div><dt>{t("statDone")}</dt><dd>{tc("countUnit", { count: row.done_count })}</dd></div>
          <div><dt>{t("statHours")}</dt><dd>{formatHours(Number(row.hours_total))}</dd></div>
        </dl>
      </Link>
      <button type="button" className={s.entryDelete} aria-label={tc("delete")} title={tc("delete")} onClick={() => setConfirm(true)}>
        <Trash2 size={13} aria-hidden="true" />
      </button>
      <Modal
        open={confirm}
        title={t("deleteTitle")}
        onClose={() => setConfirm(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirm(false)}>{tc("cancel")}</Button>
          <Button variant="danger" onClick={remove} loading={del.isPending}>{tc("delete")}</Button>
        </>}
      >
        <p className={s.hint}>{t("deleteBody", { code: row.code })}</p>
      </Modal>
    </div>
  );
}
