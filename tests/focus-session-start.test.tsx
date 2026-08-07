import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messagesEs from "@/messages/es.json";
import messagesEn from "@/messages/en.json";
import { SessionStartDialog } from "@/features/focus/session-start-dialog";
import { createStartedSession } from "@/features/focus/state-machine";
import type { FocusSession } from "@/features/focus/types";

const startFocusSessionAction = vi.fn();
const transitionFocusSessionAction = vi.fn();
const refresh = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastMessage = vi.fn();

vi.mock("@/features/focus/actions", () => ({
  startFocusSessionAction: (...args: unknown[]) =>
    startFocusSessionAction(...args),
  transitionFocusSessionAction: (...args: unknown[]) =>
    transitionFocusSessionAction(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
    message: (...args: unknown[]) => toastMessage(...args),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  startFocusSessionAction.mockReset();
  transitionFocusSessionAction.mockReset();
});

function renderDialog(
  props: Partial<React.ComponentProps<typeof SessionStartDialog>> = {},
  locale: "es" | "en" = "es",
) {
  const messages = locale === "es" ? messagesEs : messagesEn;
  const onOpenChange = props.onOpenChange ?? vi.fn();
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SessionStartDialog
        open
        onOpenChange={onOpenChange}
        activeSession={null}
        presets={[]}
        tasks={[]}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

function activeSession(): FocusSession {
  return createStartedSession(
    {
      mode: "countdown",
      focusDurationSec: 1500,
      title: "Existing",
    },
    "user-1",
    {
      now: Date.parse("2026-08-07T10:00:00.000Z"),
      sessionId: "active-1",
      intervalId: "int-1",
      createId: () => "x",
    },
  );
}

describe("Focus session configurator", () => {
  it("starts a countdown session", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onStarted = vi.fn();
    const session = activeSession();
    startFocusSessionAction.mockResolvedValue({ ok: true, data: session });

    renderDialog({
      onOpenChange,
      onStarted,
      draft: { mode: "countdown", focusDurationSec: 25 * 60 },
    });

    await user.click(screen.getByRole("button", { name: "Empezar" }));

    await waitFor(() => {
      expect(startFocusSessionAction).toHaveBeenCalledTimes(1);
    });
    expect(startFocusSessionAction).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "countdown",
        focusDurationSec: 25 * 60,
        completeTaskOnEnd: false,
      }),
    );
    expect(onStarted).toHaveBeenCalledWith(session);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toastSuccess).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("starts a stopwatch without required duration", async () => {
    const user = userEvent.setup();
    startFocusSessionAction.mockResolvedValue({
      ok: true,
      data: activeSession(),
    });

    renderDialog({ draft: { mode: "stopwatch", focusDurationSec: null } });
    await user.click(screen.getByLabelText(/Cronómetro/i));
    await user.clear(screen.getByLabelText(/Meta opcional/i));
    await user.click(screen.getByRole("button", { name: "Empezar" }));

    await waitFor(() => {
      expect(startFocusSessionAction).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "stopwatch",
          focusDurationSec: null,
        }),
      );
    });
  });

  it("starts cycles with short break configuration", async () => {
    const user = userEvent.setup();
    startFocusSessionAction.mockResolvedValue({
      ok: true,
      data: activeSession(),
    });

    renderDialog({
      draft: {
        mode: "cycles",
        focusDurationSec: 25 * 60,
        shortBreakSec: 5 * 60,
        targetCycles: 4,
      },
    });

    await user.click(screen.getByRole("button", { name: "Empezar" }));

    await waitFor(() => {
      expect(startFocusSessionAction).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "cycles",
          focusDurationSec: 1500,
          shortBreakSec: 300,
          targetCycles: 4,
        }),
      );
    });
  });

  it("rejects invalid durations before calling the server", async () => {
    const user = userEvent.setup();
    renderDialog({ draft: { mode: "countdown", focusDurationSec: 25 * 60 } });

    const minutes = screen.getByLabelText(/Minutos de enfoque/i);
    await user.clear(minutes);
    await user.type(minutes, "0");
    await user.click(screen.getByRole("button", { name: "Empezar" }));

    expect(startFocusSessionAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/al menos 1 minuto/i);
  });

  it("ignores double submit while a start is pending", async () => {
    const user = userEvent.setup();
    let resolveStart: (value: unknown) => void = () => undefined;
    startFocusSessionAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    );

    renderDialog({ draft: { mode: "countdown", focusDurationSec: 1500 } });
    const startButton = screen.getByRole("button", { name: "Empezar" });
    await user.click(startButton);
    await user.click(startButton);

    expect(startFocusSessionAction).toHaveBeenCalledTimes(1);
    resolveStart({ ok: true, data: activeSession() });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it("blocks starting when an active session already exists", async () => {
    renderDialog({ activeSession: activeSession() });

    expect(screen.getByText(/Ya tienes una sesión activa/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Continuar sesión/i }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Empezar" })).toBeNull();
  });

  it("surfaces network errors without closing the dialog", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    startFocusSessionAction.mockResolvedValue({
      ok: false,
      error: { code: "DATABASE_ERROR", message: "Unable to create" },
    });

    renderDialog({
      onOpenChange,
      draft: { mode: "countdown", focusDurationSec: 1500 },
    });
    await user.click(screen.getByRole("button", { name: "Empezar" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("renders English copy for the configurator", () => {
    renderDialog(
      { draft: { mode: "countdown", focusDurationSec: 1500 } },
      "en",
    );
    expect(
      screen.getByRole("heading", { name: "New Focus session" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Start" })).toBeVisible();
  });
});
