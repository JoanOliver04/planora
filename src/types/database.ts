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
          schedule_id: string;
          category_id: string | null;
          title: string;
          description: string | null;
          emoji: string | null;
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
          schedule_id: string;
          created_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
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
