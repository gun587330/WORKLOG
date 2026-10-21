/**
 * 작업 기록 파서 — 「작업 기록용 프롬프트」(supabase/seed/prompts/work-log.md) 가 만든 md 한 장을 구조로 바꾼다.
 * anserx-code web/src/lib/work-log.ts 에서 옮김 · 바뀐 점(docs/VOCAB.md):
 *   · `카테고리:` → `프로젝트: P-<SLUG>`(필수) · `목표: G<n>`(선택)
 *   · 새 섹션 `## 목표 진행` ("- [x] G12-3" = 완료 보고)
 *   · 본문 [[코드]] 링크 추출, 머리말 kind: log
 * 코드의 존재 여부는 파서가 모른다 — 검수 화면이 컨텍스트(프로젝트 · 목표 · 계획 항목 목록)와 대조한다.
 * 순수 함수, DOM 없음. 업로드 검수와 상세 렌더가 같은 함수를 쓴다.
 */

export type WorkStatus = "완료" | "진행 중" | "보류" | "";

export type WorkItem = {
  seq: number;
  time: string;
  hourEnd: number | null;
  title: string;
  projectSlug: string;      // 'ANSERX' (P- 뗀 것). 비어 있으면 문제
  goalCode: string | null;  // 'G12'
  tags: string[];
  status: WorkStatus;
  body: string;
};
export type WorkHour = { hour: number; value: number; label: string };
export type WorkRange = { start: number; end: number; hours: number; label: string };
export type WorkTodo = { seq: number; text: string; needsDecision: boolean; done: boolean; planItemCode: string | null };
export type CodeLink = { toType: "project" | "goal" | "plan" | "plan_item" | "log" | "diary" | "scrap"; toCode: string; kind: "ref" | "wikilink"; context: string };

export type ParsedWorkLog = {
  meta: { kind: string; date: string; author: string; role: string; summary: string };
  items: WorkItem[];
  hours: WorkHour[];
  ranges: WorkRange[];
  hoursTotal: number;
  todos: WorkTodo[];
  completions: string[];          // ## 목표 진행 의 [x] 코드
  touched: string[];              // ## 목표 진행 의 [ ] 코드
  links: CodeLink[];
  sources: string | null;
  projectSlugs: string[];
  doneCount: number;
  problems: string[];
};

const SPECIAL = new Set(["시간대별 작업량", "목표 진행", "앞으로 할 일", "기록 출처"]);
const TIME_HEAD = /^(~?\d{1,2}:\d{2}(?:~\d{1,2}:\d{2})?)\s+(.*)$/;
export const RE_PROJECT = /^P-([A-Z0-9][A-Z0-9-]{0,30})$/;
export const RE_GOAL = /^G\d+$/;
export const RE_PLAN_ITEM = /^G\d+-\d+$/;
export const RE_LOG = /^L-\d{4}-\d{2}-\d{2}(?:-\d+)?$/;
export const RE_PLAN = /^PL-\d{4}-(?:W\d{2}|\d{2})$/;
export const RE_DIARY = /^D-\d{4}-\d{2}-\d{2}(?:-\d+)?$/;
export const RE_SCRAP = /^S-\d+$/;

/** 붙여넣기 · 파일에서 섞여 오는 것을 벗긴다: 코드블록 울타리, 머리말 앞 잡문, 굵은 메타, 전각 콜론, "##제목" */
export function normalizeWorkLogSource(raw: string): string {
  let src = raw.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const fences = [...src.matchAll(/```[a-zA-Z]*[ \t]*\n([\s\S]*?)\n[ \t]*```/g)].map((m) => m[1]);
  if (fences.length) src = fences.reduce((a, b) => (b.length > a.length ? b : a), "");
  const fm = src.search(/^---[ \t]*$/m);
  if (fm > 0) src = src.slice(fm);
  src = src.replace(/^\*{0,2}[ \t]*(프로젝트|카테고리|목표|태그|상태)[ \t]*\*{0,2}[ \t]*[:：][ \t]*\*{0,2}[ \t]*/gm, "$1: ");
  src = src.replace(/^##(?=[^#\s])/gm, "## ");
  return src.trim() + "\n";
}

export function codeType(code: string): CodeLink["toType"] | null {
  if (RE_PROJECT.test(code)) return "project";
  if (RE_PLAN_ITEM.test(code)) return "plan_item";
  if (RE_GOAL.test(code)) return "goal";
  if (RE_PLAN.test(code)) return "plan";
  if (RE_LOG.test(code)) return "log";
  if (RE_DIARY.test(code)) return "diary";
  if (RE_SCRAP.test(code)) return "scrap";
  return null;
}

/** 본문의 [[코드]] 를 링크로 뽑는다 (모르는 모양은 무시) */
export function extractWikiLinks(md: string): CodeLink[] {
  const out: CodeLink[] = [];
  for (const line of md.split("\n")) {
    for (const m of line.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const code = m[1].trim().toUpperCase();
      const t = codeType(code);
      if (t) out.push({ toType: t, toCode: code, kind: "wikilink", context: line.trim().slice(0, 200) });
    }
  }
  return out;
}

export function parseWorkLog(md: string): ParsedWorkLog {
  const problems: string[] = [];
  const src = normalizeWorkLogSource(md);

  // 1) 머리말
  const meta = { kind: "", date: "", author: "", role: "", summary: "" };
  let body = src;
  const fm = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    body = src.slice(fm[0].length);
    for (const line of fm[1].split("\n")) {
      const i = line.search(/[:：]/);
      if (i <= 0) continue;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (k in meta) (meta as Record<string, string>)[k] = v;
    }
  } else {
    problems.push("머리말(---)이 없어요. 프롬프트의 [A. 머리말] 형식대로 날짜 · 이름 · 역할 · 요약이 있어야 해요.");
  }
  if (meta.kind && meta.kind !== "log") problems.push(`kind 가 "${meta.kind}" 예요. 작업 기록은 kind: log 여야 해요. 계획 문서라면 계획 올리기로 올려 주세요.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) problems.push("date 가 YYYY-MM-DD 형식이 아니에요.");
  if (!meta.author) problems.push("author(실명)가 비어 있어요.");

  // 2) ## 섹션
  const sections = body.split(/^##(?!#)[ \t]*/m).slice(1).map((p) => {
    const nl = p.indexOf("\n");
    return { head: (nl < 0 ? p : p.slice(0, nl)).trim(), rest: nl < 0 ? "" : p.slice(nl + 1) };
  });
  const special: Record<string, string> = {};
  const items: WorkItem[] = [];
  for (const sec of sections) {
    if (SPECIAL.has(sec.head)) { special[sec.head] = sec.rest.trim(); continue; }
    const m = sec.head.match(TIME_HEAD);
    const item: WorkItem = {
      seq: items.length + 1, time: m ? m[1] : "", hourEnd: m ? hourOf(m[1]) : null,
      title: m ? m[2].trim() : sec.head, projectSlug: "", goalCode: null, tags: [], status: "", body: "",
    };
    item.body = sec.rest.replace(/^(프로젝트|카테고리|목표|태그|상태)\s*:\s*(.*)$/gm, (_, k: string, v: string) => {
      const val = v.trim();
      if (k === "프로젝트" || k === "카테고리") {
        const pm = val.toUpperCase().match(RE_PROJECT);
        if (pm) item.projectSlug = pm[1];
        else problems.push(`「${item.title}」의 프로젝트 "${val}" 가 P-코드 모양이 아니에요. 컨텍스트 팩의 P-코드를 써 주세요.`);
      }
      if (k === "목표") {
        const g = val.toUpperCase();
        if (!g || g === "-" || g === "없음") item.goalCode = null;
        else if (RE_GOAL.test(g)) item.goalCode = g;
        else problems.push(`「${item.title}」의 목표 "${val}" 가 G-코드 모양이 아니에요.`);
      }
      if (k === "태그") item.tags = val.split(",").map((s) => s.trim()).filter(Boolean);
      if (k === "상태") item.status = normalizeStatus(val);
      return "";
    }).trim();
    if (!item.projectSlug) problems.push(`「${item.title}」에 프로젝트(P-코드)가 없어요.`);
    items.push(item);
  }
  if (items.length === 0) problems.push("작업 섹션(## 시각 제목)이 하나도 없어요.");
  if (!fm && items.length === 0)
    problems.unshift("AI 화면에 보이는 글을 그대로 복사한 것 같아요. 파일로 받거나 코드블록의 복사 버튼으로 원문(--- 와 ## 가 보이는 글)을 가져와 주세요.");

  // 3) 시간표
  const hours: WorkHour[] = Array.from({ length: 24 }, (_, h) => ({ hour: h, value: 0, label: "" }));
  if (special["시간대별 작업량"]) {
    for (const line of special["시간대별 작업량"].split("\n")) {
      if (!line.trim().startsWith("|")) continue;
      const c = line.split("|").slice(1, -1).map((x) => x.trim());
      const h = parseInt(c[0] ?? "", 10);
      const v = parseFloat(c[1] ?? "");
      if (Number.isNaN(h) || h < 0 || h > 23 || Number.isNaN(v)) continue;
      const snapped = [0, 0.25, 0.5, 0.75, 1].reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
      if (Math.abs(snapped - v) > 0.001) problems.push(`${pad2(h)}시 투입 ${v} 는 0.25 단위가 아니에요(${snapped} 로 읽었어요).`);
      hours[h] = { hour: h, value: snapped, label: c[2] ?? "" };
    }
  } else problems.push("「## 시간대별 작업량」 표가 없어요.");
  const hoursTotal = round2(hours.reduce((a, x) => a + x.value, 0));
  const ranges: WorkRange[] = [];
  for (const x of hours) {
    if (!x.value) continue;
    const last = ranges[ranges.length - 1];
    if (last && last.label === x.label && last.end === x.hour) { last.end = x.hour + 1; last.hours = round2(last.hours + x.value); }
    else ranges.push({ start: x.hour, end: x.hour + 1, hours: x.value, label: x.label });
  }

  // 4) 목표 진행 · 앞으로 할 일
  const completions: string[] = [], touched: string[] = [];
  if (special["목표 진행"]) {
    for (const line of special["목표 진행"].split("\n")) {
      const m = line.match(/^-\s*\[( |x|X)\]\s*([A-Za-z0-9-]+)/);
      if (!m) continue;
      const code = m[2].toUpperCase();
      if (!RE_PLAN_ITEM.test(code)) { problems.push(`목표 진행의 "${m[2]}" 는 계획 항목 코드(G12-3) 모양이 아니에요.`); continue; }
      (m[1] === " " ? touched : completions).push(code);
    }
  }
  const todos: WorkTodo[] = [];
  if (special["앞으로 할 일"]) {
    for (const line of special["앞으로 할 일"].split("\n")) {
      const m = line.match(/^-\s*\[( |x|X)\]\s*(.*)$/);
      if (!m) continue;
      let text = m[2].trim();
      const needsDecision = /^판단 필요\s*:/.test(text) || /^대표 판단 필요\s*:/.test(text);
      text = text.replace(/^(대표 )?판단 필요\s*:\s*/, "");
      const cm = text.match(/^(G\d+-\d+)\s+(.*)$/i);
      const planItemCode = cm ? cm[1].toUpperCase() : null;
      if (cm) text = cm[2];
      todos.push({ seq: todos.length + 1, text, needsDecision, done: m[1] !== " ", planItemCode });
    }
  }

  // 5) 링크: 메타 참조 + 본문 [[코드]]
  const links: CodeLink[] = [];
  for (const it of items) {
    if (it.projectSlug) links.push({ toType: "project", toCode: `P-${it.projectSlug}`, kind: "ref", context: it.title });
    if (it.goalCode) links.push({ toType: "goal", toCode: it.goalCode, kind: "ref", context: it.title });
    links.push(...extractWikiLinks(it.body));
  }
  for (const c of completions) links.push({ toType: "plan_item", toCode: c, kind: "ref", context: "목표 진행" });

  const projectSlugs = [...new Set(items.map((i) => i.projectSlug).filter(Boolean))];
  const doneCount = items.filter((i) => i.status === "완료").length;
  return { meta, items, hours, ranges, hoursTotal, todos, completions, touched, links, sources: special["기록 출처"] ?? null, projectSlugs, doneCount, problems };
}

function normalizeStatus(v: string): WorkStatus {
  const s = v.trim();
  if (s === "완료") return "완료";
  if (s === "진행 중" || s === "진행중") return "진행 중";
  if (s === "보류") return "보류";
  return "";
}
export function hourOf(time: string): number | null {
  const m = time.match(/(\d{1,2}):\d{2}\s*$/);
  return m ? Math.min(23, Math.max(0, +m[1])) : null;
}
const round2 = (n: number) => Math.round(n * 100) / 100;
export function formatHours(h: number): string {
  const r = round2(h);
  return `${Number.isInteger(r) ? r : r.toFixed(2).replace(/0+$/, "")}시간`;
}
export const pad2 = (n: number) => String(n).padStart(2, "0");

export type MdChunk = { kind: "md"; md: string } | { kind: "toggle"; title: string; md: string };
export function splitToggles(md: string): MdChunk[] {
  const chunks: MdChunk[] = [];
  const re = /^:::[ \t]+(.+)\n([\s\S]*?)\n:::[ \t]*$/gm;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const before = md.slice(last, m.index).trim();
    if (before) chunks.push({ kind: "md", md: before });
    chunks.push({ kind: "toggle", title: m[1].trim(), md: m[2].trim() });
    last = m.index + m[0].length;
  }
  const tail = md.slice(last).trim();
  if (tail) chunks.push({ kind: "md", md: tail });
  return chunks;
}
