import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messagesEs from "@/messages/es.json";
import messagesEn from "@/messages/en.json";
import { FocusHome } from "@/features/focus/focus-home";
import type { FocusSession } from "@/features/focus/types";
import { createStartedSession } from "@/features/focus/state-machine";
import { existsSync } from "node:fs";
import { join } from "node:path";

const toastMessage = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    message: (...args: unknown[]) => toastMessage(...args),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/features/focus/actions", () => ({
  startFocusSessionAction: vi.fn(async () => ({
    ok: false,
    error: { code: "DATABASE_ERROR", message: "not used" },
  })),
  transitionFocusSessionAction: vi.fn(async () => ({
    ok: false,
    error: { code: "DATABASE_ERROR", message: "offline in test" },
  })),
  updateFocusSessionMetadataAction: vi.fn(async () => ({
    ok: true,
    data: {},
  })),
  completeLinkedTaskFromFocusAction: vi.fn(async () => ({
    ok: false,
    error: { code: "DATABASE_ERROR", message: "not used" },
  })),
  discardFocusSessionAction: vi.fn(async () => ({
    ok: true,
    data: { id: "discarded" },
  })),
  saveFocusPresetAction: vi.fn(async () => ({
    ok: false,
    error: { code: "DATABASE_ERROR", message: "not used" },
  })),
  duplicateFocusPresetAction: vi.fn(async () => ({
    ok: false,
    error: { code: "DATABASE_ERROR", message: "not used" },
  })),
  setFocusPresetArchivedAction: vi.fn(async () => ({
    ok: false,
    error: { code: "DATABASE_ERROR", message: "not used" },
  })),
  deleteFocusPresetAction: vi.fn(async () => ({
    ok: false,
    error: { code: "DATABASE_ERROR", message: "not used" },
  })),
  reorderFocusPresetsAction: vi.fn(async () => ({
    ok: true,
    data: { count: 0 },
  })),
  toggleFocusPresetFavoriteAction: vi.fn(async () => ({
    ok: false,
    error: { code: "DATABASE_ERROR", message: "not used" },
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/app/actions/domain", () => ({
  saveTask: vi.fn(),
}));

afterEach(() => {
  cleanup();
  toastMessage.mockReset();
});

function renderHome(
  props: Partial<React.ComponentProps<typeof FocusHome>> = {},
  locale: "es" | "en" = "es",
) {
  const messages = locale === "es" ? messagesEs : messagesEn;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <FocusHome
        activeSession={null}
        recentSessions={[]}
        presets={[]}
        goal={null}
        weekSessions={[]}
        timezone="Europe/Madrid"
        weekStartsOn={1}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

function sampleActiveSession(): FocusSession {
  // Start "now" so the engine does not treat the phase as already overdue.
  return createStartedSession(
    {
      mode: "countdown",
      focusDurationSec: 25 * 60,
      title: "Piano practice",
    },
    "user-1",
    {
      now: Date.now(),
      sessionId: "sess-1",
      intervalId: "int-1",
      createId: () => "x",
    },
  );
}

describe("Focus home shell", () => {
  it("renders the Spanish empty state with quick start actions", () => {
    renderHome();
    expect(
      screen.getByRole("heading", { name: "Enfoque", level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "Empieza tu primera sesión de Enfoque",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Sesión rápida/i }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: /Crear preset/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Pomodoro 25/5")).toBeVisible();
    expect(screen.getByText("Cronómetro libre")).toBeVisible();
    expect(screen.queryByText("Esta semana")).toBeNull();
  });

  it("renders the English title and empty copy", () => {
    renderHome({}, "en");
    expect(
      screen.getByRole("heading", { name: "Focus", level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "Start your first Focus session",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /Start session/i })).toBeVisible();
  });

  it("prioritises the active session card with engine controls", () => {
    const active = sampleActiveSession();
    renderHome({ activeSession: active });

    expect(screen.getByText("Sesión activa")).toBeVisible();
    expect(screen.getByText("Piano practice")).toBeVisible();
    expect(screen.getByRole("button", { name: /Pausar|Reanudar/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /Terminar/i })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /^Iniciar sesión$/i }),
    ).toBeNull();
  });

  it("opens the configurator from the primary start action", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole("button", { name: /Iniciar sesión/i }));
    expect(
      screen.getByRole("heading", { name: "Nueva sesión de Enfoque" }),
    ).toBeVisible();
  });

  it("shows recent sessions and weekly summary when history exists", () => {
    const completed = {
      ...sampleActiveSession(),
      id: "done-1",
      status: "completed" as const,
      endedAt: "2026-08-07T10:20:00.000Z",
      focusSec: 20 * 60,
      currentPhaseKind: null,
      intervals: [],
    };
    renderHome({
      recentSessions: [completed],
      weekSessions: [completed],
    });
    expect(screen.getByText("Últimas sesiones")).toBeVisible();
    expect(screen.getByText("Esta semana")).toBeVisible();
    expect(
      screen.queryByRole("heading", {
        name: "Empieza tu primera sesión de Enfoque",
      }),
    ).toBeNull();
  });

  it("exposes the localized App Router page for ES and EN", () => {
    expect(
      existsSync(
        join(process.cwd(), "src/app/[locale]/(app)/focus/page.tsx"),
      ),
    ).toBe(true);
  });
});
