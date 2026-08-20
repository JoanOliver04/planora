import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { TaskForm } from "@/features/workspace/task-form";
vi.mock("@/app/actions/domain", () => ({ saveTask: vi.fn() }));
afterEach(cleanup);
const schedules = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "u",
    name: "Normal",
    description: null,
    emoji: "🌿",
    is_archived: false,
    sort_order: 0,
    created_at: "",
    updated_at: "",
  },
];
describe("TaskForm", () => {
  it("allows creating an ongoing task without date inputs", () => {
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
          onSaved={async () => {}}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText("Start date (optional)")).not.toBeRequired();
    expect(screen.getByLabelText("Start date (optional)")).toHaveValue("");
    expect(screen.getByLabelText("End date (optional)")).not.toBeRequired();
    expect(screen.getByLabelText("End date (optional)")).toHaveValue("");
    expect(
      screen.getByRole("checkbox", { name: /allow focus sessions/i }),
    ).not.toBeChecked();
  });

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
          onSaved={async () => {}}
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

  it("reveals an accessible recommended preset selector only for Focus tasks", async () => {
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
          focusPresets={[
            {
              id: "22222222-2222-4222-8222-222222222222",
              name: "Roadmap",
              emoji: "💻",
              archived_at: null,
            },
          ]}
          timezone="Europe/Madrid"
          onSaved={async () => {}}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.queryByRole("combobox", { name: /recommended focus preset/i }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", { name: /allow focus sessions/i }),
    );
    const selector = screen.getByRole("combobox", {
      name: /recommended focus preset/i,
    });
    expect(selector).toHaveValue("");
    await user.selectOptions(selector, "22222222-2222-4222-8222-222222222222");
    expect(selector).toHaveValue("22222222-2222-4222-8222-222222222222");
  });
});
