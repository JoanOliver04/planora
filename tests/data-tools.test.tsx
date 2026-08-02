import {
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
import { DataTools } from "@/features/backup/data-tools";
import { createBackup, type BackupData } from "@/features/backup/format";
import { restoreBackup } from "@/app/actions/domain";

vi.mock("@/app/actions/domain", () => ({
  restoreBackup: vi.fn(),
}));

const data: BackupData = {
  profile: { timezone: "Europe/Madrid" },
  schedules: [],
  categories: [],
  tasks: [
    {
      id: "task-1",
      title: "Focus",
      start_date: "2026-08-01",
      is_active: true,
    },
  ],
  events: [],
  completions: [],
  templates: [],
  reminders: [],
};

function renderTools() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DataTools data={data} locale="en" timezone="Europe/Madrid" />
    </NextIntlClientProvider>,
  );
}

describe("DataTools", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:planora"),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("presents distinct exports and keeps restore disabled initially", () => {
    renderTools();

    expect(
      screen.getByRole("heading", { level: 1, name: "Your data" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Download JSON" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Download ICS" })).toBeVisible();
    expect(screen.getByLabelText("Select a Planora backup")).toHaveAttribute(
      "accept",
      "application/json,.json",
    );
    expect(
      screen.getByRole("button", { name: "Restore backup" }),
    ).toBeDisabled();
  });

  it("rejects an incompatible file without enabling restore", async () => {
    renderTools();
    const file = new File(["not-json"], "notes.txt", {
      type: "text/plain",
    });

    fireEvent.change(screen.getByLabelText("Select a Planora backup"), {
      target: { files: [file] },
    });

    expect(
      await screen.findByText(
        "This file is not a JSON backup compatible with Planora.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Restore backup" }),
    ).toBeDisabled();
  });

  it("validates a backup and explains restore before submitting", async () => {
    const user = userEvent.setup();
    renderTools();
    const file = new File(
      [JSON.stringify(createBackup(data))],
      "planora-backup-v1.json",
      { type: "application/json" },
    );
    Object.defineProperty(file, "text", {
      value: vi.fn(async () => JSON.stringify(createBackup(data))),
    });

    fireEvent.change(screen.getByLabelText("Select a Planora backup"), {
      target: { files: [file] },
    });

    expect(
      await screen.findByText(
        "Compatible backup. Review its contents before restoring.",
      ),
    ).toBeVisible();
    expect(screen.getByText("planora-backup-v1.json")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Restore backup" }));

    expect(screen.getByRole("alertdialog")).toBeVisible();
    expect(screen.getByText(/will add compatible copies/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(restoreBackup).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Restore backup" }));
    const confirmation = screen.getByRole("alertdialog");
    await user.click(
      within(confirmation).getByRole("button", { name: "Restore backup" }),
    );

    await waitFor(() => expect(restoreBackup).toHaveBeenCalledOnce());
    expect(
      await screen.findByText(
        "Restore complete. Imported reminders are disabled.",
      ),
    ).toBeVisible();
  });

  it("downloads the full JSON backup through the existing browser flow", async () => {
    const user = userEvent.setup();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    renderTools();

    await user.click(screen.getByRole("button", { name: "Download JSON" }));

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
    expect(click).toHaveBeenCalledOnce();
    expect(await screen.findByText("Your download is ready.")).toBeVisible();
  });
});
