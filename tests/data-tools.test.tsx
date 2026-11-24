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
import { DataTools } from "@/features/backup/data-tools";
import { createBackup, MAX_BACKUP_BYTES } from "@/features/backup/format";
import { restoreBackup } from "@/app/actions/domain";
import { loadAccountData } from "@/features/backup/load-account-data";
import { backupFixture } from "./backup-fixture";

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/actions/domain", () => ({ restoreBackup: vi.fn() }));
vi.mock("@/features/backup/load-account-data", () => ({
  loadAccountData: vi.fn(),
}));

const data = backupFixture();

function renderTools() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DataTools userId="test-user" locale="en" />
    </NextIntlClientProvider>,
  );
}

function backupFile() {
  const content = JSON.stringify(createBackup(data));
  const file = new File([content], "planora-backup-v4.json", {
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
  let downloadClick: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:planora"),
        revokeObjectURL: vi.fn(),
      }),
    );
    // JSDOM does not implement navigation triggered by programmatic download
    // links. Intercept every download in this suite so it cannot enqueue a
    // navigation after the test has finished.
    downloadClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    vi.mocked(restoreBackup).mockReset().mockResolvedValue({});
    vi.mocked(loadAccountData)
      .mockReset()
      .mockResolvedValue({ ...data, profile: data.profile! });
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
    expect(loadAccountData).not.toHaveBeenCalled();
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
    expect(
      await screen.findByText(/choose a complete JSON backup/i),
    ).toBeVisible();

    const oversized = backupFile();
    Object.defineProperty(oversized, "size", { value: MAX_BACKUP_BYTES + 1 });
    fireEvent.change(screen.getByLabelText("Select a Planora backup"), {
      target: { files: [oversized] },
    });
    expect(
      await screen.findByText(/exceeds the 5 MiB restore limit/i),
    ).toBeVisible();
    expect(oversized.text).not.toHaveBeenCalled();
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
    expect(within(dialog).getByText("planora-backup-v4.json")).toBeVisible();
    expect(within(dialog).getByText("Format version")).toBeVisible();
    expect(within(dialog).getByText(/will be removed/i)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(restoreBackup).not.toHaveBeenCalled();
  });

  it("downloads a safety copy and restores exactly once on a double click", async () => {
    const user = userEvent.setup();
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
    expect(downloadClick).toHaveBeenCalledOnce();
    expect(
      await screen.findByText(/previous data was replaced/i),
    ).toBeVisible();
  });

  it("shows an unconfirmed result in the open dialog if the response is lost", async () => {
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
      await within(screen.getByRole("alertdialog")).findByText(
        /could not confirm the restore/i,
      ),
    ).toBeVisible();
  });

  it.each(["clear", "replace"])(
    "ignores a late file read after %s",
    async (action) => {
      renderTools();
      let finish!: (value: string) => void;
      const first = new File(["first"], "slow.json");
      Object.defineProperty(first, "text", {
        value: () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      });
      const picker = screen.getByLabelText("Select a Planora backup");
      fireEvent.change(picker, { target: { files: [first] } });
      if (action === "clear") {
        fireEvent.click(
          screen.getByRole("button", { name: "Remove slow.json" }),
        );
      } else {
        const second = new File(["newer"], "future.json");
        Object.defineProperty(second, "text", {
          value: async () =>
            JSON.stringify({ format: "planora-backup", schemaVersion: 99 }),
        });
        fireEvent.change(picker, { target: { files: [second] } });
        await screen.findByText(/newer version/i);
      }
      await act(async () => {
        finish(JSON.stringify(createBackup(data)));
      });
      expect(
        screen.getByRole("button", { name: "Restore backup" }),
      ).toBeDisabled();
      expect(screen.queryByText(/Compatible backup\./)).toBeNull();
    },
  );

  it("keeps the selected backup available to retry if the safety copy cannot be read", async () => {
    const user = userEvent.setup();
    vi.mocked(loadAccountData).mockRejectedValueOnce(new Error("offline"));
    renderTools();
    await selectValidBackup();
    await user.click(screen.getByRole("button", { name: "Restore backup" }));
    const dialog = within(screen.getByRole("alertdialog"));
    const confirm = dialog.getByRole("button", {
      name: "Restore and replace data",
    });
    await user.click(confirm);
    expect(await dialog.findByText(/restore has not started/i)).toBeVisible();
    expect(restoreBackup).not.toHaveBeenCalled();
    expect(downloadClick).not.toHaveBeenCalled();
    await user.click(confirm);
    await screen.findByText(/previous data was replaced/i);
    expect(loadAccountData).toHaveBeenCalledTimes(2);
    expect(restoreBackup).toHaveBeenCalledWith(
      expect.objectContaining({ format: "planora-backup" }),
      "test-user",
    );
  });

  it("names the full JSON backup for its current schema version", async () => {
    const user = userEvent.setup();
    renderTools();
    await user.click(screen.getByRole("button", { name: "Download JSON" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
    expect(downloadClick).toHaveBeenCalledOnce();
    expect(
      (downloadClick.mock.instances[0] as HTMLAnchorElement).download,
    ).toBe("planora-backup-v5.json");
    expect(await screen.findByText("Your download is ready.")).toBeVisible();
  });
});
