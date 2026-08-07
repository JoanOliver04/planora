import { describe, expect, it } from "vitest";
import {
  filterEvents,
  filterTasks,
  isEventFinished,
  isTaskAvailableInSchedule,
} from "@/lib/workspace/visibility";
import type { Completion, Event, Task } from "@/features/workspace/types";

const event = (values: Partial<Event>): Event =>
  ({
    id: "event",
    event_date: "2026-08-02",
    all_day: false,
    start_time: "10:00:00",
    end_time: "11:00:00",
    ...values,
  }) as Event;
const task = (values: Partial<Task>): Task =>
  ({
    id: "task",
    recurrence_type: "once",
    archived_at: null,
    ...values,
  }) as Task;
const completion = (taskId: string) => ({ task_id: taskId }) as Completion;

describe("event visibility", () => {
  const now = new Date("2026-08-02T09:30:00Z");

  it("keeps all-day events active until the local day ends", () => {
    expect(
      isEventFinished(event({ all_day: true }), "Europe/Madrid", now),
    ).toBe(false);
  });

  it("marks timed events as finished after their end time", () => {
    expect(isEventFinished(event({}), "Europe/Madrid", now)).toBe(true);
  });

  it("separates upcoming and finished events", () => {
    const events = [
      event({ id: "past" }),
      event({ id: "future", start_time: "12:00:00", end_time: "13:00:00" }),
    ];
    expect(filterEvents(events, "active", "Europe/Madrid", now)).toHaveLength(
      1,
    );
    expect(filterEvents(events, "finished", "Europe/Madrid", now)[0].id).toBe(
      "past",
    );
  });
});

describe("task visibility", () => {
  const tasks = [
    task({ id: "open" }),
    task({ id: "done" }),
    task({ id: "habit", recurrence_type: "daily" }),
    task({ id: "archived", archived_at: "2026-08-01T00:00:00Z" }),
  ];
  const completions = [completion("done"), completion("habit")];

  it("hides completed one-time tasks from the default view", () => {
    expect(
      filterTasks(tasks, completions, "active").map((item) => item.id),
    ).toEqual(["open", "habit"]);
  });

  it("combines active schedule tasks and globals only", () => {
    expect(
      isTaskAvailableInSchedule(
        task({ scope: "schedule", schedule_id: "summer", is_active: true }),
        "summer",
      ),
    ).toBe(true);
    expect(
      isTaskAvailableInSchedule(
        task({ scope: "schedule", schedule_id: "winter", is_active: true }),
        "summer",
      ),
    ).toBe(false);
    expect(
      isTaskAvailableInSchedule(
        task({ scope: "global", schedule_id: null, is_active: true }),
        null,
      ),
    ).toBe(true);
    expect(
      isTaskAvailableInSchedule(
        task({ scope: "global", schedule_id: "summer", is_active: true }),
        "summer",
      ),
    ).toBe(false);
  });

  it("shows completed one-time and archived tasks in their filters", () => {
    expect(
      filterTasks(tasks, completions, "completed").map((item) => item.id),
    ).toEqual(["done"]);
    expect(filterTasks(tasks, completions, "archived")[0].id).toBe("archived");
  });
});
