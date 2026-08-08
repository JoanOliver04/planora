export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          locale: "es" | "en";
          timezone: string;
          theme: "light" | "dark" | "system";
          week_starts_on: number;
          active_schedule_id: string | null;
          day_part_settings: Json;
          preferences: Json;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      schedules: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          emoji: string | null;
          is_archived: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          colour: string;
          emoji: string | null;
          schedule_id?: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          schedule_id: string | null;
          scope: "schedule" | "global";
          category_id: string | null;
          title: string;
          description: string | null;
          emoji: string | null;
          focus_enabled: boolean;
          task_kind: "one_time" | "habit";
          recurrence_type:
            "once" | "daily" | "weekdays" | "times_per_week" | "interval";
          recurrence_config: Json;
          time_mode: "anytime" | "day_part" | "specific_time" | "time_range";
          day_part: "morning" | "afternoon" | "night" | null;
          start_time: string | null;
          end_time: string | null;
          start_date: string;
          end_date: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      task_completions: {
        Row: {
          id: string;
          user_id: string;
          task_id: string;
          occurrence_date: string;
          completed_at: string;
          task_snapshot: Json;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          user_id: string;
          schedule_id: string | null;
          category_id: string | null;
          title: string;
          description: string | null;
          emoji: string | null;
          event_date: string;
          all_day: boolean;
          start_time: string | null;
          end_time: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      schedule_templates: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          emoji: string | null;
          content: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          emoji?: string | null;
          content: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          emoji?: string | null;
          content?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      template_imports: {
        Row: {
          request_id: string;
          user_id: string;
          template_key: string;
          schedule_id: string | null;
          scope: "schedule" | "global";
          created_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      reminders: {
        Row: {
          id: string;
          user_id: string;
          task_id: string | null;
          event_id: string | null;
          kind: "relative" | "daily_summary" | "alarm";
          title: string | null;
          minutes_before: number | null;
          recurrence: "once" | "daily" | "weekly";
          time_of_day: string | null;
          timezone: string;
          next_trigger_at: string;
          snoozed_until: string | null;
          enabled: boolean;
          delivery_status:
            | "pending"
            | "delivered"
            | "permission_denied"
            | "failed"
            | "snoozed";
          last_delivered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      focus_presets: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          emoji: string | null;
          intention: string | null;
          mode: "countdown" | "stopwatch" | "cycles";
          focus_duration_sec: number | null;
          short_break_sec: number | null;
          long_break_sec: number | null;
          cycles_before_long_break: number | null;
          target_cycles: number | null;
          auto_start_breaks: boolean;
          auto_start_focus: boolean;
          sound_enabled: boolean;
          vibration_enabled: boolean;
          notify_on_phase_end: boolean;
          complete_task_on_session_end: boolean;
          keep_screen_awake: boolean;
          prefer_fullscreen: boolean;
          segments: Json;
          is_favorite: boolean;
          sort_order: number;
          default_category_id: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      focus_sessions: {
        Row: {
          id: string;
          user_id: string;
          status: "running" | "paused" | "on_break" | "completed" | "cancelled";
          mode: "countdown" | "stopwatch" | "cycles";
          title: string | null;
          preset_id: string | null;
          task_id: string | null;
          category_id: string | null;
          schedule_id: string | null;
          occurrence_date: string | null;
          planned_focus_sec: number | null;
          focus_sec: number;
          paused_sec: number;
          break_sec: number;
          current_phase_kind:
            "focus" | "short_break" | "long_break" | "pause" | null;
          current_cycle: number;
          config: Json;
          link_snapshot: Json;
          started_at: string;
          ended_at: string | null;
          notes: string | null;
          distractions: Json;
          subjective_focus: number | null;
          subjective_energy: number | null;
          complete_task_on_end: boolean;
          task_completion_applied: boolean;
          revision: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      focus_intervals: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          kind: "focus" | "short_break" | "long_break" | "pause";
          sequence: number;
          cycle_index: number | null;
          started_at: string;
          ended_at: string | null;
          planned_duration_sec: number | null;
          created_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      focus_goals: {
        Row: {
          id: string;
          user_id: string;
          period: "weekly";
          target_focus_sec: number;
          metric: "focus_seconds" | "sessions" | "active_days";
          target_value: number;
          scope: "global" | "category" | "preset";
          category_id: string | null;
          preset_id: string | null;
          start_date: string;
          considered_days: number[];
          is_primary: boolean;
          sort_order: number;
          timezone: string;
          week_starts_on: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      delete_schedule: {
        Args: { target_schedule_id: string };
        Returns: string | null;
      };
      delete_archived_task: {
        Args: { target_task_id: string };
        Returns: boolean;
      };
      restore_planora_backup: {
        Args: { backup_data: Json };
        Returns: Json;
      };
      reorder_resources: {
        Args: { resource_type: string; ordered_ids: string[] };
        Returns: undefined;
      };
      import_schedule_template: {
        Args: {
          request_id: string;
          template_key: string;
          template_content: Json;
          include_categories: boolean;
          include_tasks: boolean;
        };
        Returns: string;
      };
      save_personal_template: {
        Args: { source_schedule_id: string; template_name: string };
        Returns: string;
      };
      complete_guided_onboarding: {
        Args: {
          goal: string;
          schedule_name: string;
          detected_timezone: string;
          week_start: number;
          accent_colour: string;
          skip_setup?: boolean;
        };
        Returns: string;
      };
      complete_onboarding: {
        Args: { include_starters: boolean; detected_timezone: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
