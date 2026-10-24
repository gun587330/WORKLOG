"use client";

/**
 * TanStack Query 훅 — DAL(lib/api/worklog) 위의 얇은 층. 키는 개체 이름 하나 + 인자.
 * 기록 올리기 · 삭제는 계획 항목 완료(0005 의 달성)와 홈 집계를 바꾸므로 넓게 무효화한다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "@/lib/api/response";
import {
  getProjects, upsertProject, setProjectStatus, type ProjectInput,
  getProjectOverview, getProject, saveProject, type ProjectProfileInput,
  getGoals, upsertGoal, deleteGoal, type GoalInput,
  getPlans, getPlan, insertPlan, deletePlan, setPlanItemStatus,
  getWorkLogs, getWorkLog, insertWorkLog, deleteWorkLog, setLogTodoDone, upsertTodo, deleteTodo, type LogFilter, type TodoInput,
  getPrompts, upsertPrompt, deletePrompt, type PromptInput,
  getContextPack, getHomeStats,
  getDiary, upsertDiary, deleteDiary, type DiaryInput,
  getScraps, uploadScrapFile, addScrapLink, updateScrap, deleteScrap, type Scrap,
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: K.projects }); qc.invalidateQueries({ queryKey: ["project"] }); },
  });
}
/* 프로젝트 페이지 (0022): 목록 집계 · 상세 집계 · 폼 저장. 키는 프로젝트 키 아래라 upsert · 보관이 같이 무효화한다 */
/** today(YYYY-MM-DD)는 키에만 들어간다. 서버는 조회 시점의 오늘(KST)로 8주 · 28일을 계산하므로, 날짜가 바뀌면 키가 바뀌어 다시 읽는다 */
export function useProjectOverview(today: string) {
  return useQuery({ queryKey: [...K.projects, "overview", today], queryFn: () => getProjectOverview().then(unwrap), enabled: !!today });
}
export function useProject(id: string | null, today: string) {
  return useQuery({ queryKey: ["project", id, today], queryFn: () => getProject(id as string).then(unwrap), enabled: !!id && !!today });
}
export function useSaveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: ProjectProfileInput) => saveProject(i).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: K.projects }); qc.invalidateQueries({ queryKey: ["project"] }); },
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: K.goals }); qc.invalidateQueries({ queryKey: ["home"] }); invalidateProjectSide(qc); },
  });
}
export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deleteGoal(id).then(unwrap), onSuccess: () => { qc.invalidateQueries({ queryKey: K.goals }); invalidateProjectSide(qc); } });
}

/* ── 계획 ── */
export function usePlans() {
  return useQuery({ queryKey: K.plans, queryFn: () => getPlans().then(unwrap) });
}
export function usePlan(id: string | null) {
  return useQuery({ queryKey: K.plan(id), queryFn: () => getPlan(id as string).then(unwrap), enabled: !!id });
}
/** 프로젝트 화면(목록 카드 · 상세)은 목표 · 계획 · 기록 · 할 일을 모아 보여 주므로 그쪽이 바뀌면 같이 다시 읽는다 */
function invalidateProjectSide(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [...K.projects, "overview"] });
  qc.invalidateQueries({ queryKey: ["project"] });
}
function invalidatePlanSide(qc: ReturnType<typeof useQueryClient>) {
  invalidateProjectSide(qc);
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["home"] }); qc.invalidateQueries({ queryKey: ["log"] }); invalidateProjectSide(qc); },
  });
}

export function useUpsertTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: TodoInput) => upsertTodo(i).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["home"] }); qc.invalidateQueries({ queryKey: ["log"] }); invalidateProjectSide(qc); },
  });
}
export function useDeleteTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTodo(id).then(unwrap),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["home"] }); qc.invalidateQueries({ queryKey: ["log"] }); invalidateProjectSide(qc); },
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

/* ── 스크랩 ── */
export function useScraps() {
  return useQuery({ queryKey: ["scraps"], queryFn: () => getScraps().then(unwrap) });
}
export function useUploadScrapFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { file: File; title: string; note: string; tags: string[] }) => uploadScrapFile(v.file, v).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scraps"] }),
  });
}
export function useAddScrapLink() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { url: string; title: string; note: string; tags: string[] }) => addScrapLink(v).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ["scraps"] }) });
}
export function useUpdateScrap() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { scrap: Scrap; title: string; note: string; tags: string[]; url?: string }) => updateScrap(v.scrap, v).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ["scraps"] }) });
}
export function useDeleteScrap() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deleteScrap(id).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ["scraps"] }) });
}

