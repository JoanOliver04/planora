import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { TaskForm } from "@/features/workspace/task-form";
vi.mock("@/app/actions/domain", () => ({ saveTask: vi.fn() }));
const schedules = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "u",
    name: "Normal",
    description: null,
    emoji: "🌿",
    is_archived: false,
    created_at: "",
    updated_at: "",
  },
];
describe("TaskForm", () => {
  it("reveals recurrence and timing controls progressively", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
        timeZone="Europe/Madrid"
      >
        <TaskForm
          open
          onOpenChange={() => {}}
          schedules={schedules}
          categories={[]}
          timezone="Europe/Madrid"
          onSaved={() => {}}
        />
      </NextIntlClientProvider>,
    );
    await user.selectOptions(screen.getByLabelText("Recurrence"), "weekdays");
    expect(
      screen.getByRole("group", { name: "Selected weekdays" }),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Timing"), "time_range");
    expect(screen.getByLabelText("Start time")).toBeInTheDocument();
    expect(screen.getByLabelText("End time")).toBeInTheDocument();
  });
});
