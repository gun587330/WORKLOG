"use client";

/**
 * 스크랩 (명세: app/[locale]/(app)/scraps/scraps-SPEC.md). 형식 제한 없는 파일과 링크를 모아 두는 곳. 세로 100%.
 * 박스 하나: 머리 [스크랩 N개 | 종류 칩 | 올리기] · 카드 격자(이미지는 썸네일, 나머지는 확장자 타일) · 푸터.
 * 카드를 누르면 보기 모달(왼쪽 미리보기 · 오른쪽 정보 폼, 푸터 [삭제] [내려받기 · 열기] [닫기] [저장]).
 * 파일 본체는 Supabase Storage 비공개 버킷 'scraps', 열 때마다 1시간짜리 주소를 받는다(0020).
 * HTML 은 격리된 iframe(srcdoc, sandbox: 스크립트만 허용 · 사이트 쿠키 접근 없음)으로 그대로 보여 준다.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText, Link2, Upload } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useAddScrapLink, useDeleteScrap, useScraps, useUpdateScrap, useUploadScrapFile } from "@/hooks/use-worklog";
import { SCRAP_MAX_BYTES, scrapSignedUrl, type Scrap } from "@/lib/api/worklog";
import { fmtKDate, toISO } from "@/lib/format";
import s from "./worklog.module.css";

type Filter = "all" | "image" | "doc" | "web" | "link" | "etc";

const ext = (name: string | null) => (name?.match(/\.([a-z0-9]{1,6})$/i)?.[1] ?? "").toLowerCase();
const isImage = (x: Scrap) => x.kind === "file" && (x.mime_type ?? "").startsWith("image/");
const isPdf = (x: Scrap) => x.kind === "file" && (x.mime_type === "application/pdf" || ext(x.file_name) === "pdf");
const isHtml = (x: Scrap) => x.kind === "file" && (x.mime_type === "text/html" || ["html", "htm"].includes(ext(x.file_name)));
const isText = (x: Scrap) => x.kind === "file" && ((x.mime_type ?? "").startsWith("text/") || ["md", "txt", "csv", "json", "ts", "tsx", "js", "sql", "css", "yml", "yaml"].includes(ext(x.file_name))) && !isHtml(x);
const groupOf = (x: Scrap): Filter => (x.kind === "link" ? "link" : isImage(x) ? "image" : isHtml(x) ? "web" : isPdf(x) || isText(x) ? "doc" : "etc");
const fmtSize = (n: number | null) => (n == null ? "" : n < 1024 ? `${n}B` : n < 1048576 ? `${(n / 1024).toFixed(0)}KB` : `${(n / 1048576).toFixed(1)}MB`);
const splitTags = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
/** 저장 시각(UTC) → 내 시간대 날짜. slice(0, 10) 은 한국 오전에 하루 전으로 나온다 */
const localDay = (ts: string) => toISO(new Date(ts));
const hostOf = (u: string | null) => { try { return u ? new URL(u).host : ""; } catch { return u ?? ""; } };

export function ScrapsView() {
  const t = useTranslations("wl.scraps");
  const tc = useTranslations("wl.common");
  const scraps = useScraps();
  const [filter, setFilter] = useState<Filter>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewing, setViewing] = useState<Scrap | null>(null);
  const rows = scraps.data ?? [];
  const counts = useMemo(() => {
    const m: Record<Filter, number> = { all: rows.length, image: 0, doc: 0, web: 0, link: 0, etc: 0 };
    for (const r of rows) m[groupOf(r)] += 1;
    return m;
  }, [rows]);
  const shown = rows.filter((r) => filter === "all" || groupOf(r) === filter);
  const FILTERS: Filter[] = ["all", "image", "doc", "web", "link", "etc"];

  return (
    <div className={s.page}>
      <PageHeader title={t("title")} />
      <section className={`${s.colCard} ${s.scrapBox}`}>
        <div className={s.row}>
          <p className={s.secLab}>{t("box")} <small>{t("count", { count: rows.length })}</small></p>
          <div className={s.chips}>
            {FILTERS.filter((f) => f === "all" || counts[f] > 0).map((f) => (
              <Chip key={f} on={filter === f} count size="sm" onClick={() => setFilter(f)}>{t(`f_${f}`)}<span>{counts[f]}</span></Chip>
            ))}
          </div>
          <Button size="sm" onClick={() => setUploadOpen(true)}>{t("add")}</Button>
        </div>
        <div className={s.scrapGrid}>
          {scraps.isLoading && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height="13rem" radius={16} />)}
          {scraps.isError && <p className={s.errorNote}>{tc("loadFailed")}</p>}
          {!scraps.isLoading && !scraps.isError && shown.length === 0 && <p className={s.empty} style={{ gridColumn: "1 / -1" }}>{t("empty")}</p>}
          {shown.map((x) => <ScrapCard key={x.id} scrap={x} onOpen={() => setViewing(x)} />)}
        </div>
        <div className={s.cfoot}><span>{t("foot1")}</span><span>{t("foot2")}</span></div>
      </section>
      <UploadScrapModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <ScrapViewModal scrap={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function ScrapCard({ scrap, onOpen }: { scrap: Scrap; onOpen: () => void }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (isImage(scrap) && scrap.storage_path) scrapSignedUrl(scrap.storage_path).then((u) => { if (alive) setThumb(u); });
    return () => { alive = false; };
  }, [scrap]);
  const label = scrap.kind === "link" ? hostOf(scrap.url) : (ext(scrap.file_name) || "file").toUpperCase();
  return (
    <button type="button" className={s.scrapCard} onClick={onOpen}>
      <span className={s.scrapThumb}>
        {/* 비공개 파일의 임시 주소라 next/image 최적화를 쓰지 않는다 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumb ? <img src={thumb} alt="" /> : scrap.kind === "link" ? <Link2 aria-hidden="true" /> : <span className={s.scrapExt}>{label}</span>}
      </span>
      <span className={s.scrapMeta}>
        <b>{scrap.title}</b>
        <small><span className={s.code}>{scrap.code}</span> {scrap.kind === "link" ? label : fmtSize(scrap.size_bytes)} · {fmtKDate(localDay(scrap.created_at))}</small>
        {scrap.tags.length > 0 && <span className={s.chips}>{scrap.tags.slice(0, 4).map((tg) => <Chip key={tg} static size="sm">{tg}</Chip>)}</span>}
      </span>
    </button>
  );
}

/* ── 올리기: 파일(여러 개, 끌어다 놓기) | 링크 ── */
function UploadScrapModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("wl.scraps");
  const tc = useTranslations("wl.common");
  const toast = useToast();
  const upload = useUploadScrapFile();
  const addLink = useAddScrapLink();
  const [mode, setMode] = useState<"file" | "link">("file");
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const reset = () => { setMode("file"); setFiles([]); setUrl(""); setTitle(""); setNote(""); setTags(""); };
  const close = () => { if (!busy) { reset(); onClose(); } };
  const pick = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    const big = arr.filter((f) => f.size > SCRAP_MAX_BYTES);
    if (big.length) toast({ title: t("tooBig", { names: big.map((f) => f.name).join(", ") }), variant: "destructive" });
    setFiles((prev) => [...prev, ...arr.filter((f) => f.size <= SCRAP_MAX_BYTES)]);
  };
  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "link") {
        await addLink.mutateAsync({ url: url.trim(), title: title.trim(), note, tags: splitTags(tags) });
      } else {
        let ok = 0;
        for (const f of files) {
          try { await upload.mutateAsync({ file: f, title: files.length === 1 ? title.trim() : "", note, tags: splitTags(tags) }); ok += 1; }
          catch (e) { toast({ title: t("uploadFailed", { name: f.name }), description: (e as Error).message, variant: "destructive" }); }
        }
        if (!ok) { setBusy(false); return; }
      }
      toast({ title: t("added"), variant: "success" });
      setBusy(false);
      reset();
      onClose();
    } catch (e) {
      setBusy(false);
      toast({ title: tc("saveFailed"), description: (e as Error).message, variant: "destructive" });
    }
  };
  const ready = mode === "link" ? /^https?:\/\/\S+$/.test(url.trim()) : files.length > 0;
  return (
    <Modal
      open={open}
      title={t("add")}
      onClose={close}
      size="lg"
      footer={<>
        <Button variant="secondary" onClick={close} disabled={busy}>{tc("cancel")}</Button>
        <Button onClick={submit} disabled={!ready} loading={busy}>{mode === "file" && files.length > 1 ? t("uploadN", { count: files.length }) : t("save")}</Button>
      </>}
    >
      <div className={s.formFill}>
        <Segmented ariaLabel={t("mode")} size="sm" value={mode} onChange={setMode} options={[{ value: "file", label: t("modeFile") }, { value: "link", label: t("modeLink") }]} />
        {mode === "file" ? (
          <>
            <label
              className={`${s.dropzone} ${over ? s.dropzoneOver : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
            >
              <Upload aria-hidden="true" />
              <p>{t("dropTitle")}</p>
              <small>{t("dropHint")}</small>
              <input type="file" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
            </label>
            {files.length > 0 && (
              <ul className={s.reviewList}>
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    <FileText size={14} aria-hidden="true" />
                    <span>{f.name}</span>
                    <span>{fmtSize(f.size)} · <button type="button" className={s.linkLike} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>{t("remove")}</button></span>
                  </li>
                ))}
              </ul>
            )}
            {files.length <= 1 && <Field label={t("fieldTitle")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("phTitleFile")} />}
          </>
        ) : (
          <>
            <Field label={t("fieldUrl")} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
            <Field label={t("fieldTitle")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("phTitleLink")} />
          </>
        )}
        <Textarea label={t("fieldNote")} value={note} onChange={(e) => setNote(e.target.value)} rows={3} hint={t("noteHint")} />
        <Field label={t("fieldTags")} value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("phTags")} />
      </div>
    </Modal>
  );
}

/* ── 보기: 왼쪽 미리보기 · 오른쪽 정보 폼 ── */
function ScrapViewModal({ scrap, onClose }: { scrap: Scrap | null; onClose: () => void }) {
  const t = useTranslations("wl.scraps");
  const tc = useTranslations("wl.common");
  const toast = useToast();
  const update = useUpdateScrap();
  const del = useDeleteScrap();
  const [src, setSrc] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [url, setUrl] = useState("");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setSrc(null); setHtml(null); setText(null);
    if (!scrap) return;
    setTitle(scrap.title); setNote(scrap.note ?? ""); setTags(scrap.tags.join(", ")); setUrl(scrap.url ?? "");
    let alive = true;
    if (scrap.kind === "file" && scrap.storage_path) {
      scrapSignedUrl(scrap.storage_path).then(async (u) => {
        if (!alive || !u) return;
        setSrc(u);
        if (isHtml(scrap) || isText(scrap)) {
          const body = await fetch(u).then((r) => r.text()).catch(() => null);
          if (!alive) return;
          if (isHtml(scrap)) setHtml(body); else setText(body);
        }
      });
    }
    return () => { alive = false; };
  }, [scrap]);

  const save = async () => {
    if (!scrap) return;
    try {
      await update.mutateAsync({ scrap, title: title.trim(), note, tags: splitTags(tags), url: scrap.kind === "link" ? url.trim() : undefined });
      toast({ title: t("saved"), variant: "success" });
      onClose();
    } catch (e) {
      toast({ title: tc("saveFailed"), description: (e as Error).message, variant: "destructive" });
    }
  };
  const remove = async () => {
    if (!scrap) return;
    try { await del.mutateAsync(scrap.id); toast({ title: tc("deleted"), variant: "success" }); setConfirm(false); onClose(); }
    catch { toast({ title: tc("deleteFailed"), variant: "destructive" }); }
  };
  const download = async () => {
    if (!scrap?.storage_path) return;
    const u = await scrapSignedUrl(scrap.storage_path, scrap.file_name ?? "file");
    if (u) window.location.assign(u);
  };

  return (
    <Modal
      open={!!scrap}
      title={scrap?.title ?? ""}
      onClose={onClose}
      size="wide"
      titleAside={scrap ? <span className={s.code}>{scrap.code}</span> : undefined}
      footer={<>
        <Button variant="danger" className={s.footerLeft} onClick={() => setConfirm(true)}>{tc("delete")}</Button>
        {scrap?.kind === "link"
          ? <Button variant="secondary" href={scrap.url ?? "#"} target="_blank" rel="noopener noreferrer">{t("openLink")}</Button>
          : <Button variant="secondary" onClick={download}>{t("download")}</Button>}
        {scrap && src && (isHtml(scrap) || isPdf(scrap) || isImage(scrap)) && <Button variant="secondary" href={src} target="_blank" rel="noopener noreferrer">{t("openNew")}</Button>}
        <Button variant="secondary" onClick={onClose}>{tc("close")}</Button>
        <Button onClick={save} disabled={!title.trim()} loading={update.isPending}>{tc("save")}</Button>
      </>}
    >
      {scrap && (
        <div className={s.scrapView}>
          <div className={s.scrapPreview}>
            {scrap.kind === "link" ? (
              <div className={s.scrapNoPreview}><Link2 aria-hidden="true" /><p>{scrap.url}</p></div>
            ) : !src ? (
              <Skeleton height="100%" radius={12} />
            ) : isImage(scrap) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={scrap.title} />
            ) : isPdf(scrap) ? (
              <iframe src={src} title={scrap.title} />
            ) : isHtml(scrap) ? (
              html == null ? <Skeleton height="100%" radius={12} /> : <iframe srcDoc={html} title={scrap.title} sandbox="allow-scripts allow-popups allow-forms" />
            ) : isText(scrap) ? (
              <pre className={s.rawMd} style={{ maxHeight: "none", height: "100%" }}>{text ?? ""}</pre>
            ) : (
              <div className={s.scrapNoPreview}><FileText aria-hidden="true" /><p>{t("noPreview", { ext: (ext(scrap.file_name) || "file").toUpperCase() })}</p></div>
            )}
          </div>
          <div className={s.form}>
            <Field label={t("fieldTitle")} value={title} onChange={(e) => setTitle(e.target.value)} />
            {scrap.kind === "link" && <Field label={t("fieldUrl")} value={url} onChange={(e) => setUrl(e.target.value)} />}
            <Textarea label={t("fieldNote")} value={note} onChange={(e) => setNote(e.target.value)} rows={6} hint={t("noteHint")} />
            <Field label={t("fieldTags")} value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("phTags")} />
            <p className={s.hint}>
              {scrap.kind === "file" ? `${scrap.file_name} · ${fmtSize(scrap.size_bytes)} · ${scrap.mime_type}` : hostOf(scrap.url)}
              <br />{t("addedAt", { date: fmtKDate(localDay(scrap.created_at)) })}
            </p>
          </div>
        </div>
      )}
      <Modal
        open={confirm}
        title={t("deleteTitle")}
        onClose={() => setConfirm(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirm(false)}>{tc("cancel")}</Button>
          <Button variant="danger" onClick={remove} loading={del.isPending}>{tc("delete")}</Button>
        </>}
      >
        <p className={s.hint}>{t("deleteBody", { code: scrap?.code ?? "" })}</p>
      </Modal>
    </Modal>
  );
}
