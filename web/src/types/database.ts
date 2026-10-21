export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      diary_entries: {
        Row: {
          body_md: string
          code: string
          created_at: string
          entry_date: string
          id: string
          tags: string[]
          title: string | null
          updated_at: string
        }
        Insert: {
          body_md: string
          code: string
          created_at?: string
          entry_date: string
          id?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Update: {
          body_md?: string
          code?: string
          created_at?: string
          entry_date?: string
          id?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          code: string
          created_at: string
          id: string
          note: string | null
          period_end: string | null
          period_start: string | null
          project_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          note?: string | null
          period_end?: string | null
          period_start?: string | null
          project_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          note?: string | null
          period_end?: string | null
          period_start?: string | null
          project_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      item_completions: {
        Row: {
          created_at: string
          log_id: string
          plan_item_id: string
        }
        Insert: {
          created_at?: string
          log_id: string
          plan_item_id: string
        }
        Update: {
          created_at?: string
          log_id?: string
          plan_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_completions_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "work_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_completions_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: true
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
        ]
      }
      links: {
        Row: {
          context: string | null
          created_at: string
          from_id: string
          from_type: string
          id: string
          kind: string
          to_code: string
          to_type: string
          updated_at: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          from_id: string
          from_type: string
          id?: string
          kind?: string
          to_code: string
          to_type: string
          updated_at?: string
        }
        Update: {
          context?: string | null
          created_at?: string
          from_id?: string
          from_type?: string
          id?: string
          kind?: string
          to_code?: string
          to_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      log_todos: {
        Row: {
          created_at: string
          done: boolean
          due_date: string | null
          goal_id: string | null
          id: string
          log_id: string | null
          needs_decision: boolean
          note: string | null
          plan_item_id: string | null
          project_id: string | null
          seq: number
          start_date: string | null
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          due_date?: string | null
          goal_id?: string | null
          id?: string
          log_id?: string | null
          needs_decision?: boolean
          note?: string | null
          plan_item_id?: string | null
          project_id?: string | null
          seq?: number
          start_date?: string | null
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          due_date?: string | null
          goal_id?: string | null
          id?: string
          log_id?: string | null
          needs_decision?: boolean
          note?: string | null
          plan_item_id?: string | null
          project_id?: string | null
          seq?: number
          start_date?: string | null
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_todos_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_todos_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "work_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_todos_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_todos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_audit: {
        Row: {
          confirmations: Json
          created_at: string
          id: string
          payload: Json
          result: Json | null
          token_label: string
          tool: string
          updated_at: string
          user_confirmation: string
        }
        Insert: {
          confirmations?: Json
          created_at?: string
          id?: string
          payload: Json
          result?: Json | null
          token_label: string
          tool: string
          updated_at?: string
          user_confirmation: string
        }
        Update: {
          confirmations?: Json
          created_at?: string
          id?: string
          payload?: Json
          result?: Json | null
          token_label?: string
          tool?: string
          updated_at?: string
          user_confirmation?: string
        }
        Relationships: []
      }
      plan_items: {
        Row: {
          code: string
          created_at: string
          done_log_id: string | null
          due_date: string | null
          goal_id: string
          id: string
          plan_id: string
          seq: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          done_log_id?: string | null
          due_date?: string | null
          goal_id: string
          id?: string
          plan_id: string
          seq: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          done_log_id?: string | null
          due_date?: string | null
          goal_id?: string
          id?: string
          plan_id?: string
          seq?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_done_log_fk"
            columns: ["done_log_id"]
            isOneToOne: false
            referencedRelation: "work_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          id: string
          period_end: string
          period_start: string
          raw_md: string
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          raw_md: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          raw_md?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          abbr: string
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort: number
          status: string
          updated_at: string
        }
        Insert: {
          abbr: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          sort?: number
          status?: string
          updated_at?: string
        }
        Update: {
          abbr?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompts: {
        Row: {
          body: string
          created_at: string
          id: string
          purpose: string | null
          sort: number
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          purpose?: string | null
          sort?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          purpose?: string | null
          sort?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      work_hours: {
        Row: {
          hour: number
          label: string
          log_id: string
          value: number
        }
        Insert: {
          hour: number
          label?: string
          log_id: string
          value: number
        }
        Update: {
          hour?: number
          label?: string
          log_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_hours_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "work_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      work_items: {
        Row: {
          body_md: string
          code: string
          created_at: string
          goal_id: string | null
          hour_end: number | null
          id: string
          log_id: string
          project_id: string
          seq: number
          status: string
          tags: string[]
          time_text: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body_md?: string
          code: string
          created_at?: string
          goal_id?: string | null
          hour_end?: number | null
          id?: string
          log_id: string
          project_id: string
          seq: number
          status?: string
          tags?: string[]
          time_text?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body_md?: string
          code?: string
          created_at?: string
          goal_id?: string | null
          hour_end?: number | null
          id?: string
          log_id?: string
          project_id?: string
          seq?: number
          status?: string
          tags?: string[]
          time_text?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_items_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "work_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      work_logs: {
        Row: {
          author_name: string
          code: string
          created_at: string
          done_count: number
          hours_total: number
          id: string
          log_date: string
          raw_md: string
          summary: string | null
          task_count: number
          updated_at: string
        }
        Insert: {
          author_name: string
          code: string
          created_at?: string
          done_count?: number
          hours_total?: number
          id?: string
          log_date: string
          raw_md: string
          summary?: string | null
          task_count?: number
          updated_at?: string
        }
        Update: {
          author_name?: string
          code?: string
          created_at?: string
          done_count?: number
          hours_total?: number
          id?: string
          log_date?: string
          raw_md?: string
          summary?: string | null
          task_count?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assert_owner: { Args: never; Returns: undefined }
      context_pack: {
        Args: { p_from?: string; p_to?: string }
        Returns: string
      }
      delete_diary: { Args: { p_id: string }; Returns: undefined }
      delete_goal: { Args: { p_id: string }; Returns: undefined }
      delete_plan: { Args: { p_id: string }; Returns: undefined }
      delete_prompt: { Args: { p_id: string }; Returns: undefined }
      delete_todo: { Args: { p_id: string }; Returns: undefined }
      delete_work_log: { Args: { p_id: string }; Returns: undefined }
      get_plan: { Args: { p_id: string }; Returns: Json }
      get_work_log: { Args: { p_id: string }; Returns: Json }
      home_stats: { Args: { p_date?: string }; Returns: Json }
      insert_links: {
        Args: { p_from_id: string; p_from_type: string; p_links: Json }
        Returns: number
      }
      insert_plan: {
        Args: {
          p_code: string
          p_goals: Json
          p_items: Json
          p_period_end: string
          p_period_start: string
          p_raw_md: string
          p_summary: string
          p_title: string
        }
        Returns: {
          code: string
          created_at: string
          id: string
          period_end: string
          period_start: string
          raw_md: string
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_work_log: {
        Args: {
          p_author_name: string
          p_completions: string[]
          p_hours: Json
          p_items: Json
          p_log_date: string
          p_raw_md: string
          p_summary: string
          p_todos: Json
        }
        Returns: {
          author_name: string
          code: string
          created_at: string
          done_count: number
          hours_total: number
          id: string
          log_date: string
          raw_md: string
          summary: string | null
          task_count: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "work_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      issue_mcp_token: {
        Args: { p_label: string; p_owner_email: string; p_token_hash: string }
        Returns: Json
      }
      list_diary: {
        Args: { p_from?: string; p_limit?: number; p_to?: string }
        Returns: {
          body_md: string
          code: string
          created_at: string
          entry_date: string
          id: string
          tags: string[]
          title: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "diary_entries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_goals: {
        Args: { p_status?: string }
        Returns: {
          code: string
          created_at: string
          done_count: number
          id: string
          item_count: number
          note: string
          period_end: string
          period_start: string
          project_id: string
          project_name: string
          project_slug: string
          status: string
          title: string
          updated_at: string
        }[]
      }
      list_mcp_audit: {
        Args: { p_limit?: number }
        Returns: {
          confirmations: Json
          created_at: string
          id: string
          payload: Json
          result: Json | null
          token_label: string
          tool: string
          updated_at: string
          user_confirmation: string
        }[]
        SetofOptions: {
          from: "*"
          to: "mcp_audit"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_plans: {
        Args: never
        Returns: {
          code: string
          created_at: string
          done_count: number
          goal_count: number
          id: string
          item_count: number
          period_end: string
          period_start: string
          project_slugs: string[]
          status: string
          summary: string
          title: string
        }[]
      }
      list_projects: {
        Args: { p_include_archived?: boolean }
        Returns: {
          abbr: string
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort: number
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_prompts: {
        Args: never
        Returns: {
          body: string
          created_at: string
          id: string
          purpose: string | null
          sort: number
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "prompts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_work_logs: {
        Args: {
          p_from?: string
          p_limit?: number
          p_project_slug?: string
          p_to?: string
        }
        Returns: {
          author_name: string
          code: string
          created_at: string
          done_count: number
          hours_total: number
          id: string
          log_date: string
          project_slugs: string[]
          summary: string
          task_count: number
        }[]
      }
      mcp_commit: {
        Args: {
          p_code: string
          p_confirmations?: Json
          p_token: string
          p_tool: string
          p_user_confirmation: string
        }
        Returns: Json
      }
      mcp_prepare: {
        Args: { p_payload: Json; p_token: string; p_tool: string }
        Returns: Json
      }
      mcp_prompts: { Args: { p_token: string }; Returns: Json }
      mcp_read: {
        Args: { p_args?: Json; p_token: string; p_tool: string }
        Returns: Json
      }
      revoke_mcp_tokens: { Args: { p_label?: string }; Returns: number }
      set_log_todo_done: {
        Args: { p_done: boolean; p_id: string }
        Returns: {
          created_at: string
          done: boolean
          due_date: string | null
          goal_id: string | null
          id: string
          log_id: string | null
          needs_decision: boolean
          note: string | null
          plan_item_id: string | null
          project_id: string | null
          seq: number
          start_date: string | null
          text: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "log_todos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_plan_item_status: {
        Args: { p_id: string; p_status: string }
        Returns: {
          code: string
          created_at: string
          done_log_id: string | null
          due_date: string | null
          goal_id: string
          id: string
          plan_id: string
          seq: number
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "plan_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_project_status: {
        Args: { p_id: string; p_status: string }
        Returns: {
          abbr: string
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort: number
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_diary: {
        Args: {
          p_body: string
          p_entry_date: string
          p_id: string
          p_links: Json
          p_tags: string[]
          p_title: string
        }
        Returns: {
          body_md: string
          code: string
          created_at: string
          entry_date: string
          id: string
          tags: string[]
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "diary_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_goal: {
        Args: {
          p_id: string
          p_note: string
          p_period_end: string
          p_period_start: string
          p_project_slug: string
          p_status: string
          p_title: string
        }
        Returns: {
          code: string
          created_at: string
          id: string
          note: string | null
          period_end: string | null
          period_start: string | null
          project_id: string
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "goals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_project: {
        Args: {
          p_abbr: string
          p_description: string
          p_id: string
          p_name: string
          p_slug: string
          p_sort: number
        }
        Returns: {
          abbr: string
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort: number
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_prompt: {
        Args: {
          p_body: string
          p_id: string
          p_purpose: string
          p_title: string
        }
        Returns: {
          body: string
          created_at: string
          id: string
          purpose: string | null
          sort: number
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "prompts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_todo: {
        Args: {
          p_done: boolean
          p_due_date: string
          p_goal_code: string
          p_id: string
          p_needs_decision: boolean
          p_note: string
          p_plan_item_code: string
          p_project_slug: string
          p_start_date?: string
          p_text: string
        }
        Returns: {
          created_at: string
          done: boolean
          due_date: string | null
          goal_id: string | null
          id: string
          log_id: string | null
          needs_decision: boolean
          note: string | null
          plan_item_id: string | null
          project_id: string | null
          seq: number
          start_date: string | null
          text: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "log_todos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
