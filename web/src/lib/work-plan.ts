/**
 * 작업 계획 파서 — 「작업 계획용 프롬프트」(supabase/seed/prompts/work-plan.md) 가 만든 md 를 구조로 바꾼다.
 * 양식(docs/VOCAB.md §3 계획): 머리말(kind: plan · period · title · author · summary) ·
 *   `## 목표`(G 코드 + 제목 | [신규] 제목 (P-코드)) · `## 할 일`(- [ ] <G코드|[신규]제목> 제목 (MM-DD)) · `## 판단 필요` · `## 기록 출처`.
 * 코드 존재 여부는 검수 화면이 컨텍스트와 대조한다.
 */
import { normalizeWorkLogSource, extractWikiLinks, RE_GOAL, RE_PROJECT, type CodeLink } from "./work-log";

export type PlanGoal = { ref: string; title: string; projectSlug: string | null; isNew: boolean };
export type PlanItem = { goalRef: string; title: string; dueDate: string | null };
export type ParsedWorkPlan = {
  meta: { kind: string; title: string; author: string; summary: string; periodStart: string; periodEnd: string };
  code: string;                 // PL-2026-W43 · PL-2026-10
  goals: PlanGoal[];
  items: PlanItem[];
  decisions: string[];
  links: CodeLink[];
  sources: string | null;
  problems: string[];
};

export function parseWorkPlan(md: string): ParsedWorkPlan {
  const problems: string[] = [];
  const src = normalizeWorkLogSource(md);
  const meta = { kind: "", title: "", author: "", summary: "", periodStart: "", periodEnd: "" };
  let body = src;
  const fm = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    body = src.slice(fm[0].length);
    for (const line of fm[1].split("\n")) {
      const i = line.search(/[:：]/);
      if (i <= 0) continue;
      const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim();
      if (k === "period") {
        const pm = v.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
        if (pm) { meta.periodStart = pm[1]; meta.periodEnd = pm[2]; }
        else problems.push(`period "${v}" 가 "YYYY-MM-DD ~ YYYY-MM-DD" 형식이 아니에요.`);
      } else if (k in meta) (meta as Record<string, string>)[k] = v;
    }
  } else problems.push("머리말(---)이 없어요. kind: plan · period · title 이 있어야 해요.");
  if (meta.kind && meta.kind !== "plan") problems.push(`kind 가 "${meta.kind}" 예요. 계획 문서는 kind: plan 이어야 해요.`);
  if (!meta.periodStart) problems.push("period(기간)가 없어요.");
  if (!meta.title) problems.push("title(제목)이 없어요.");

  const sections = body.split(/^##(?!#)[ \t]*/m).slice(1).map((p) => {
    const nl = p.indexOf("\n");
    return { head: (nl < 0 ? p : p.slice(0, nl)).trim(), rest: nl < 0 ? "" : p.slice(nl + 1).trim() };
  });
  const sec = (name: string) => sections.find((s) => s.head === name)?.rest ?? "";

  // 목표
  const goals: PlanGoal[] = [];
  let newSeq = 0;
  for (const line of sec("목표").split("\n")) {
    const m = line.match(/^-\s*(.+)$/);
    if (!m) continue;
    const t = m[1].trim();
    const nm = t.match(/^\[신규\]\s*(.+?)\s*\((P-[A-Z0-9-]+)\)\s*$/i);
    if (nm) {
      const pm = nm[2].toUpperCase().match(RE_PROJECT);
      newSeq += 1;
      goals.push({ ref: `N${newSeq}`, title: nm[1].trim(), projectSlug: pm ? pm[1] : null, isNew: true });
      if (!pm) problems.push(`[신규] 목표 "${nm[1]}" 의 프로젝트 코드가 잘못됐어요.`);
      continue;
    }
    if (/^\[신규\]/i.test(t)) { problems.push(`[신규] 목표 "${t}" 에 (P-코드) 가 없어요.`); continue; }
    const gm = t.match(/^(G\d+)\s*(.*)$/i);
    if (gm) goals.push({ ref: gm[1].toUpperCase(), title: gm[2].trim(), projectSlug: null, isNew: false });
    else problems.push(`목표 "${t}" 는 G-코드로 시작하거나 [신규] 여야 해요.`);
  }
  if (goals.length === 0) problems.push("「## 목표」 가 비어 있어요.");

  // 할 일
  const items: PlanItem[] = [];
  const newByTitle = new Map(goals.filter((g) => g.isNew).map((g) => [g.title.replace(/\s+/g, ""), g.ref]));
  for (const line of sec("할 일").split("\n")) {
    const m = line.match(/^-\s*\[( |x|X)\]\s*(.*)$/);
    if (!m) continue;
    let t = m[2].trim();
    let goalRef: string | null = null;
    const gm = t.match(/^(G\d+)\s+(.*)$/i);
    if (gm) { goalRef = gm[1].toUpperCase(); t = gm[2]; }
    else {
      const nm = t.match(/^\[신규\]\s*(\S+)\s+(.*)$/i);
      if (nm) {
        const ref = newByTitle.get(nm[1].replace(/\s+/g, ""));
        if (ref) { goalRef = ref; t = nm[2]; }
        else problems.push(`할 일 "${t}" 가 가리키는 [신규] 목표 "${nm[1]}" 를 목표 목록에서 찾지 못했어요. 목표 제목을 띄어쓰기 없이 똑같이 적어 주세요.`);
      }
    }
    if (!goalRef) { if (!/^\[신규\]/i.test(t)) problems.push(`할 일 "${t}" 가 목표 코드(G12) 또는 [신규]목표제목 으로 시작하지 않아요.`); continue; }
    let dueDate: string | null = null;
    const dm = t.match(/\((\d{1,2})-(\d{1,2})\)\s*$/);
    if (dm && meta.periodStart) {
      const y = meta.periodStart.slice(0, 4);
      dueDate = `${y}-${dm[1].padStart(2, "0")}-${dm[2].padStart(2, "0")}`;
      t = t.replace(/\s*\(\d{1,2}-\d{1,2}\)\s*$/, "");
    }
    if (!RE_GOAL.test(goalRef) && !/^N\d+$/.test(goalRef)) problems.push(`할 일 "${t}" 의 목표 참조 "${goalRef}" 가 이상해요.`);
    items.push({ goalRef, title: t.trim(), dueDate });
  }
  if (items.length === 0) problems.push("「## 할 일」 이 비어 있어요.");

  const decisions = sec("판단 필요").split("\n").map((l) => l.replace(/^-\s*/, "").trim()).filter(Boolean);
  const links: CodeLink[] = [];
  for (const g of goals) if (!g.isNew) links.push({ toType: "goal", toCode: g.ref, kind: "ref", context: g.title });
  links.push(...extractWikiLinks(body));

  const code = planCode(meta.periodStart, meta.periodEnd);
  return { meta, code, goals, items, decisions, links, sources: sec("기록 출처") || null, problems };
}

/** 기간으로 계획 코드를 만든다: 7일 이하 → PL-YYYY-Www(ISO 주차), 아니면 PL-YYYY-MM */
export function planCode(start: string, end: string): string {
  if (!start) return "";
  const s = new Date(start + "T00:00:00"), e = new Date((end || start) + "T00:00:00");
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  if (days <= 7) {
    const d = new Date(Date.UTC(s.getFullYear(), s.getMonth(), s.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yStart.getTime()) / 86400000 + 1) / 7);
    return `PL-${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return `PL-${start.slice(0, 4)}-${start.slice(5, 7)}`;
}
