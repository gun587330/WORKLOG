/**
 * MCP 도구 정의 + 실행 — 클로드에게 보여 주는 "메뉴판" 과 각 줄이 불렸을 때 하는 일.
 *
 * 읽기 도구는 DB 함수 mcp_read 하나로, 쓰기 도구는 mcp_prepare(preview) → mcp_commit(commit) 두 단계로 간다(마이그레이션 0012).
 * 이 파일은 md 파싱 · 코드 대조 · 사용자에게 물을 질문 만들기까지 하고, "저장해도 되는가" 의 최종 판정은 DB 가 한다.
 * 규칙 원문: docs/VOCAB.md §7 (describe 가 그대로 돌려준다). 도구 설명문은 그 요약이다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { parseWorkLog } from "@/lib/work-log";
import { parseWorkPlan } from "@/lib/work-plan";
import { VOCAB_MD } from "./vocab.generated";

export type Ctx = { sb: SupabaseClient<Database>; token: string };
export class ToolError extends Error {}

type Args = Record<string, unknown>;
type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  write?: boolean;
  run: (args: Args, ctx: Ctx) => Promise<unknown>;
};

/* ── DB 호출 ── */
async function read<T = unknown>(ctx: Ctx, tool: string, args: Args = {}): Promise<T> {
  const { data, error } = await ctx.sb.rpc("mcp_read", { p_token: ctx.token, p_tool: tool, p_args: args as Json });
  if (error) throw new ToolError(error.message);
  return data as T;
}
async function prepare(ctx: Ctx, tool: string, payload: unknown): Promise<Record<string, unknown>> {
  const { data, error } = await ctx.sb.rpc("mcp_prepare", { p_token: ctx.token, p_tool: tool, p_payload: payload as Json });
  if (error) throw new ToolError(error.message);
  return data as Record<string, unknown>;
}
async function commit(ctx: Ctx, tool: string, args: Args, confirmations: unknown): Promise<unknown> {
  const code = str(args.confirm_code);
  const answer = str(args.user_confirmation);
  if (!code) throw new ToolError("commit 에는 preview 가 준 confirm_code 가 필요합니다. mode=preview 부터 해 주세요.");
  if (!answer) throw new ToolError("commit 에는 사용자 승인 답변 원문(user_confirmation)이 필요합니다. 사용자에게 preview 를 보여 주고 승인을 받아 주세요.");
  const { data, error } = await ctx.sb.rpc("mcp_commit", {
    p_token: ctx.token, p_tool: tool, p_code: code, p_user_confirmation: answer, p_confirmations: (confirmations ?? []) as Json,
  });
  if (error) throw new ToolError(error.message);
  return { status: "saved", ...(data as object) };
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const slugOf = (v: unknown) => str(v).toUpperCase().replace(/^P-/, "");
const modeOf = (args: Args) => {
  const m = str(args.mode);
  if (m !== "preview" && m !== "commit") throw new ToolError('mode 는 "preview" 또는 "commit" 이어야 합니다. 처음에는 preview 로 부르세요.');
  return m;
};
const blocked = (problems: string[], hint: string) => ({ status: "blocked", problems, next: hint });

/* ── 공통 스키마 조각 ── */
const WRITE_PROPS = {
  mode: { type: "string", enum: ["preview", "commit"], description: "preview = 저장하지 않고 확인 번호와 물을 것을 받는다. commit = 사용자 승인 뒤 저장." },
  confirm_code: { type: "string", description: "commit 때만. preview 가 준 확인 번호(15분 · 1회)." },
  user_confirmation: { type: "string", description: "commit 때만. 사용자가 승인한 답변 원문 그대로. 지어내지 않는다." },
};
const WRITE_NOTE =
  " 쓰기 도구: 반드시 mode=preview 로 먼저 부르고, 결과(특히 ask_user)를 사용자에게 그대로 보여 주고 물은 뒤, 사용자가 명시적으로 승인했을 때만 mode=commit 으로 confirm_code 와 user_confirmation(답변 원문)을 보낸다. 승인 전에는 commit 하지 않는다.";

type ProjectRow = { code: string; name: string; abbr: string; description: string | null; status: string };
type GoalRow = { code: string; title: string; project: string; status: string };
type ItemRow = { code: string; title: string; status: string; due_date: string | null; goal: string; project: string };
type TodoRow = { id: string; text: string; done: boolean; project: string | null; source: string };

/* ── 도구 ── */
export const TOOLS: Tool[] = [
  {
    name: "describe",
    description: "WORKLOG 의 데이터 어휘(개체 · 코드 · 관계)와 AI 읽기 · 쓰기 규칙 전문. 이 대화에서 WORKLOG 를 처음 다룰 때 다른 도구보다 먼저 부른다.",
    inputSchema: { type: "object", properties: {} },
    run: async () => VOCAB_MD,
  },
  {
    name: "get_context_pack",
    description: "현재 상태 요약(프로젝트 · 진행 중 목표 · 진행 중 계획의 할 일 · 최근 기록 · 미완 할 일). 코드가 맨 앞, 한 항목 한 줄. 이 목록에 없는 코드는 존재하지 않는다.",
    inputSchema: { type: "object", properties: { from: { type: "string", description: "최근 기록 시작일 YYYY-MM-DD (기본 7일 전)" }, to: { type: "string", description: "끝일 YYYY-MM-DD (기본 오늘)" } } },
    run: (a, ctx) => read(ctx, "get_context_pack", { from: str(a.from), to: str(a.to) }),
  },
  {
    name: "list_projects",
    description: "프로젝트(분류 축) 목록. 코드 P-<SLUG>. 작업 · 목표 · 할 일의 프로젝트는 여기 있는 코드만 쓴다.",
    inputSchema: { type: "object", properties: { include_archived: { type: "boolean" } } },
    run: (a, ctx) => read(ctx, "list_projects", { include_archived: a.include_archived === true }),
  },
  {
    name: "list_goals",
    description: "목표 목록(코드 G<n> · 제목 · 프로젝트 · 기간 · 상태 · 할 일 수 · 완료 수).",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ["active", "done", "paused"] } } },
    run: (a, ctx) => read(ctx, "list_goals", { status: str(a.status) }),
  },
  {
    name: "list_plans",
    description: "계획 목록(코드 PL-YYYY-Www 또는 PL-YYYY-MM · 기간 · 목표 수 · 할 일 수 · 완료 수).",
    inputSchema: { type: "object", properties: {} },
    run: (_a, ctx) => read(ctx, "list_plans"),
  },
  {
    name: "get_plan",
    description: "계획 하나의 원문과 할 일(코드 G<n>-<m> · 기한 · 상태 · 완료 보고 기록).",
    inputSchema: { type: "object", properties: { code: { type: "string", description: "예: PL-2026-W43" } }, required: ["code"] },
    run: (a, ctx) => read(ctx, "get_plan", { code: str(a.code) }),
  },
  {
    name: "list_plan_items",
    description: "계획 항목(할 일) 목록. 기록 md 의 ## 목표 진행 에 쓸 수 있는 코드는 여기 있는 것뿐이다.",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ["open", "done"] }, plan: { type: "string", description: "계획 코드로 거르기" } } },
    run: (a, ctx) => read(ctx, "list_plan_items", { status: str(a.status), plan: str(a.plan) }),
  },
  {
    name: "list_logs",
    description: "작업 기록 목록(코드 L-YYYY-MM-DD · 요약 · 작업 수 · 투입 시간 · 프로젝트). 최근순.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "P-코드로 거르기" }, from: { type: "string" }, to: { type: "string" }, limit: { type: "number" } } },
    run: (a, ctx) => read(ctx, "list_logs", { project: str(a.project), from: str(a.from), to: str(a.to), limit: typeof a.limit === "number" ? a.limit : 30 }),
  },
  {
    name: "get_log",
    description: "작업 기록 하나의 원문 md 와 구조(작업 · 시간표 · 할 일 · 완료한 계획 항목).",
    inputSchema: { type: "object", properties: { code: { type: "string", description: "예: L-2026-10-19" } }, required: ["code"] },
    run: (a, ctx) => read(ctx, "get_log", { code: str(a.code) }),
  },
  {
    name: "list_todos",
    description: "앞으로 할 일(기록에서 온 것 + 직접 추가한 것). 기본은 미완만.",
    inputSchema: { type: "object", properties: { include_done: { type: "boolean" } } },
    run: (a, ctx) => read(ctx, "list_todos", { include_done: a.include_done === true }),
  },
  {
    name: "list_ai_writes",
    description: "AI(MCP)가 저장한 변경 기록(도구 · 사용자 승인 답변 · 결과). 최근순.",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    run: (a, ctx) => read(ctx, "list_ai_writes", { limit: typeof a.limit === "number" ? a.limit : 20 }),
  },

  /* ── 쓰기 ── */
  {
    name: "upload_log",
    write: true,
    description:
      "하루 작업 기록 md(작업 기록용 프롬프트 양식)를 올린다. preview 는 파싱 결과 · 문제 · 작업마다 확인할 프로젝트를 돌려준다. commit 때 작업마다 사용자가 확인한 프로젝트를 project_confirmations 로 보낸다. 하나라도 빠지면 거절된다." + WRITE_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        ...WRITE_PROPS,
        markdown: { type: "string", description: "preview 때만. 기록 md 원문 전체(첫 줄 ---)." },
        project_confirmations: {
          type: "array", description: "commit 때만. 작업마다 사용자가 확인한 프로젝트.",
          items: { type: "object", properties: { seq: { type: "number" }, project_code: { type: "string" }, confirmed: { type: "boolean" } }, required: ["seq", "project_code", "confirmed"] },
        },
      },
      required: ["mode"],
    },
    run: async (a, ctx) => {
      if (modeOf(a) === "commit") return commit(ctx, "upload_log", a, a.project_confirmations);
      const md = typeof a.markdown === "string" ? a.markdown : "";
      if (!md.trim()) throw new ToolError("preview 에는 markdown(기록 md 원문)이 필요합니다.");
      const parsed = parseWorkLog(md);
      const [projects, goals, items] = await Promise.all([
        read<ProjectRow[]>(ctx, "list_projects", { include_archived: true }),
        read<GoalRow[]>(ctx, "list_goals"),
        read<ItemRow[]>(ctx, "list_plan_items"),
      ]);
      const pset = new Set(projects.map((p) => slugOf(p.code)));
      const gset = new Set(goals.map((g) => g.code));
      const iset = new Set(items.map((i) => i.code));
      const problems = [...parsed.problems];
      for (const s of parsed.projectSlugs) if (!pset.has(s)) problems.push(`P-${s} 는 없는 프로젝트입니다. 사용자에게 기존 프로젝트 중 어디인지 묻거나, 새로 만들지 물어 create_project 로 먼저 만드세요.`);
      for (const g of new Set(parsed.items.map((i) => i.goalCode).filter(Boolean) as string[])) if (!gset.has(g)) problems.push(`${g} 는 없는 목표입니다.`);
      for (const c of [...parsed.completions, ...parsed.touched]) if (!iset.has(c)) problems.push(`목표 진행의 ${c} 는 없는 계획 항목입니다.`);
      for (const t of parsed.todos) if (t.planItemCode && !iset.has(t.planItemCode)) problems.push(`앞으로 할 일의 ${t.planItemCode} 는 없는 계획 항목입니다.`);
      const preview = {
        date: parsed.meta.date, author: parsed.meta.author, summary: parsed.meta.summary,
        tasks: parsed.items.length, done: parsed.doneCount, hours: parsed.hoursTotal, todos: parsed.todos.length,
        completes_plan_items: parsed.completions,
        items: parsed.items.map((i) => ({ seq: i.seq, time: i.time, title: i.title, project: i.projectSlug ? `P-${i.projectSlug}` : null, goal: i.goalCode, status: i.status })),
      };
      const hard = problems.filter((p) => !/0\.25 단위가 아니에요/.test(p));
      if (hard.length) return { ...blocked(problems, "md 를 고친 뒤 preview 를 다시 부르세요."), preview };
      const payload = {
        log_date: parsed.meta.date, author_name: parsed.meta.author, summary: parsed.meta.summary, raw_md: md,
        items: parsed.items.map((i) => ({ seq: i.seq, time_text: i.time, hour_end: i.hourEnd, title: i.title, project_slug: i.projectSlug, goal_code: i.goalCode, status: i.status, tags: i.tags, body_md: i.body })),
        hours: parsed.hours.map((h) => ({ hour: h.hour, value: h.value, label: h.label })),
        todos: parsed.todos.map((t) => ({ seq: t.seq, text: t.text, needs_decision: t.needsDecision, plan_item_code: t.planItemCode })),
        completions: parsed.completions,
        links: parsed.links.map((l) => ({ to_type: l.toType, to_code: l.toCode, kind: l.kind, context: l.context })),
      };
      const prep = await prepare(ctx, "upload_log", payload);
      const pname = new Map(projects.map((p) => [slugOf(p.code), p.name]));
      return {
        status: "ready", ...prep, preview, warnings: problems,
        ask_user: [
          ...parsed.items.map((i) => `${i.seq}. ${i.time} ${i.title} → P-${i.projectSlug} (${pname.get(i.projectSlug) ?? "?"}) 맞나요?`),
          ...(parsed.completions.length ? [`완료로 처리될 계획 항목: ${parsed.completions.join(", ")}. 맞나요?`] : []),
          "이대로 저장할까요?",
        ],
        next: "사용자가 승인하면 mode=commit, confirm_code, user_confirmation(답변 원문), project_confirmations=[{seq, project_code, confirmed:true} 작업 전부] 로 부른다. 프로젝트를 바꾸라는 답이면 md 를 고쳐 preview 를 다시 한다.",
      };
    },
  },
  {
    name: "upload_plan",
    write: true,
    description:
      "주간 · 월간 계획 md(작업 계획용 프롬프트 양식)를 올린다. [신규] 목표는 새로 만들어진다. commit 때 [신규] 목표마다 사용자가 확인한 프로젝트를 new_goal_confirmations 로 보낸다." + WRITE_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        ...WRITE_PROPS,
        markdown: { type: "string", description: "preview 때만. 계획 md 원문 전체(첫 줄 ---)." },
        new_goal_confirmations: {
          type: "array", description: "commit 때만. [신규] 목표마다 사용자가 확인한 프로젝트. ref 는 preview 가 준 N1, N2 …",
          items: { type: "object", properties: { ref: { type: "string" }, project_code: { type: "string" }, confirmed: { type: "boolean" } }, required: ["ref", "project_code", "confirmed"] },
        },
      },
      required: ["mode"],
    },
    run: async (a, ctx) => {
      if (modeOf(a) === "commit") return commit(ctx, "upload_plan", a, a.new_goal_confirmations);
      const md = typeof a.markdown === "string" ? a.markdown : "";
      if (!md.trim()) throw new ToolError("preview 에는 markdown(계획 md 원문)이 필요합니다.");
      const parsed = parseWorkPlan(md);
      const [projects, goals, plans] = await Promise.all([
        read<ProjectRow[]>(ctx, "list_projects", { include_archived: true }),
        read<GoalRow[]>(ctx, "list_goals"),
        read<{ code: string }[]>(ctx, "list_plans"),
      ]);
      const pset = new Set(projects.map((p) => slugOf(p.code)));
      const gmap = new Map(goals.map((g) => [g.code, g]));
      const problems = [...parsed.problems];
      const notes: string[] = [];
      for (const g of parsed.goals) {
        if (g.isNew) {
          if (g.projectSlug && !pset.has(g.projectSlug)) problems.push(`[신규] ${g.title} 의 P-${g.projectSlug} 는 없는 프로젝트입니다.`);
          const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
          const sim = goals.filter((x) => { const p = norm(x.title), q = norm(g.title); return p === q || p.includes(q) || q.includes(p); });
          if (sim.length) notes.push(`[신규] ${g.title} 와 비슷한 기존 목표: ${sim.map((x) => `${x.code} ${x.title}`).join(", ")}. 기존 목표를 이어 쓸지 사용자에게 묻는다.`);
        } else if (!gmap.has(g.ref)) problems.push(`${g.ref} 는 없는 목표입니다.`);
      }
      if (plans.some((p) => p.code === parsed.code)) problems.push(`${parsed.code} 계획이 이미 있습니다.`);
      const preview = {
        code: parsed.code, title: parsed.meta.title, period: `${parsed.meta.periodStart} ~ ${parsed.meta.periodEnd}`, summary: parsed.meta.summary,
        goals: parsed.goals.map((g) => ({ ref: g.ref, title: g.isNew ? g.title : gmap.get(g.ref)?.title ?? g.title, is_new: g.isNew, project: g.isNew ? `P-${g.projectSlug}` : gmap.get(g.ref)?.project, items: parsed.items.filter((i) => i.goalRef === g.ref).length })),
        items: parsed.items.map((i) => ({ goal: i.goalRef, title: i.title, due: i.dueDate })),
        decisions: parsed.decisions,
      };
      if (problems.length) return { ...blocked(problems, "md 를 고친 뒤 preview 를 다시 부르세요."), preview, notes };
      const payload = {
        code: parsed.code, title: parsed.meta.title, period_start: parsed.meta.periodStart, period_end: parsed.meta.periodEnd || parsed.meta.periodStart,
        summary: parsed.meta.summary, raw_md: md,
        goals: parsed.goals.map((g) => ({ ref: g.ref, title: g.title, project_slug: g.projectSlug, is_new: g.isNew })),
        items: parsed.items.map((i) => ({ goal_ref: i.goalRef, title: i.title, due_date: i.dueDate })),
        links: parsed.links.map((l) => ({ to_type: l.toType, to_code: l.toCode, kind: l.kind, context: l.context })),
      };
      const prep = await prepare(ctx, "upload_plan", payload);
      return {
        status: "ready", ...prep, preview, notes,
        ask_user: [
          ...parsed.goals.filter((g) => g.isNew).map((g) => `[신규] ${g.ref} ${g.title} → P-${g.projectSlug} 로 새 목표를 만듭니다. 프로젝트가 맞나요?`),
          ...notes,
          "이대로 저장할까요?",
        ],
        next: "사용자가 승인하면 mode=commit, confirm_code, user_confirmation, new_goal_confirmations=[{ref, project_code, confirmed:true} [신규] 목표 전부] 로 부른다.",
      };
    },
  },
  {
    name: "create_project",
    write: true,
    description:
      "새 프로젝트(분류 축)를 만든다. 기존 프로젝트가 우선이다. preview 가 기존 프로젝트 전부를 돌려주면 사용자에게 보여 주고 '기존 X 와 같은 일인가요?' 를 묻는다. 사용자가 새로 만들라고 답한 경우에만 commit 하고, reviewed_projects 에 preview 가 준 기존 코드 전부를 넣는다. 이름이 사실상 같은 프로젝트는 서버가 거절한다." + WRITE_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        ...WRITE_PROPS,
        name: { type: "string", description: "preview 때만. 표시 이름" },
        slug: { type: "string", description: "preview 때만. 코드 뒷부분(영문 대문자 · 숫자 · 하이픈). 예: TRADE-STUDY" },
        abbr: { type: "string", description: "preview 때만. 달력 약칭 1~3자" },
        description: { type: "string", description: "preview 때만. 어떤 일을 담는 프로젝트인지 한 줄" },
        reviewed_projects: { type: "array", items: { type: "string" }, description: "commit 때만. preview 가 보여 준 기존 프로젝트 코드 전부(P-…)." },
      },
      required: ["mode"],
    },
    run: async (a, ctx) => {
      if (modeOf(a) === "commit") return commit(ctx, "create_project", a, a.reviewed_projects);
      const payload = { slug: slugOf(a.slug), name: str(a.name), abbr: str(a.abbr), description: str(a.description) || null, sort: 100 };
      const prep = await prepare(ctx, "create_project", payload);
      const existing = (prep.existing_projects ?? []) as { code: string; name: string; looks_similar: boolean }[];
      const similar = existing.filter((p) => p.looks_similar);
      return {
        status: "ready", ...prep, new_project: { code: `P-${payload.slug}`, name: payload.name, abbr: payload.abbr, description: payload.description },
        ask_user: [
          `기존 프로젝트 ${existing.length}개: ${existing.map((p) => `${p.code} ${p.name}`).join(", ")}`,
          ...similar.map((p) => `${p.code} ${p.name} 와 비슷해 보입니다. 같은 일인가요?`),
          `이 중 어디에도 해당하지 않아 P-${payload.slug} ${payload.name} 를 새로 만들까요?`,
        ],
        next: "사용자가 새로 만들라고 답한 경우에만 mode=commit, confirm_code, user_confirmation, reviewed_projects=[preview 의 existing_projects 코드 전부] 로 부른다. 기존 프로젝트라는 답이면 만들지 않고 그 코드를 쓴다.",
      };
    },
  },
  {
    name: "save_goal",
    write: true,
    description: "목표를 새로 만들거나(code 없이) 고친다(code 와 함께). commit 때 사용자가 확인한 project_code 와 project_confirmed: true 가 필요하다." + WRITE_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        ...WRITE_PROPS,
        code: { type: "string", description: "preview 때만. 고칠 목표 코드(G12). 새 목표면 비운다." },
        title: { type: "string" }, project_code: { type: "string", description: "P-코드. preview · commit 둘 다" },
        period_start: { type: "string" }, period_end: { type: "string" },
        status: { type: "string", enum: ["active", "done", "paused"] }, note: { type: "string" },
        project_confirmed: { type: "boolean", description: "commit 때만. 사용자가 이 프로젝트가 맞다고 답했으면 true" },
      },
      required: ["mode", "project_code"],
    },
    run: async (a, ctx) => {
      if (modeOf(a) === "commit") return commit(ctx, "save_goal", a, [{ project_code: str(a.project_code), confirmed: a.project_confirmed === true }]);
      const [projects, goals] = await Promise.all([read<ProjectRow[]>(ctx, "list_projects"), read<GoalRow[]>(ctx, "list_goals")]);
      const slug = slugOf(a.project_code);
      const project = projects.find((p) => slugOf(p.code) === slug);
      if (!project) throw new ToolError(`P-${slug} 는 없는 프로젝트입니다. 사용자에게 기존 프로젝트 중 어디인지 물어 주세요.`);
      const code = str(a.code).toUpperCase();
      if (code && !goals.some((x) => x.code === code)) throw new ToolError(`${code} 는 없는 목표입니다.`);
      if (!str(a.title)) throw new ToolError("title 이 필요합니다.");
      const payload = { code: code || null, title: str(a.title), project_slug: slug, period_start: str(a.period_start) || null, period_end: str(a.period_end) || null, status: str(a.status) || null, note: str(a.note) || null };
      const prep = await prepare(ctx, "save_goal", payload);
      return {
        status: "ready", ...prep, preview: { ...payload, code: code || "(새 목표, 번호 자동)", project: `P-${slug} ${project.name}` },
        ask_user: [`목표 「${payload.title}」 의 프로젝트가 P-${slug} (${project.name}) 맞나요?`, "이대로 저장할까요?"],
        next: "승인되면 mode=commit, confirm_code, user_confirmation, project_code, project_confirmed=true 로 부른다.",
      };
    },
  },
  {
    name: "save_todo",
    write: true,
    description: "앞으로 할 일을 새로 만들거나(id 없이) 고친다(id 와 함께). 프로젝트를 붙이면 commit 때 project_code + project_confirmed: true 가 필요하다." + WRITE_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        ...WRITE_PROPS,
        id: { type: "string", description: "preview 때만. 고칠 할 일 id(list_todos). 새 할 일이면 비운다." },
        text: { type: "string" }, needs_decision: { type: "boolean" },
        project_code: { type: "string" }, goal_code: { type: "string" }, plan_item_code: { type: "string" },
        due_date: { type: "string", description: "YYYY-MM-DD" }, note: { type: "string" }, done: { type: "boolean" },
        project_confirmed: { type: "boolean", description: "commit 때만" },
      },
      required: ["mode"],
    },
    run: async (a, ctx) => {
      if (modeOf(a) === "commit") return commit(ctx, "save_todo", a, a.project_code ? [{ project_code: str(a.project_code), confirmed: a.project_confirmed === true }] : []);
      if (!str(a.text)) throw new ToolError("text 가 필요합니다.");
      const slug = a.project_code ? slugOf(a.project_code) : null;
      if (slug) {
        const projects = await read<ProjectRow[]>(ctx, "list_projects");
        if (!projects.some((p) => slugOf(p.code) === slug)) throw new ToolError(`P-${slug} 는 없는 프로젝트입니다.`);
      }
      const payload = {
        id: str(a.id) || null, text: str(a.text), needs_decision: a.needs_decision === true, project_slug: slug,
        goal_code: str(a.goal_code).toUpperCase() || null, plan_item_code: str(a.plan_item_code).toUpperCase() || null,
        due_date: str(a.due_date) || null, note: str(a.note) || null, done: typeof a.done === "boolean" ? a.done : null,
      };
      const prep = await prepare(ctx, "save_todo", payload);
      return {
        status: "ready", ...prep, preview: payload,
        ask_user: [...(slug ? [`이 할 일의 프로젝트가 P-${slug} 맞나요?`] : []), "이대로 저장할까요?"],
        next: "승인되면 mode=commit, confirm_code, user_confirmation" + (slug ? ", project_code, project_confirmed=true" : "") + " 로 부른다.",
      };
    },
  },
  {
    name: "set_todo_done",
    write: true,
    description: "앞으로 할 일의 완료 여부를 바꾼다." + WRITE_NOTE,
    inputSchema: { type: "object", properties: { ...WRITE_PROPS, id: { type: "string", description: "preview 때만" }, done: { type: "boolean", description: "preview 때만" } }, required: ["mode"] },
    run: async (a, ctx) => {
      if (modeOf(a) === "commit") return commit(ctx, "set_todo_done", a, []);
      const todos = await read<TodoRow[]>(ctx, "list_todos", { include_done: true });
      const t = todos.find((x) => x.id === str(a.id));
      if (!t) throw new ToolError("그 id 의 할 일이 없습니다. list_todos 로 확인해 주세요.");
      const done = a.done === true;
      const prep = await prepare(ctx, "set_todo_done", { id: t.id, done });
      return { status: "ready", ...prep, preview: { text: t.text, from: t.done, to: done }, ask_user: [`「${t.text}」 를 ${done ? "완료" : "미완"}로 바꿀까요?`] };
    },
  },
  {
    name: "set_plan_item_status",
    write: true,
    description: "계획 항목(G<n>-<m>)을 완료(done) 또는 미완(open)으로 바꾼다." + WRITE_NOTE,
    inputSchema: { type: "object", properties: { ...WRITE_PROPS, code: { type: "string", description: "preview 때만" }, status: { type: "string", enum: ["open", "done"], description: "preview 때만" } }, required: ["mode"] },
    run: async (a, ctx) => {
      if (modeOf(a) === "commit") return commit(ctx, "set_plan_item_status", a, []);
      const items = await read<ItemRow[]>(ctx, "list_plan_items");
      const code = str(a.code).toUpperCase();
      const it = items.find((x) => x.code === code);
      if (!it) throw new ToolError(`${code} 는 없는 계획 항목입니다.`);
      const status = str(a.status) === "done" ? "done" : "open";
      const prep = await prepare(ctx, "set_plan_item_status", { code, status });
      return { status: "ready", ...prep, preview: { code, title: it.title, from: it.status, to: status }, ask_user: [`${code} ${it.title} 를 ${status === "done" ? "완료" : "미완"}로 바꿀까요?`] };
    },
  },
];

export const SERVER_INSTRUCTIONS = [
  "WORKLOG 는 정건의 하루 작업 기록 · 계획 · 목표를 담는다.",
  "처음에 describe 를 읽고, 코드(P- · G · G-n-m · PL- · L-)는 get_context_pack · list_* 에 있는 것만 쓴다.",
  "쓰기는 항상 preview → 사용자에게 보여 주고 질문 → 명시적 승인 → commit(user_confirmation = 답변 원문). 승인 전 commit 금지.",
  "작업 · 목표 · 할 일의 프로젝트는 항목마다 사용자에게 확인받는다. 맞는 프로젝트가 없으면 기타로 넣지 말고 기존 목록을 보여 주며 묻는다.",
  "새 프로젝트는 기존 프로젝트 전부를 사용자와 검토한 뒤에만 만든다. 삭제 도구는 없다.",
].join("\n");
