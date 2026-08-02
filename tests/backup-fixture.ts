import type { BackupData } from "@/features/backup/format";

export const backupIds = {
  schedule: "11111111-1111-4111-8111-111111111111",
  category: "22222222-2222-4222-8222-222222222222",
  task: "33333333-3333-4333-8333-333333333333",
  event: "44444444-4444-4444-8444-444444444444",
  completion: "55555555-5555-4555-8555-555555555555",
  template: "66666666-6666-4666-8666-666666666666",
  reminder: "77777777-7777-4777-8777-777777777777",
  alarm: "88888888-8888-4888-8888-888888888888",
};

export function backupFixture(): BackupData {
  return {
    profile: {
      locale: "en",
      timezone: "Europe/Madrid",
      theme: "system",
      week_starts_on: 1,
      active_schedule_id: backupIds.schedule,
      day_part_settings: {},
      preferences: {},
      onboarding_completed: true,
    },
    schedules: [
      {
        id: backupIds.schedule,
        name: "Normal",
        description: null,
        emoji: "🌿",
        is_archived: false,
        sort_order: 0,
      },
    ],
    categories: [
      {
        id: backupIds.category,
        name: "Work",
        colour: "#7D9D74",
        emoji: "💼",
        sort_order: 0,
      },
    ],
    tasks: [
      {
        id: backupIds.task,
        schedule_id: backupIds.schedule,
        category_id: backupIds.category,
        title: "Focus deeply",
        description: null,
        emoji: "🎯",
        task_kind: "one_time",
        recurrence_type: "once",
        recurrence_config: {},
        time_mode: "anytime",
        day_part: null,
        start_time: null,
        end_time: null,
        start_date: "2026-08-01",
        end_date: null,
        is_active: true,
        sort_order: 0,
        archived_at: null,
      },
    ],
    events: [
      {
        id: backupIds.event,
        schedule_id: backupIds.schedule,
        category_id: backupIds.category,
        title: "Review plan",
        description: null,
        emoji: "📅",
        event_date: "2026-08-02",
        all_day: true,
        start_time: null,
        end_time: null,
      },
    ],
    completions: [
      {
        id: backupIds.completion,
        task_id: backupIds.task,
        occurrence_date: "2026-08-01",
        completed_at: "2026-08-01T10:00:00.000Z",
        task_snapshot: { title: "Focus deeply" },
      },
    ],
    templates: [
      {
        id: backupIds.template,
        name: "Deep work",
        emoji: "🎯",
        content: { tasks: [] },
      },
    ],
    reminders: [
      {
        id: backupIds.reminder,
        task_id: backupIds.task,
        event_id: null,
        kind: "relative",
        title: null,
        minutes_before: 30,
        recurrence: "once",
        time_of_day: null,
        timezone: "Europe/Madrid",
        next_trigger_at: "2026-08-01T09:30:00.000Z",
      },
      {
        id: backupIds.alarm,
        task_id: null,
        event_id: null,
        kind: "alarm",
        title: "Match",
        minutes_before: null,
        recurrence: "once",
        time_of_day: null,
        timezone: "Europe/Madrid",
        next_trigger_at: "2026-08-01T19:30:00.000Z",
      },
    ],
  };
}
