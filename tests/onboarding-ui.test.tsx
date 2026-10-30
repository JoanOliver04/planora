import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuidedOnboarding } from "@/features/onboarding/onboarding";
import {
  activateClientSession,
  revokeClientSession,
} from "@/lib/security/client-session";

const complete = vi.fn();
vi.mock("@/app/actions/domain", () => ({
  completeGuidedOnboarding: (...args: unknown[]) => complete(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("GuidedOnboarding", () => {
  beforeEach(() => {
    activateClientSession("onboarding-user");
    localStorage.clear();
    complete.mockReset();
  });

  it("selects a goal, configures it and advances through the tour", async () => {
    render(<GuidedOnboarding locale="es" />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Mi curso/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Personalizar mi espacio/i }),
    );
    expect(screen.getByDisplayValue("Mi curso")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver guía rápida/i }));
    expect(screen.getByRole("heading", { name: "Hoy primero" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/i }));
    expect(
      screen.getByRole("heading", { name: "Tu semana completa" }),
    ).toBeVisible();
  });

  it("restores a safely persisted draft", async () => {
    localStorage.setItem(
      "planora-onboarding-v1",
      JSON.stringify({
        step: 1,
        goal: "work",
        name: "Turno de tarde",
        weekStart: 1,
        accent: "#315f78",
        tour: 0,
      }),
    );
    render(<GuidedOnboarding locale="es" />);
    await act(async () => {});
    expect(screen.getByDisplayValue("Turno de tarde")).toBeVisible();
  });

  it("does not recreate a cleared draft from a stale mounted form", async () => {
    render(<GuidedOnboarding locale="es" />);
    await act(async () => {});
    revokeClientSession("onboarding-user");
    localStorage.removeItem("planora-onboarding-v1");
    activateClientSession("onboarding-user");
    fireEvent.click(screen.getByRole("button", { name: /Mi curso/i }));
    expect(localStorage.getItem("planora-onboarding-v1")).toBeNull();
  });
});
