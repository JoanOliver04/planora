import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { TaskCard } from "@/features/workspace/task-views";
import type { Task } from "@/features/workspace/types";

vi.mock("@/app/actions/domain", () => ({
  duplicateTask: vi.fn(),
  saveTask: vi.fn(),
  setTaskArchived: vi.fn(),
}));

vi.mock("@/features/focus/actions", () => ({
  startFocusSessionAction: vi.fn(),
  transitionFocusSessionAction: vi.fn(),
  updateFocusSessionMetadataAction: vi.fn(),
  completeLinkedTaskFromFocusAction: vi.fn(),
  getTaskFocusStatsAction: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tasks",
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const task = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Read",
  emoji: "📖",
  category_id: null,
  recurrence_config: { type: "daily" },
  recurrence_type: "daily",
  time_mode: "anytime",
  day_part: null,
  start_time: null,
} as unknown as Task;

function renderCard(onToggle: () => Promise<boolean>) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
      timeZone="Europe/Madrid"
    >
      <TaskCard task={task} categories={[]} onToggle={onToggle} />
    </NextIntlClientProvider>,
  );
}

function renderTask(overrides: Partial<Task>, completed = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TaskCard
        task={{ ...task, ...overrides }}
        categories={[]}
        completion={
          completed
            ? ({ id: "22222222-2222-4222-8222-222222222222" } as never)
            : undefined
        }
      />
    </NextIntlClientProvider>,
  );
}

describe("TaskCard timing", () => {
  it("shows only the start for an exact time", () => {
    renderTask({ time_mode: "specific_time", start_time: "07:30:00" });

    expect(screen.getByText("07:30")).toBeVisible();
  });

  it("shows the full time range, including on completed tasks", () => {
    renderTask(
      {
        time_mode: "time_range",
        start_time: "08:30:00",
        end_time: "10:30:00",
      },
      true,
    );

    expect(screen.getByText("08:30–10:30")).toBeVisible();
  });

  it("falls back to the start when a time range has no end", () => {
    renderTask({
      time_mode: "time_range",
      start_time: "08:30:00",
      end_time: null,
    });

    expect(screen.getByText("08:30")).toBeVisible();
  });
});

describe("TaskCard completion", () => {
  it("exposes a start-focus action when provided", async () => {
    const user = userEvent.setup();
    const onStartFocus = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <TaskCard task={task} categories={[]} onStartFocus={onStartFocus} />
      </NextIntlClientProvider>,
    );
    await user.click(
      screen.getByRole("button", { name: /start focus: read/i }),
    );
    expect(onStartFocus).toHaveBeenCalledTimes(1);
  });

  it("opens the task note in a dialog", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <TaskCard
          task={{ ...task, description: "Remember chapter three" }}
          categories={[]}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "View note" }));

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Remember chapter three",
    );
  });

  it("rolls back the optimistic state when persistence fails", async () => {
    const user = userEvent.setup();
    renderCard(vi.fn().mockResolvedValue(false));
    const button = screen.getByRole("button", { name: /mark as complete/i });

    await user.click(button);

    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("prevents duplicate writes while a completion is pending", async () => {
    const user = userEvent.setup();
    let resolve!: (value: boolean) => void;
    const onToggle = vi.fn(
      () => new Promise<boolean>((done) => (resolve = done)),
    );
    renderCard(onToggle);
    const button = screen.getByRole("button", { name: /mark as complete/i });

    await user.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(onToggle).toHaveBeenCalledOnce();
    resolve(true);
  });

  it("resets optimistic completion when navigating to another day", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn().mockResolvedValue(true);
    const view = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <TaskCard
          task={task}
          categories={[]}
          occurrenceDate="2026-08-13"
          onToggle={onToggle}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /mark as complete/i }));
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");

    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <TaskCard
          task={task}
          categories={[]}
          occurrenceDate="2026-08-14"
          onToggle={onToggle}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );
  });
});
