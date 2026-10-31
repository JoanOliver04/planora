import { describe, expect, it } from "vitest";
import { parseQuickTask } from "@/lib/workspace/quick-task";
import { taskSchema } from "@/lib/validation/task";

const today = "2026-10-31"; // Saturday, immediately before a month boundary.
describe("quick task interpretation", () => {
  it.each([
    ["Comprar pan mañana a las 18:00", "Comprar pan", "2026-11-01", "18:00"],
    ["Read tomorrow at 6 pm", "Read", "2026-11-01", "18:00"],
    ["Read at 6:30 pm tomorrow", "Read", "2026-11-01", "18:30"],
    ["Leer pasado mañana a la 1", "Leer", "2026-11-02", "01:00"],
    ["Study day after tomorrow at 12 am", "Study", "2026-11-02", "00:00"],
    ["Study today at 12 pm", "Study", today, "12:00"],
    ["Study on Monday at 09:15", "Study", "2026-11-02", "09:15"],
    ["Leer el sábado a las 00:00", "Leer", today, "00:00"],
    ["Call on 2027-01-01 at 23:59", "Call", "2027-01-01", "23:59"],
  ])(
    "interprets %s with local calendar dates",
    (raw, title, startDate, startTime) => {
      expect(parseQuickTask(raw, today)).toEqual({
        detected: true,
        values: {
          title,
          startDate,
          recurrence: { type: "once" },
          timing: { mode: "specific_time", startTime },
        },
      });
    },
  );
  it.each([
    "Piano lunes y miércoles a las 18:00",
    "Piano every Monday and Wednesday at 18:00",
    "Piano los lunes, miércoles a las 18",
    "Piano lunes, y miércoles a las 18:00",
  ])("recognizes bilingual weekday lists: %s", (raw) => {
    expect(parseQuickTask(raw, today)).toEqual({
      detected: true,
      values: {
        title: "Piano",
        startDate: "2026-11-02",
        recurrence: { type: "weekdays", weekdays: [1, 3] },
        timing: { mode: "specific_time", startTime: "18:00" },
      },
    });
  });
  it.each(["Walk every Monday", "Walk Mondays", "Walk cada lunes"])(
    "distinguishes a weekly habit: %s",
    (raw) => {
      expect(parseQuickTask(raw, today).values.recurrence).toEqual({
        type: "weekdays",
        weekdays: [1],
      });
    },
  );
  it.each([
    "Leer cada día",
    "Leer todos los dias",
    "Read daily",
    "Read every day",
  ])("recognizes daily recurrence: %s", (raw) => {
    expect(parseQuickTask(raw, today).values).toMatchObject({
      recurrence: { type: "daily" },
      startDate: today,
    });
  });
  it.each([
    "Piano entre semana",
    "Piano de lunes a viernes",
    "Piano on weekdays",
  ])("starts weekday-only habits on an actual weekday: %s", (raw) => {
    expect(parseQuickTask(raw, today).values).toMatchObject({
      startDate: "2026-11-02",
      recurrence: { type: "weekdays", weekdays: [1, 2, 3, 4, 5] },
    });
  });
  it.each([
    "Call at 24:00",
    "Call at 25",
    "Call at 12:60",
    "Call at 0 pm",
    "Call at 13 am",
    "Call at 8 at 9",
  ])("blocks invalid or conflicting times: %s", (raw) => {
    expect(parseQuickTask(raw, today).issue).toBe("invalidTime");
  });
  it.each([
    "Read 2026-02-30",
    "Read 2026-13-01",
    "Read 2025-02-29",
    "Read 0000-01-01",
  ])("blocks impossible dates: %s", (raw) => {
    expect(parseQuickTask(raw, today).issue).toBe("invalidDate");
  });
  it("handles leap years and year changes without device-timezone arithmetic", () => {
    expect(parseQuickTask("Read tomorrow", "2028-02-28").values.startDate).toBe(
      "2028-02-29",
    );
    expect(parseQuickTask("Read tomorrow", "2026-12-31").values.startDate).toBe(
      "2027-01-01",
    );
    expect(parseQuickTask("Read tomorrow", "2026-03-28").values.startDate).toBe(
      "2026-03-29",
    );
  });
  it("preserves unsupported text and offers literal mode for ambiguous titles", () => {
    expect(parseQuickTask("Notas sobre mañana y ayer", today)).toMatchObject({
      detected: false,
      values: { title: "Notas sobre mañana y ayer" },
    });
    expect(parseQuickTask("Read tomorrow at 25", today, false)).toEqual({
      detected: false,
      values: {
        title: "Read tomorrow at 25",
        startDate: today,
        recurrence: { type: "once" },
        timing: { mode: "anytime" },
      },
    });
  });
  it("does not create a task with an empty or oversized interpreted title", () => {
    expect(parseQuickTask("mañana a las 18", today).issue).toBe("emptyTitle");
    expect(parseQuickTask("x".repeat(141), today).issue).toBe("tooLong");
    expect(parseQuickTask("x".repeat(281), today).issue).toBe("tooLong");
    expect(
      parseQuickTask(`${"x".repeat(140)} mañana`, today).issue,
    ).toBeUndefined();
  });
  it("keeps rendered content as plain text and produces server-valid values", () => {
    const parsed = parseQuickTask(
      "<script>alert(1)</script> mañana a las 18",
      today,
    );
    expect(parsed.values.title).toBe("<script>alert(1)</script>");
    expect(
      taskSchema.safeParse({
        ...parsed.values,
        scheduleId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(true);
  });
});
