import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messagesEs from "@/messages/es.json";
import { FocusSessionProvider } from "@/features/focus/focus-session-context";
import { ActiveSessionView } from "@/features/focus/active-session-view";
import { FocusCompactBar } from "@/features/focus/focus-compact-bar";
import { createStartedSession } from "@/features/focus/state-machine";
import type { FocusSession } from "@/features/focus/types";

const routing = vi.hoisted(() => ({ pathname: "/today" }));

vi.mock("@/i18n/routing", () => ({
  usePathname: () => routing.pathname,
  Link: ({
    href,
    children,
    ...props
  }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/features/focus/actions", () => ({
  startFocusSessionAction: vi.fn(async () => ({
    ok: false,
    error: { code: "DATABASE_ERROR", message: "n/a" },
  })),
  transitionFocusSessionAction: vi.fn(async () => ({
    ok: false,
    error: { code: "DATABASE_ERROR", message: "offline" },
  })),
  updateFocusSessionMetadataAction: vi.fn(async () => ({
    ok: true,
    data: {},
  })),
}));

vi.mock("sonner", () => ({
  toast: { message: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

afterEach(() => {
  cleanup();
  routing.pathname = "/today";
});

function activeSession(): FocusSession {
  return createStartedSession(
    {
      mode: "countdown",
      focusDurationSec: 25 * 60,
      title: "Piano practice",
    },
    "user-1",
    {
      now: Date.now(),
      sessionId: "sess-active",
      intervalId: "int-active",
      createId: () => "gen",
    },
  );
}

function renderWithSession(
  ui: React.ReactNode,
  session: FocusSession | null = activeSession(),
) {
  return render(
    <NextIntlClientProvider locale="es" messages={messagesEs}>
      <FocusSessionProvider initialSession={session}>{ui}</FocusSessionProvider>
    </NextIntlClientProvider>,
  );
}

describe("Focus active session UI", () => {
  it("renders the premium active view with phase, time and controls", () => {
    renderWithSession(<ActiveSessionView />);
    expect(screen.getByText("Sesión activa")).toBeVisible();
    expect(screen.getByText("Piano practice")).toBeVisible();
    expect(screen.getByRole("button", { name: /Pausar/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /Terminar/i })).toBeVisible();
    expect(
      screen.getByRole("progressbar", { name: /Progreso de la fase/i }),
    ).toBeVisible();
    expect(screen.getByText(/Atajos:/i)).toBeVisible();
  });

  it("opens the secondary menu for cancel and note actions", async () => {
    const user = userEvent.setup();
    renderWithSession(<ActiveSessionView />);
    await user.click(screen.getByRole("button", { name: /Más acciones/i }));
    expect(screen.getByRole("menuitem", { name: /Nota rápida/i })).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: /Cancelar sesión/i }),
    ).toBeVisible();
  });

  it("shows the compact bar outside the Focus route", () => {
    routing.pathname = "/today";
    renderWithSession(<FocusCompactBar />);
    expect(screen.getByText("Sesión activa")).toBeVisible();
    expect(screen.getByRole("link", { name: /Volver a Enfoque/i })).toHaveAttribute(
      "href",
      "/focus",
    );
    expect(screen.getByRole("button", { name: /Pausar/i })).toBeVisible();
  });

  it("hides the compact bar on the Focus route", () => {
    routing.pathname = "/focus";
    renderWithSession(<FocusCompactBar />);
    expect(screen.queryByRole("link", { name: /Volver a Enfoque/i })).toBeNull();
  });

  it("hides compact bar when there is no active session", () => {
    routing.pathname = "/tasks";
    renderWithSession(<FocusCompactBar />, null);
    expect(screen.queryByText("Sesión activa")).toBeNull();
  });
});
