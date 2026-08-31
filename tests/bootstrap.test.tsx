import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BootstrapRecovery } from "@/components/bootstrap-recovery";
import { PrivateBootstrapFallback } from "@/components/private-bootstrap-fallback";
import {
  decideBootstrapPhase,
  bootstrapIsTerminal,
} from "@/lib/bootstrap/phase";
import {
  TimeoutError,
  isTimeoutError,
  withTimeout,
} from "@/lib/bootstrap/timeout";
import messages from "@/messages/es.json";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function facts(
  overrides: Partial<Parameters<typeof decideBootstrapPhase>[0]> = {},
) {
  return decideBootstrapPhase({
    settled: false,
    timedOut: false,
    online: true,
    hasSession: false,
    authError: false,
    hasFreshData: false,
    hasCache: false,
    requestFailed: false,
    ...overrides,
  });
}

describe("bootstrap phase machine", () => {
  it("stays loading until auth or data settles", () => {
    expect(facts()).toBe("loading");
    expect(bootstrapIsTerminal("loading")).toBe(false);
  });

  it("opens an authenticated workspace from a live session", () => {
    expect(
      facts({
        settled: true,
        hasSession: true,
        hasFreshData: true,
      }),
    ).toBe("authenticated");
  });

  it("treats a missing session as unauthenticated, not loading", () => {
    expect(facts({ settled: true, hasSession: false })).toBe("unauthenticated");
  });

  it("does not block on a missing Supabase session when a cache exists", () => {
    expect(
      facts({
        settled: true,
        hasSession: false,
        authError: true,
        hasCache: true,
      }),
    ).toBe("authenticated");
  });

  it("marks the start as offline instead of spinning", () => {
    expect(facts({ settled: true, online: false })).toBe("offline");
    expect(facts({ timedOut: true, online: false })).toBe("offline");
  });

  it("surfaces slow or failed bootstrap as a recoverable error", () => {
    expect(facts({ settled: true, timedOut: true, hasSession: true })).toBe(
      "recoverable_error",
    );
    expect(
      facts({ settled: true, hasSession: true, requestFailed: true }),
    ).toBe("recoverable_error");
  });

  it("uses cache after a request failure instead of staying on the splash", () => {
    expect(
      facts({
        settled: true,
        hasSession: true,
        requestFailed: true,
        hasCache: true,
      }),
    ).toBe("authenticated");
  });

  it("keeps a timeout without a session recoverable, not unauthenticated", () => {
    expect(facts({ settled: true, timedOut: true })).toBe("recoverable_error");
  });

  it("reserves fatal for unrecoverable renderer failures", () => {
    expect(facts({ fatal: true })).toBe("fatal_error");
    expect(bootstrapIsTerminal("fatal_error")).toBe(true);
  });
});

describe("bootstrap timeouts", () => {
  it("rejects a promise that never settles", async () => {
    await expect(
      withTimeout(new Promise(() => undefined), 20),
    ).rejects.toBeInstanceOf(TimeoutError);
    expect(isTimeoutError(new TimeoutError())).toBe(true);
  });

  it("resolves when the work finishes in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });
});

describe("bootstrap recovery UI", () => {
  it("offers retry and reload without wiping local data copy", async () => {
    const retry = vi.fn();
    localStorage.setItem("planora-offline-completions-v1", "[1]");
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <BootstrapRecovery
          locale="es"
          phase="recoverable_error"
          code="timeout"
          onRetry={retry}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("heading", { name: /No se pudo abrir Planora/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Recargar aplicación" }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(localStorage.getItem("planora-offline-completions-v1")).toBe("[1]");
    localStorage.removeItem("planora-offline-completions-v1");
  });

  it("does not leave the branded loading fallback up forever", async () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <PrivateBootstrapFallback locale="es" watchdogMs={20} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByLabelText(/Cargando Planora/i)).toBeVisible();
    expect(
      await screen.findByRole("heading", { name: /No se pudo abrir Planora/i }),
    ).toBeVisible();
  });
});
