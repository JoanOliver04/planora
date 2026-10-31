import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { QuickTaskCapture } from "@/features/workspace/quick-task-capture";
import type { WorkspaceData } from "@/features/workspace/types";
import { saveTask } from "@/app/actions/domain";
import * as dates from "@/lib/dates/timezone";

vi.mock("@/app/actions/domain", () => ({ saveTask: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const active = "22222222-2222-4222-8222-222222222222";
const data = {
  user: { id: "test-user" },
  profile: { active_schedule_id: active, timezone: "Europe/Madrid" },
  schedules: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Other",
      is_archived: false,
    },
    { id: active, name: "Active routine", is_archived: false },
  ],
  categories: [],
  focusPresets: [],
} as unknown as WorkspaceData;
let online = true;
function view(onSaved = vi.fn().mockResolvedValue(undefined)) {
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
      timeZone="Europe/Madrid"
    >
      <QuickTaskCapture data={data} onSaved={onSaved} />
    </NextIntlClientProvider>,
  );
  return {
    input: screen.getByRole("textbox", { name: "Quick capture" }),
    onSaved,
  };
}
beforeEach(() => {
  online = true;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  vi.mocked(saveTask)
    .mockReset()
    .mockResolvedValue({ ok: true, taskId: "created-task" });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("QuickTaskCapture", () => {
  it("requires a fresh date review when an open form crosses midnight", async () => {
    const calendar = vi.spyOn(dates, "localDate").mockReturnValue("2026-12-31");
    const user = userEvent.setup(),
      { input } = view();
    await user.type(input, "Read tomorrow");
    calendar.mockReturnValue("2027-01-01");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The day has changed");
    expect(saveTask).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(saveTask).toHaveBeenCalledOnce());
    expect(saveTask).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: "2027-01-02" }),
    );
  });
  it("saves edited advanced values while preserving the interpreted recurrence and schedule", async () => {
    const user = userEvent.setup(),
      { input, onSaved } = view();
    await user.type(input, "Piano every Monday and Wednesday at 18:00");
    await user.click(screen.getByRole("button", { name: "More options" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.clear(dialog.getByRole("textbox", { name: "Title" }));
    await user.type(
      dialog.getByRole("textbox", { name: "Title" }),
      "Practice piano",
    );
    await user.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(saveTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Practice piano",
        scheduleId: active,
        recurrence: { type: "weekdays", weekdays: [1, 3] },
        timing: { mode: "specific_time", startTime: "18:00" },
      }),
      undefined,
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(input).toHaveValue("");
  });
  it("previews the detected plan, saves in the active schedule and refocuses after success", async () => {
    const user = userEvent.setup(),
      { input, onSaved } = view();
    await user.type(input, "Piano every Monday and Wednesday at 18:00");
    expect(screen.getByText("Piano", { exact: true })).toBeVisible();
    expect(screen.getByText("Schedule: Active routine")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("18:00");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(saveTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Piano",
        scheduleId: active,
        scope: "schedule",
        recurrence: { type: "weekdays", weekdays: [1, 3] },
        timing: { mode: "specific_time", startTime: "18:00" },
      }),
    );
    await waitFor(() => expect(input).toHaveValue(""));
    await waitFor(() => expect(input).toHaveFocus());
  });
  it("keeps the text when saving fails", async () => {
    vi.mocked(saveTask).mockResolvedValue({
      ok: false,
      error: { code: "DATABASE_ERROR", message: "Database error" },
    });
    const user = userEvent.setup(),
      { input, onSaved } = view();
    await user.type(input, "Read tomorrow");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your text is still here",
    );
    expect(input).toHaveValue("Read tomorrow");
    expect(onSaved).not.toHaveBeenCalled();
  });
  it("does not invite a second creation when the task saved but list refresh failed", async () => {
    const user = userEvent.setup(),
      { input } = view(
        vi.fn().mockRejectedValue(new Error("Refresh unavailable")),
      );
    await user.type(input, "Read tomorrow");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The task was saved",
    );
    expect(input).toHaveValue("");
    expect(saveTask).toHaveBeenCalledOnce();
  });
  it("blocks duplicate submissions while a request is in flight", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof saveTask>>) => void;
    vi.mocked(saveTask).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { input } = view();
    fireEvent.change(input, { target: { value: "Read tomorrow" } });
    const form = input.closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(saveTask).toHaveBeenCalledOnce();
    await act(async () => {
      resolve({ ok: true, taskId: "created-task" });
    });
  });
  it("offers literal text and prevents invalid interpretations from being saved", async () => {
    const user = userEvent.setup(),
      { input } = view();
    await user.type(input, "Read at 25:00");
    expect(screen.getByRole("alert")).toHaveTextContent("Check the time");
    expect(screen.getByRole("button", { name: "Create task" })).toBeDisabled();
    await user.click(
      screen.getByRole("checkbox", { name: "Detect dates and repetition" }),
    );
    await user.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(saveTask).toHaveBeenCalledOnce());
    expect(saveTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Read at 25:00",
        recurrence: { type: "once" },
        timing: { mode: "anytime" },
      }),
    );
  });
  it("keeps an offline draft until connectivity returns", async () => {
    const user = userEvent.setup(),
      { input } = view();
    await user.type(input, "Read tomorrow");
    online = false;
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("button", { name: "Create task" })).toBeDisabled();
    expect(input).toHaveValue("Read tomorrow");
    expect(saveTask).not.toHaveBeenCalled();
    online = true;
    act(() => window.dispatchEvent(new Event("online")));
    expect(screen.getByRole("button", { name: "Create task" })).toBeEnabled();
  });
  it("opens advanced options with the interpreted values and returns to the intact draft on cancel", async () => {
    const user = userEvent.setup(),
      { input } = view();
    await user.type(input, "Piano every Monday and Wednesday at 18:00");
    await user.click(screen.getByRole("button", { name: "More options" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("textbox", { name: "Title" })).toHaveValue("Piano");
    expect(dialog.getByLabelText("Schedule", { exact: true })).toHaveValue(
      active,
    );
    expect(dialog.getByLabelText("Recurrence")).toHaveValue("weekdays");
    expect(dialog.getByLabelText("Start time")).toHaveValue("18:00");
    expect(dialog.getByRole("checkbox", { name: "M" })).toBeChecked();
    expect(dialog.getByRole("checkbox", { name: "W" })).toBeChecked();
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(input).toHaveValue("Piano every Monday and Wednesday at 18:00");
    expect(screen.getByRole("button", { name: "More options" })).toHaveFocus();
    expect(saveTask).not.toHaveBeenCalled();
  });
});
