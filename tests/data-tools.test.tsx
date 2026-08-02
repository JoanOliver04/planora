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
import { createBackup, MAX_BACKUP_BYTES } from "@/features/backup/format";
import { restoreBackup } from "@/app/actions/domain";
import { backupFixture } from "./backup-fixture";

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/actions/domain", () => ({ restoreBackup: vi.fn() }));

const data = backupFixture();

function renderTools() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DataTools data={data} locale="en" timezone="Europe/Madrid" />
    </NextIntlClientProvider>,
  );
}

function backupFile() {
  const content = JSON.stringify(createBackup(data));
  const file = new File([content], "planora-backup-v2.json", {
    type: "application/json",
  });
  Object.defineProperty(file, "text", { value: vi.fn(async () => content) });
  return file;
}

async function selectValidBackup() {
  fireEvent.change(screen.getByLabelText("Select a Planora backup"), {
    target: { files: [backupFile()] },
  });
  await screen.findByText(
    "Compatible backup. Review its contents before restoring.",
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
    vi.mocked(restoreBackup).mockResolvedValue({});
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
    expect(
      screen.getByRole("button", { name: "Restore backup" }),
    ).toBeDisabled();
  });

  it("rejects corrupt, incompatible and oversized files", async () => {
    renderTools();
    const file = new File(["not-json"], "notes.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: vi.fn(async () => "not-json"),
    });
    fireEvent.change(screen.getByLabelText("Select a Planora backup"), {
      target: { files: [file] },
    });
    expect(await screen.findByText(/invalid, too large/i)).toBeVisible();

    const oversized = backupFile();
    Object.defineProperty(oversized, "size", { value: MAX_BACKUP_BYTES + 1 });
    fireEvent.change(screen.getByLabelText("Select a Planora backup"), {
      target: { files: [oversized] },
    });
    expect(await screen.findByText(/invalid, too large/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Restore backup" }),
    ).toBeDisabled();
  });

  it("shows replacement metadata and cancels without writing", async () => {
    const user = userEvent.setup();
    renderTools();
    await selectValidBackup();
    await user.click(screen.getByRole("button", { name: "Restore backup" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("planora-backup-v2.json")).toBeVisible();
    expect(within(dialog).getByText("Format version")).toBeVisible();
    expect(within(dialog).getByText(/will be removed/i)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(restoreBackup).not.toHaveBeenCalled();
  });

  it("downloads a safety copy and restores exactly once on a double click", async () => {
    const user = userEvent.setup();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    renderTools();
    await selectValidBackup();
    await user.click(screen.getByRole("button", { name: "Restore backup" }));
    const confirm = within(screen.getByRole("alertdialog")).getByRole(
      "button",
      {
        name: "Restore and replace data",
      },
    );
    await user.dblClick(confirm);
    await waitFor(() => expect(restoreBackup).toHaveBeenCalledOnce());
    expect(click).toHaveBeenCalledOnce();
    expect(
      await screen.findByText(/previous data was replaced/i),
    ).toBeVisible();
  });

  it("reports transactional rollback failures clearly", async () => {
    const user = userEvent.setup();
    vi.mocked(restoreBackup).mockRejectedValue(new Error("insert failed"));
    renderTools();
    await selectValidBackup();
    await user.click(screen.getByRole("button", { name: "Restore backup" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Restore and replace data",
      }),
    );
    expect(
      await screen.findByText(/rolled back the transaction/i),
    ).toBeVisible();
  });

  it("downloads the full JSON backup in version two format", async () => {
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
