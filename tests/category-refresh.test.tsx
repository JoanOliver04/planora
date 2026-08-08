import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoriesView } from "@/features/workspace/resource-views";
import type { WorkspaceData } from "@/features/workspace/types";
import messages from "@/messages/en.json";

const actionMocks = vi.hoisted(() => ({
  saveCategory: vi.fn(),
  reorderResources: vi.fn(),
}));

vi.mock("@/i18n/routing", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/actions/domain", () => ({
  deleteCategory: vi.fn(),
  deleteEmptySchedule: vi.fn(),
  deleteEvent: vi.fn(),
  duplicateSchedule: vi.fn(),
  reorderResources: actionMocks.reorderResources,
  saveCategory: actionMocks.saveCategory,
  saveEvent: vi.fn(),
  saveSchedule: vi.fn(),
  setActiveSchedule: vi.fn(),
  setScheduleArchived: vi.fn(),
  updateProfile: vi.fn(),
}));

const category = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "user-1",
  name: "Work",
  colour: "#7d9d74",
  emoji: null,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const initialData = {
  user: { id: "user-1", email: "user@example.com" },
  profile: {
    id: "user-1",
    display_name: "User",
    avatar_url: null,
    locale: "en",
    timezone: "Europe/Madrid",
    theme: "system",
    week_starts_on: 1,
    active_schedule_id: null,
    day_part_settings: {},
    preferences: {},
    onboarding_completed: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  schedules: [],
  categories: [category],
  tasks: [],
  events: [],
  completions: [],
} satisfies WorkspaceData;

function CategoryHarness({ reloadSpy }: { reloadSpy: () => void }) {
  const [data, setData] = useState<WorkspaceData>(initialData);
  const reload = async () => {
    reloadSpy();
    setData((current) => ({
      ...current,
      categories: current.categories.map((item) => ({
        ...item,
        emoji: "🎯",
      })),
    }));
  };

  return <CategoriesView data={data} reload={reload} />;
}

describe("CategoriesView", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows an edited emoji immediately after saving", async () => {
    const user = userEvent.setup();
    const reloadSpy = vi.fn();
    actionMocks.saveCategory.mockResolvedValue(undefined);

    render(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
        timeZone="Europe/Madrid"
      >
        <CategoryHarness reloadSpy={reloadSpy} />
      </NextIntlClientProvider>,
    );

    const row = screen.getByText("Work").closest(".settings-row");
    expect(row).not.toBeNull();
    const rowButtons = within(row as HTMLElement).getAllByRole("button");
    await user.click(rowButtons[0]);
    await user.type(screen.getByLabelText("Emoji"), "🎯");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(reloadSpy).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByText("🎯")).toBeInTheDocument());
    expect(actionMocks.saveCategory).toHaveBeenCalledWith(
      expect.objectContaining({ emoji: "🎯", name: "Work" }),
    );
  });

  it("offers an explicit cancel action and names row actions", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
        timeZone="Europe/Madrid"
      >
        <CategoryHarness reloadSpy={vi.fn()} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Edit Work" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete Work" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("dialog", { name: "Category" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Category" })).toBeNull();
  });
});
