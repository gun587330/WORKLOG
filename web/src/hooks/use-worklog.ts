"use client";

/**
 * TanStack Query 훅 — DAL(lib/api/worklog) 위의 얇은 층. 키는 개체 이름 하나 + 인자.
 * 기록 올리기 · 삭제는 계획 항목 완료(0005 의 달성)와 홈 집계를 바꾸므로 넓게 무효화한다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "@/lib/api/response";
import {
  getProjects, upsertProject, setProjectStatus, type ProjectInput,
  getGoals, upsertGoal, deleteGoal, type GoalInput,
  getPlans, getPlan, insertPlan, deletePlan, setPlanItemStatus,
  getWorkLogs, getWorkLog, insertWorkLog, deleteWorkLog, setLogTodoDone, upsertTodo, deleteTodo, type LogFilter, type TodoInput,
  getPrompts, upsertPrompt, deletePrompt, type PromptInput,
  getContextPack, getHomeStats,
  getDiary, upsertDiary, deleteDiary, type DiaryInput,
} from "@/lib/api/worklog";
import type { ParsedWorkLog } from "@/lib/work-log";
import type { ParsedWorkPlan } from "@/lib/work-plan";

const K = {
  projects: ["projects"] as const,
  goals: ["goals"] as const,
  plans: ["plans"] as const,
  plan: (id: string | null) => ["plan", id] as const,
  logs: ["logs"] as const,
  log: (id: string | null) => ["log", id] as const,
  prompts: ["prompts"] as const,
  home: (date: string) => ["home", date] as const,
};

/* ── 프로젝트 ── */
export function useProjects(includeArchived = false) {
  return useQuery({ queryKey: [...K.projects, includeArchived], queryFn: () => getProjects(includeArchived).then(unwrap) });
}
/** slug → 표시 이름. 칩 · 달력 · 카드가 같이 쓴다 */
export function useProjectNames() {
  const q = useProjects(true);
  const map = new Map<string, string>();
  for (const p of q.data ?? []) map.set(p.slug, p.name);
  return { map, name: (slug: string) => map.get(slug) ?? slug, isLoading: q.isLoading };
}
export function useUpsertProject() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (i: ProjectInput) => upsertProject(i).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: K.projects }) });
}
export function useSetProjectStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: "active" | "archived" }) => setProjectStatus(v.id, v.status).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: K.projects }),
  });
}

/* ── 목표 ── */
export function useGoals(status?: string | null) {
  return useQuery({ queryKey: [...K.goals, status ?? "all"], queryFn: () => getGoals(status).then(unwrap) });
}
export function useUpsertGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: GoalInput) => upsertGoal(i).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: K.goals }); qc.invalidateQueries({ queryKey: ["home"] }); },
  });
}
export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deleteGoal(id).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: K.goals }) });
}

/* ── 계획 ── */
export function usePlans() {
  return useQuery({ queryKey: K.plans, queryFn: () => getPlans().then(unwrap) });
}
export function usePlan(id: string | null) {
  return useQuery({ queryKey: K.plan(id), queryFn: () => getPlan(id as string).then(unwrap), enabled: !!id });
}
function invalidatePlanSide(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: K.plans });
  qc.invalidateQueries({ queryKey: ["plan"] });
  qc.invalidateQueries({ queryKey: K.goals });
  qc.invalidateQueries({ queryKey: ["home"] });
}
export function useInsertPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { parsed: ParsedWorkPlan; rawMd: string }) => insertPlan(v.parsed, v.rawMd).then(unwrap),
    onSuccess: () => invalidatePlanSide(qc),
  });
}
export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deletePlan(id).then(unwrap), onSuccess: () => invalidatePlanSide(qc) });
}
export function useSetPlanItemStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: "open" | "done" }) => setPlanItemStatus(v.id, v.status).then(unwrap),
    onSuccess: () => invalidatePlanSide(qc),
  });
}

/* ── 기록 ── */
export function useWorkLogs(filter: LogFilter = {}) {
  return useQuery({ queryKey: [...K.logs, filter], queryFn: () => getWorkLogs(filter).then(unwrap) });
}
export function useWorkLog(id: string | null) {
  return useQuery({ queryKey: K.log(id), queryFn: () => getWorkLog(id as string).then(unwrap), enabled: !!id });
}
function invalidateLogSide(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: K.logs });
  qc.invalidateQueries({ queryKey: ["log"] });
  invalidatePlanSide(qc);
}
export function useInsertWorkLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { parsed: ParsedWorkLog; rawMd: string }) => insertWorkLog(v.parsed, v.rawMd).then(unwrap),
    onSuccess: () => invalidateLogSide(qc),
  });
}
export function useDeleteWorkLog() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deleteWorkLog(id).then(unwrap), onSuccess: () => invalidateLogSide(qc) });
}
export function useSetLogTodoDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; done: boolean }) => setLogTodoDone(v.id, v.done).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["home"] }); qc.invalidateQueries({ queryKey: ["log"] }); },
  });
}

export function useUpsertTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: TodoInput) => upsertTodo(i).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["home"] }); qc.invalidateQueries({ queryKey: ["log"] }); },
  });
}
export function useDeleteTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTodo(id).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["home"] }); qc.invalidateQueries({ queryKey: ["log"] }); },
  });
}

/* ── 프롬프트 ── */
export function usePrompts() {
  return useQuery({ queryKey: K.prompts, queryFn: () => getPrompts().then(unwrap) });
}
export function useUpsertPrompt() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (i: PromptInput) => upsertPrompt(i).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: K.prompts }) });
}
export function useDeletePrompt() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deletePrompt(id).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: K.prompts }) });
}

/* ── 컨텍스트 팩 · 홈 ── */
export function useContextPack() {
  return useMutation({ mutationFn: () => getContextPack().then(unwrap) });
}
export function useHomeStats(date: string) {
  return useQuery({ queryKey: K.home(date), queryFn: () => getHomeStats(date).then(unwrap), enabled: !!date });
}

/* ── 일기 ── */
export function useDiary() {
  return useQuery({ queryKey: ["diary"], queryFn: () => getDiary().then(unwrap) });
}
export function useUpsertDiary() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (i: DiaryInput) => upsertDiary(i).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ["diary"] }) });
}
export function useDeleteDiary() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deleteDiary(id).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ["diary"] }) });
}

