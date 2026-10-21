/**
 * ⚠️ 손으로 쓴 임시 스키마 타입 — `npm run gen:types`(루트) 가 원격 스키마에서 이 파일을 **덮어쓴다**.
 * 마이그레이션 0001~0007 과 1:1 로 맞춰 두어 push 전에도 typecheck 가 돌게 한다.
 * 생성 타입과 같은 관례를 따른다: uuid · date · timestamptz 는 string, numeric 은 number, jsonb 는 Json,
 * 기본값 있는 인자는 선택(?), 없는 인자는 필수 string(null 을 넘길 땐 호출부가 캐스팅).
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Tbl<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };

type ProjectRow = { id: string; slug: string; name: string; abbr: string; description: string | null; status: string; sort: number; created_at: string; updated_at: string };
type GoalRow = { id: string; code: string; title: string; project_id: string; period_start: string | null; period_end: string | null; status: string; note: string | null; created_at: string; updated_at: string };
type PlanRow = { id: string; code: string; title: string; period_start: string; period_end: string; status: string; summary: string | null; raw_md: string; created_at: string; updated_at: string };
type PlanItemRow = { id: string; plan_id: string; goal_id: string; code: string; seq: number; title: string; due_date: string | null; status: string; done_log_id: string | null; created_at: string; updated_at: string };
type WorkLogRow = { id: string; code: string; log_date: string; author_name: string; summary: string | null; raw_md: string; task_count: number; done_count: number; hours_total: number; created_at: string; updated_at: string };
type WorkItemRow = { id: string; log_id: string; seq: number; code: string; time_text: string | null; hour_end: number | null; title: string; project_id: string; goal_id: string | null; status: string; tags: string[]; body_md: string; created_at: string; updated_at: string };
type WorkHourRow = { log_id: string; hour: number; value: number; label: string };
type LogTodoRow = { id: string; log_id: string; seq: number; text: string; needs_decision: boolean; done: boolean; plan_item_id: string | null; created_at: string; updated_at: string };
type ItemCompletionRow = { plan_item_id: string; log_id: string; created_at: string };
type PromptRow = { id: string; title: string; purpose: string | null; body: string; sort: number; created_at: string; updated_at: string };
type LinkRow = { id: string; from_type: string; from_id: string; to_type: string; to_code: string; kind: string; context: string | null; created_at: string; updated_at: string };

export type Database = {
  public: {
    Tables: {
      projects: Tbl<ProjectRow>;
      goals: Tbl<GoalRow>;
      plans: Tbl<PlanRow>;
      plan_items: Tbl<PlanItemRow>;
      work_logs: Tbl<WorkLogRow>;
      work_items: Tbl<WorkItemRow>;
      work_hours: Tbl<WorkHourRow>;
      log_todos: Tbl<LogTodoRow>;
      item_completions: Tbl<ItemCompletionRow>;
      prompts: Tbl<PromptRow>;
      links: Tbl<LinkRow>;
    };
    Views: Record<string, never>;
    Functions: {
      assert_owner: { Args: Record<PropertyKey, never>; Returns: undefined };
      list_projects: { Args: { p_include_archived?: boolean }; Returns: ProjectRow[] };
      upsert_project: { Args: { p_id: string; p_slug: string; p_name: string; p_abbr: string; p_description: string; p_sort: number }; Returns: ProjectRow };
      set_project_status: { Args: { p_id: string; p_status: string }; Returns: ProjectRow };
      list_goals: {
        Args: { p_status?: string };
        Returns: {
          id: string; code: string; title: string; project_id: string; project_slug: string; project_name: string;
          period_start: string | null; period_end: string | null; status: string; note: string | null;
          item_count: number; done_count: number; created_at: string; updated_at: string;
        }[];
      };
      upsert_goal: { Args: { p_id: string; p_title: string; p_project_slug: string; p_period_start: string; p_period_end: string; p_status: string; p_note: string }; Returns: GoalRow };
      delete_goal: { Args: { p_id: string }; Returns: undefined };
      insert_plan: { Args: { p_code: string; p_title: string; p_period_start: string; p_period_end: string; p_summary: string; p_raw_md: string; p_goals: Json; p_items: Json }; Returns: PlanRow };
      list_plans: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string; code: string; title: string; period_start: string; period_end: string; status: string; summary: string | null;
          goal_count: number; item_count: number; done_count: number; project_slugs: string[]; created_at: string;
        }[];
      };
      get_plan: { Args: { p_id: string }; Returns: Json };
      delete_plan: { Args: { p_id: string }; Returns: undefined };
      set_plan_item_status: { Args: { p_id: string; p_status: string }; Returns: PlanItemRow };
      insert_work_log: { Args: { p_log_date: string; p_author_name: string; p_summary: string; p_raw_md: string; p_items: Json; p_hours: Json; p_todos: Json; p_completions: string[] }; Returns: WorkLogRow };
      list_work_logs: {
        Args: { p_project_slug?: string; p_from?: string; p_to?: string; p_limit?: number };
        Returns: {
          id: string; code: string; log_date: string; author_name: string; summary: string | null; task_count: number; done_count: number;
          hours_total: number; project_slugs: string[]; created_at: string;
        }[];
      };
      get_work_log: { Args: { p_id: string }; Returns: Json };
      delete_work_log: { Args: { p_id: string }; Returns: undefined };
      set_log_todo_done: { Args: { p_id: string; p_done: boolean }; Returns: LogTodoRow };
      list_prompts: { Args: Record<PropertyKey, never>; Returns: PromptRow[] };
      upsert_prompt: { Args: { p_id: string; p_title: string; p_purpose: string; p_body: string }; Returns: PromptRow };
      delete_prompt: { Args: { p_id: string }; Returns: undefined };
      insert_links: { Args: { p_from_type: string; p_from_id: string; p_links: Json }; Returns: number };
      context_pack: { Args: { p_from?: string; p_to?: string }; Returns: string };
      home_stats: { Args: { p_date?: string }; Returns: Json };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
