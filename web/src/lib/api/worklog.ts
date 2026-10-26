/**
 * WORKLOG DAL — 모든 데이터 접근은 여기서 RPC 로만 한다 (CLAUDE.md 규칙 6 · docs/backend/SECURITY.md).
 * anserx-code lib/api/admin.ts 「작업 공유」 절에서 옮김 · 바뀐 점: admin_ 접두 없음, 개체가 프로젝트 · 목표 ·
 * 계획 · 계획 항목 · 기록 · 할 일 · 프롬프트 · 링크 · 컨텍스트 팩 · 홈 집계로 늘었다(docs/VOCAB.md).
 * 파서(lib/work-log · lib/work-plan)의 결과를 RPC 인자 모양으로 바꾸는 것도 이 파일의 일이다.
 */
import { createClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/types/database";
import { failFrom, type ApiResult } from "./response";
import { extractWikiLinks, type ParsedWorkLog, type CodeLink } from "@/lib/work-log";
import type { ParsedWorkPlan } from "@/lib/work-plan";

type Fn = Database["public"]["Functions"];
type Tables = Database["public"]["Tables"];

export type Project = Tables["projects"]["Row"];
export type Goal = Tables["goals"]["Row"];
export type GoalRow = Fn["list_goals"]["Returns"][number];
export type Plan = Tables["plans"]["Row"];
export type PlanRow = Fn["list_plans"]["Returns"][number];
export type PlanItem = Tables["plan_items"]["Row"];
export type WorkLog = Tables["work_logs"]["Row"];
export type WorkLogRow = Fn["list_work_logs"]["Returns"][number];
export type LogTodo = Tables["log_todos"]["Row"];
export type Prompt = Tables["prompts"]["Row"];

/** get_plan 의 jsonb 모양 (0004) */
export type PlanDetail = {
  plan: Plan;
  items: { id: string; code: string; title: string; due_date: string | null; status: "open" | "done"; goal_code: string; goal_title: string; project_slug: string; done_log_id: string | null }[];
};
/** get_work_log 의 jsonb 모양 (0005) */
export type WorkLogDetail = {
  log: WorkLog;
  items: { id: string; seq: number; code: string; time_text: string | null; hour_end: number | null; title: string; project_slug: string; project_name: string; goal_code: string | null; goal_title: string | null; status: string; tags: string[]; body_md: string }[];
  hours: { hour: number; value: number; label: string }[];
  todos: { id: string; text: string; needs_decision: boolean; done: boolean; plan_item_code: string | null; project_slug: string | null; goal_code: string | null; due_date: string | null; start_date: string | null; note: string | null; log_id: string | null }[];
  completions: { code: string; title: string; goal_code: string }[];
};
/** home_stats 의 jsonb 모양 (0007) */
export type HomeStats = {
  date: string;
  today_hours: { hour: number; value: number }[];
  week_days: { date: string; hours: number }[];
  month_days: { date: string; hours: number }[];
  week_projects: { slug: string; name: string; hours: number }[];
  calendar: {
    start: string; end: string;
    planned: { date: string; code: string; title: string; status: string; goal_code: string }[];
    logs: { date: string; id: string; code: string; hours: number; projects: string[] }[];
    ranges: { id: string; text: string; start: string; end: string; done: boolean; project_slug: string | null; plan_item_code: string | null }[];
  };
  todos: {
    kind: "log"; id: string; text: string; needs_decision: boolean; done: boolean; source: string | null; log_id: string | null;
    plan_item_code: string | null; project_slug: string | null; goal_code: string | null; due_date: string | null; start_date: string | null; note: string | null;
  }[];
  plan_items_open: { kind: "plan"; id: string; code: string; text: string; done: boolean; due_date: string | null; source: string }[];
  active_plan: {
    id: string; code: string; title: string; period_start: string; period_end: string;
    goals: { code: string; title: string; project_slug: string; total: number; done: number }[];
  } | null;
};

/** env 가 없으면(백엔드 미연결) createClient 가 던진다 — 화면이 사유를 말할 수 있게 봉투로 돌려보낸다 */
async function call<K extends keyof Fn>(name: K, args?: Fn[K]["Args"]): Promise<ApiResult<Fn[K]["Returns"]>> {
  try {
    // ⚠️ rpc 를 변수로 떼어 내 부르면 this 가 끊겨 "reading 'rest'" 로 터진다(2026-10-21 실연에서 발견). 반드시 client.rpc(...) 로 부른다
    const client = createClient() as unknown as { rpc: (fn: string, a?: unknown) => PromiseLike<{ data: unknown; error: unknown }> };
    const res = await client.rpc(name as string, args);
    if (res.error) return failFrom(res.error);
    return { data: res.data as Fn[K]["Returns"], error: null };
  } catch (e) {
    console.error(`[rpc ${String(name)}]`, e);
    return failFrom(e);
  }
}
const nullId = (id?: string | null) => (id ?? null) as unknown as string;
const nullStr = (v?: string | null) => (v && v.trim() ? v.trim() : null) as unknown as string;

/* ── 프로젝트 ── */
export const getProjects = (includeArchived = false) => call("list_projects", { p_include_archived: includeArchived });
export type ProjectInput = { id?: string | null; slug: string; name: string; abbr: string; description?: string; sort?: number };
export const upsertProject = (i: ProjectInput) =>
  call("upsert_project", { p_id: nullId(i.id), p_slug: i.slug.trim().toUpperCase(), p_name: i.name.trim(), p_abbr: i.abbr.trim(), p_description: nullStr(i.description), p_sort: i.sort ?? 100 });
export const setProjectStatus = (id: string, status: "active" | "archived") => call("set_project_status", { p_id: id, p_status: status });

/* ── 목표 ── */
export const getGoals = (status?: string | null) => call("list_goals", status ? { p_status: status } : {});
export type GoalInput = { id?: string | null; title: string; projectSlug: string; periodStart?: string | null; periodEnd?: string | null; status?: "active" | "done" | "paused" | null; note?: string | null };
export const upsertGoal = (i: GoalInput) =>
  call("upsert_goal", {
    p_id: nullId(i.id), p_title: i.title, p_project_slug: i.projectSlug,
    p_period_start: nullStr(i.periodStart), p_period_end: nullStr(i.periodEnd),
    p_status: nullStr(i.status), p_note: nullStr(i.note),
  });
export const deleteGoal = (id: string) => call("delete_goal", { p_id: id });

/* ── 계획 ── */
export const getPlans = () => call("list_plans");
export async function getPlan(id: string): Promise<ApiResult<PlanDetail>> {
  const res = await call("get_plan", { p_id: id });
  if (res.error) return res as ApiResult<PlanDetail>;
  return { data: res.data as unknown as PlanDetail, error: null };
}
export const deletePlan = (id: string) => call("delete_plan", { p_id: id });
export const setPlanItemStatus = (id: string, status: "open" | "done") => call("set_plan_item_status", { p_id: id, p_status: status });

const toLinks = (links: CodeLink[]) => links.map((l) => ({ to_type: l.toType, to_code: l.toCode, kind: l.kind, context: l.context })) as unknown as Json;

/** 계획 올리기 — 파서 결과를 insert_plan 인자로. 목표 · 할 일 · 링크를 한 번에 */
export async function insertPlan(parsed: ParsedWorkPlan, rawMd: string): Promise<ApiResult<Plan>> {
  const res = await call("insert_plan", {
    p_code: parsed.code,
    p_title: parsed.meta.title,
    p_period_start: parsed.meta.periodStart,
    p_period_end: parsed.meta.periodEnd || parsed.meta.periodStart,
    p_summary: parsed.meta.summary,
    p_raw_md: rawMd,
    p_goals: parsed.goals.map((g) => ({ ref: g.ref, title: g.title, project_slug: g.projectSlug, is_new: g.isNew })) as unknown as Json,
    p_items: parsed.items.map((i) => ({ goal_ref: i.goalRef, title: i.title, due_date: i.dueDate })) as unknown as Json,
  });
  if (res.error) return res;
  if (parsed.links.length) await call("insert_links", { p_from_type: "plan", p_from_id: res.data.id, p_links: toLinks(parsed.links) });
  return res;
}

/* ── 기록 ── */
export type LogFilter = { projectSlug?: string | null; from?: string | null; to?: string | null; limit?: number };
export const getWorkLogs = (f: LogFilter = {}) =>
  call("list_work_logs", {
    ...(f.projectSlug ? { p_project_slug: f.projectSlug } : {}),
    ...(f.from ? { p_from: f.from } : {}),
    ...(f.to ? { p_to: f.to } : {}),
    ...(f.limit ? { p_limit: f.limit } : {}),
  });
export async function getWorkLog(id: string): Promise<ApiResult<WorkLogDetail>> {
  const res = await call("get_work_log", { p_id: id });
  if (res.error) return res as ApiResult<WorkLogDetail>;
  return { data: res.data as unknown as WorkLogDetail, error: null };
}
/** 기록 올리기 — 항상 새 행. 작업 · 시간표 · 할 일 · 달성(## 목표 진행) · 링크를 한 번에 */
export async function insertWorkLog(parsed: ParsedWorkLog, rawMd: string): Promise<ApiResult<WorkLog>> {
  const res = await call("insert_work_log", {
    p_log_date: parsed.meta.date,
    p_author_name: parsed.meta.author,
    p_summary: parsed.meta.summary,
    p_raw_md: rawMd,
    p_items: parsed.items.map((i) => ({
      seq: i.seq, time_text: i.time, hour_end: i.hourEnd, title: i.title, project_slug: i.projectSlug,
      goal_code: i.goalCode, status: i.status, tags: i.tags, body_md: i.body,
    })) as unknown as Json,
    p_hours: parsed.hours.map((h) => ({ hour: h.hour, value: h.value, label: h.label })) as unknown as Json,
    p_todos: parsed.todos.map((t) => ({ seq: t.seq, text: t.text, needs_decision: t.needsDecision, plan_item_code: t.planItemCode })) as unknown as Json,
    p_completions: parsed.completions,
  });
  if (res.error) return res;
  if (parsed.links.length) await call("insert_links", { p_from_type: "log", p_from_id: res.data.id, p_links: toLinks(parsed.links) });
  return res;
}
/** 기록 수정 — 같은 행(코드 유지)에 원문을 다시 저장한다(0023). 할 일은 문장이 같으면 체크 · 기한 · 프로젝트를 그대로 둔다 */
export async function updateWorkLog(id: string, parsed: ParsedWorkLog, rawMd: string): Promise<ApiResult<WorkLog>> {
  return call("update_work_log", {
    p_id: id,
    p_log_date: parsed.meta.date,
    p_author_name: parsed.meta.author,
    p_summary: parsed.meta.summary,
    p_raw_md: rawMd,
    p_items: parsed.items.map((i) => ({
      seq: i.seq, time_text: i.time, hour_end: i.hourEnd, title: i.title, project_slug: i.projectSlug,
      goal_code: i.goalCode, status: i.status, tags: i.tags, body_md: i.body,
    })) as unknown as Json,
    p_hours: parsed.hours.map((h) => ({ hour: h.hour, value: h.value, label: h.label })) as unknown as Json,
    p_todos: parsed.todos.map((t) => ({ seq: t.seq, text: t.text, needs_decision: t.needsDecision, plan_item_code: t.planItemCode })) as unknown as Json,
    p_completions: parsed.completions,
    p_links: toLinks(parsed.links),
  });
}
export const deleteWorkLog = (id: string) => call("delete_work_log", { p_id: id });
export const setLogTodoDone = (id: string, done: boolean) => call("set_log_todo_done", { p_id: id, p_done: done });

/* ── 할 일(직접 추가 · 수정 · 삭제, 0010). 기록에서 온 할 일도 같은 폼으로 고친다 ── */
export type TodoInput = {
  id?: string | null; text: string; needsDecision: boolean; projectSlug?: string | null; goalCode?: string | null;
  planItemCode?: string | null; startDate?: string | null; dueDate?: string | null; note?: string | null; done?: boolean | null;
};
export const upsertTodo = (i: TodoInput) =>
  call("upsert_todo", {
    p_id: nullId(i.id), p_text: i.text, p_needs_decision: i.needsDecision,
    p_project_slug: nullStr(i.projectSlug), p_goal_code: nullStr(i.goalCode), p_plan_item_code: nullStr(i.planItemCode),
    p_due_date: nullStr(i.dueDate), p_note: nullStr(i.note), p_done: (i.done ?? null) as unknown as boolean,
    p_start_date: nullStr(i.startDate),
  });
export const deleteTodo = (id: string) => call("delete_todo", { p_id: id });

/* ── 프롬프트 ── */
export const getPrompts = () => call("list_prompts");
export type PromptInput = { id?: string | null; title: string; purpose: string; body: string };
export const upsertPrompt = (i: PromptInput) => call("upsert_prompt", { p_id: nullId(i.id), p_title: i.title, p_purpose: i.purpose, p_body: i.body });
export const deletePrompt = (id: string) => call("delete_prompt", { p_id: id });

/* ── 컨텍스트 팩 · 홈 ── */
export const getContextPack = (from?: string, to?: string) => call("context_pack", { ...(from ? { p_from: from } : {}), ...(to ? { p_to: to } : {}) });
export async function getHomeStats(date: string): Promise<ApiResult<HomeStats>> {
  const res = await call("home_stats", { p_date: date });
  if (res.error) return res as ApiResult<HomeStats>;
  return { data: res.data as unknown as HomeStats, error: null };
}

/* ── 일기 (0015). 본문 [[코드]] 는 저장 때 links 로 함께 남는다 ── */
export type DiaryEntry = Tables["diary_entries"]["Row"];
export type DiaryInput = { id?: string | null; entryDate: string; title: string; body: string; tags: string[] };
export const getDiary = (from?: string, to?: string) => call("list_diary", { ...(from ? { p_from: from } : {}), ...(to ? { p_to: to } : {}) });
export const upsertDiary = (i: DiaryInput) =>
  call("upsert_diary", {
    p_id: nullId(i.id), p_entry_date: i.entryDate, p_title: i.title, p_body: i.body, p_tags: i.tags,
    p_links: toLinks(extractWikiLinks(i.body)),
  });
export const deleteDiary = (id: string) => call("delete_diary", { p_id: id });

/* ── 스크랩 (0020). 파일 본체는 Storage 비공개 버킷 'scraps', 표에는 메타데이터 ── */
export type Scrap = Tables["scraps"]["Row"];
export const SCRAP_MAX_BYTES = 50 * 1024 * 1024;
export const getScraps = () => call("list_scraps");

/** 파일 하나 올리기: Storage 에 올린 뒤 표에 기록. 표 기록이 실패하면 올린 파일을 지운다 */
export async function uploadScrapFile(file: File, meta: { title: string; note: string; tags: string[] }): Promise<ApiResult<Scrap>> {
  if (file.size > SCRAP_MAX_BYTES) return { data: null, error: { message: "파일이 50MB 를 넘어요" } };
  const sb = createClient();
  const safe = file.name.normalize("NFC").replace(/[^\w.\-가-힣]+/g, "_").slice(-120) || "file";
  const path = `${crypto.randomUUID()}/${safe}`;
  const up = await sb.storage.from("scraps").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (up.error) return failFrom(up.error);
  const res = await call("upsert_scrap", {
    p_id: nullId(null), p_kind: "file", p_title: meta.title || file.name, p_note: meta.note, p_tags: meta.tags,
    p_url: nullStr(null), p_storage_path: path, p_file_name: file.name, p_mime_type: file.type || "application/octet-stream",
    p_size_bytes: file.size, p_links: toLinks(extractWikiLinks(meta.note)),
  });
  if (res.error) await sb.storage.from("scraps").remove([path]);
  return res;
}
export const addScrapLink = (meta: { url: string; title: string; note: string; tags: string[] }) =>
  call("upsert_scrap", {
    p_id: nullId(null), p_kind: "link", p_title: meta.title || meta.url, p_note: meta.note, p_tags: meta.tags, p_url: meta.url,
    p_storage_path: nullStr(null), p_file_name: nullStr(null), p_mime_type: nullStr(null), p_size_bytes: null as unknown as number,
    p_links: toLinks(extractWikiLinks(meta.note)),
  });
export const updateScrap = (s: Scrap, meta: { title: string; note: string; tags: string[]; url?: string }) =>
  call("upsert_scrap", {
    p_id: s.id, p_kind: s.kind, p_title: meta.title, p_note: meta.note, p_tags: meta.tags, p_url: nullStr(meta.url ?? s.url),
    p_storage_path: nullStr(null), p_file_name: nullStr(null), p_mime_type: nullStr(null), p_size_bytes: null as unknown as number,
    p_links: toLinks(extractWikiLinks(meta.note)),
  });
export async function deleteScrap(id: string): Promise<ApiResult<null>> {
  const res = await call("delete_scrap", { p_id: id });
  if (res.error) return res as ApiResult<null>;
  if (res.data) await createClient().storage.from("scraps").remove([res.data as string]);
  return { data: null, error: null };
}
/** 비공개 파일을 잠깐 여는 주소(1시간) */
export async function scrapSignedUrl(path: string, download?: string): Promise<string | null> {
  const r = await createClient().storage.from("scraps").createSignedUrl(path, 3600, download ? { download } : undefined);
  return r.data?.signedUrl ?? null;
}


/* ── 프로젝트 페이지 (0022). 소개 · 목표 글 + 프로젝트 축 집계 ── */
/** project_overview 의 jsonb 원소 모양 */
export type ProjectOverview = Project & {
  goals_total: number; goals_active: number; goals_done: number;
  items_total: number; items_done: number;
  logs_count: number; tasks_count: number;
  hours_total: number; hours_28d: number;
  last_log_date: string | null; open_todos: number;
};
/** get_project 의 jsonb 모양 */
export type ProjectDetail = {
  project: Project;
  goals: { id: string; code: string; title: string; status: "active" | "done" | "paused"; period_start: string | null; period_end: string | null; note: string | null; item_count: number; done_count: number }[];
  open_items: { id: string; code: string; title: string; due_date: string | null; goal_code: string; plan_code: string }[];
  open_todos: { id: string; text: string; needs_decision: boolean; due_date: string | null; source: string | null; log_id: string | null }[];
  recent_logs: { id: string; code: string; log_date: string; summary: string | null; task_count: number; done_count: number }[];
  weeks: { week_start: string; hours: number }[];
  hours_total: number; logs_count: number; tasks_count: number;
};
export async function getProjectOverview(): Promise<ApiResult<ProjectOverview[]>> {
  const res = await call("project_overview");
  if (res.error) return res as ApiResult<ProjectOverview[]>;
  return { data: res.data as unknown as ProjectOverview[], error: null };
}
export async function getProject(id: string): Promise<ApiResult<ProjectDetail>> {
  const res = await call("get_project", { p_id: id });
  if (res.error) return res as ApiResult<ProjectDetail>;
  return { data: res.data as unknown as ProjectDetail, error: null };
}
export type ProjectProfileInput = ProjectInput & { introMd?: string; objectiveMd?: string };
/** 화면 폼 저장. 고칠 때 slug 는 서버가 기존 값을 유지한다(md 원문이 P-코드를 가리킨다) */
export const saveProject = (i: ProjectProfileInput) =>
  call("save_project", {
    p_id: nullId(i.id), p_slug: i.slug.trim().toUpperCase(), p_name: i.name.trim(), p_abbr: i.abbr.trim(),
    p_description: nullStr(i.description), p_intro_md: nullStr(i.introMd), p_objective_md: nullStr(i.objectiveMd), p_sort: i.sort ?? 100,
  });
