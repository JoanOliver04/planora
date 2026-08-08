import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { FocusTodayShortcuts } from "@/features/focus/focus-today-shortcuts";

vi.mock("@/i18n/routing", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/focus/focus-session-context", () => ({
  useOptionalFocusSessionContext: () => null,
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("FocusTodayShortcuts", () => {
  it("renders from an empty stable external-store snapshot", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FocusTodayShortcuts
          day="2026-08-08"
          tasks={[]}
          completedTaskIds={new Set()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Quick start" })).toHaveAttribute(
      "href",
      "/focus?start=quick",
    );
  });

  it("keeps shortcuts available when browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage disabled", "SecurityError");
    });

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FocusTodayShortcuts
          day="2026-08-08"
          tasks={[]}
          completedTaskIds={new Set()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Quick start" })).toBeVisible();
  });
});
