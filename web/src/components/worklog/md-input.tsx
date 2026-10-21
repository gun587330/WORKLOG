"use client";

/**
 * md 입력 단계 — 세그먼트[파일 올리기 | 붙여넣기] + 드롭존 또는 textarea. 기록 올리기 · 계획 올리기가 같이 쓴다.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Upload } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import s from "./worklog.module.css";

export function MdInput({ md, onChange, dropHint }: { md: string; onChange: (md: string, fileName?: string) => void; dropHint: string }) {
  const t = useTranslations("wl.upload");
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [fileName, setFileName] = useState("");
  const [over, setOver] = useState(false);
  const readFile = (f: File | undefined) => {
    if (!f) return;
    f.text().then((text) => { setFileName(f.name); onChange(text, f.name); });
  };
  return (
    <div className={s.formFill}>
      <Segmented
        ariaLabel={t("inputMode")}
        size="sm"
        value={mode}
        onChange={setMode}
        options={[{ value: "file", label: t("modeFile") }, { value: "paste", label: t("modePaste") }]}
      />
      {mode === "file" ? (
        <label
          className={`${s.dropzone} ${over ? s.dropzoneOver : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); readFile(e.dataTransfer.files[0]); }}
        >
          <Upload aria-hidden="true" />
          <p>{fileName || t("dropTitle")}</p>
          <small>{fileName ? t("dropReplace") : dropHint}</small>
          <input type="file" accept=".md,text/markdown,text/plain" hidden onChange={(e) => readFile(e.target.files?.[0])} />
        </label>
      ) : (
        <div className={s.fill}>
          <Textarea
            label={t("pasteLabel")}
            value={md}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("pastePlaceholder")}
            hint={t("pasteHint")}
            className={s.monoBody}
          />
        </div>
      )}
    </div>
  );
}
