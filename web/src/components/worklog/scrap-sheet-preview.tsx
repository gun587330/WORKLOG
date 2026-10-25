"use client";

/**
 * 스크랩 보기 모달의 엑셀(.xlsx · .xlsm) 미리보기 (명세: app/[locale]/(app)/scraps/scraps-SPEC.md §2).
 * 읽기 전용. 서명 주소에서 파일을 받아 브라우저에서 exceljs 로 읽는다(서버로 보내지 않는다).
 * exceljs 는 무거워서 이 컴포넌트가 처음 그려질 때만 불러온다(dynamic import).
 * 위 = 시트 칩(시트가 둘 이상일 때), 아래 = 표(열 글자 · 행 번호 고정, 값은 계산된 결과 우선, 없으면 수식).
 * 한 시트에 MAX_ROWS × MAX_COLS 까지만 그리고, 넘으면 안내 한 줄.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";
import s from "./worklog.module.css";

const MAX_ROWS = 500;
const MAX_COLS = 40;

type Sheet = { name: string; rows: string[][]; rowCount: number; colCount: number };

const colName = (n: number) => {
  let x = n, out = "";
  while (x > 0) { const r = (x - 1) % 26; out = String.fromCharCode(65 + r) + out; x = Math.floor((x - 1) / 26); }
  return out;
};

const pad = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) => {
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return d.getHours() || d.getMinutes() ? `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
};
const fmtNum = (n: number) => (Number.isInteger(n) ? n.toLocaleString("ko-KR") : n.toLocaleString("ko-KR", { maximumFractionDigits: 4 }));

/** exceljs 셀 값 → 표시 문자열. 수식은 저장된 결과가 있으면 결과, 없으면 "=수식" */
function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return fmtNum(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return fmtDate(v);
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((r) => r.text ?? "").join("");
    if ("formula" in o || "sharedFormula" in o) {
      if (o.result !== undefined && o.result !== null && typeof o.result !== "object") return cellText(o.result);
      if (o.result && typeof o.result === "object" && "error" in (o.result as object)) return String((o.result as { error: string }).error);
      return `=${String(o.formula ?? o.sharedFormula ?? "")}`;
    }
    if ("text" in o) return cellText(o.text);
    if ("error" in o) return String(o.error);
  }
  return String(v);
}

async function readWorkbook(url: string): Promise<Sheet[]> {
  const buf = await fetch(url).then((r) => { if (!r.ok) throw new Error("fetch"); return r.arrayBuffer(); });
  const mod = await import("exceljs");
  const ExcelJS = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets
    .filter((ws) => ws.state !== "veryHidden")
    .map((ws) => {
      const rowCount = ws.actualRowCount ? ws.rowCount : 0;
      const colCount = ws.actualColumnCount ? ws.columnCount : 0;
      const nr = Math.min(rowCount, MAX_ROWS), nc = Math.min(colCount, MAX_COLS);
      const rows: string[][] = [];
      for (let r = 1; r <= nr; r++) {
        const row = ws.getRow(r);
        const line: string[] = [];
        for (let c = 1; c <= nc; c++) {
          const cell = row.getCell(c);
          // 병합 셀은 첫 칸에만 값을 둔다(나머지 칸이 같은 값을 반복하지 않게)
          line.push(cell.isMerged && cell.master !== cell ? "" : cellText(cell.value));
        }
        rows.push(line);
      }
      // 뒤쪽의 완전히 빈 행은 잘라 낸다(서식만 있는 행)
      while (rows.length && rows[rows.length - 1].every((x) => x === "")) rows.pop();
      return { name: ws.name, rows, rowCount, colCount };
    });
}

export function ScrapSheetPreview({ src, ext }: { src: string; ext: string }) {
  const t = useTranslations("wl.scraps");
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    setSheets(null); setFailed(false); setIdx(0);
    readWorkbook(src).then((x) => { if (alive) setSheets(x); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [src]);

  const sheet = sheets?.[idx];
  const width = useMemo(() => (sheet ? Math.max(1, ...sheet.rows.map((r) => r.length)) : 0), [sheet]);

  if (failed) {
    return <div className={s.scrapNoPreview}><FileText aria-hidden="true" /><p>{t("sheetFailed", { ext: ext.toUpperCase() })}</p></div>;
  }
  if (!sheets) return <Skeleton height="100%" radius={12} />;
  if (!sheets.length || !sheet) {
    return <div className={s.scrapNoPreview}><FileText aria-hidden="true" /><p>{t("sheetEmpty")}</p></div>;
  }

  const cut = sheet.rowCount > MAX_ROWS || sheet.colCount > MAX_COLS;
  return (
    <div className={s.sheetPreview}>
      {sheets.length > 1 && (
        <ChipGroup className={s.sheetTabs} role="tablist" aria-label={t("sheets")}>
          {sheets.map((x, i) => (
            <Chip key={x.name + i} size="sm" on={i === idx} role="tab" aria-selected={i === idx} onClick={() => setIdx(i)}>{x.name}</Chip>
          ))}
        </ChipGroup>
      )}
      <div className={s.sheetGrid}>
        {sheet.rows.length === 0 ? (
          <p className={s.hint}>{t("sheetEmpty")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th aria-hidden="true" />
                {Array.from({ length: width }, (_, c) => <th key={c} scope="col">{colName(c + 1)}</th>)}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((r, ri) => (
                <tr key={ri}>
                  <th scope="row">{ri + 1}</th>
                  {Array.from({ length: width }, (_, c) => <td key={c}>{r[c] ?? ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {cut && <p className={s.sheetCut}>{t("sheetCut", { rows: Math.min(sheet.rowCount, MAX_ROWS), cols: Math.min(sheet.colCount, MAX_COLS), totalRows: sheet.rowCount, totalCols: sheet.colCount })}</p>}
    </div>
  );
}
