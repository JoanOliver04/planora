import { cleanup, render, screen } from "@testing-library/react";
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

describe("TaskCard completion", () => {
  it("exposes a start-focus action when provided", async () => {
    const user = userEvent.setup();
    const onStartFocus = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <TaskCard
          task={task}
          categories={[]}
          onStartFocus={onStartFocus}
        />
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
});
