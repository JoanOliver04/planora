import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/es.json";
import { AppNavigation } from "@/components/navigation";
import {
  desktopNavigationItems,
  isNavigationItemActive,
  mobileNavigationItems,
  moreNavigationItems,
} from "@/config/navigation";

const routing = vi.hoisted(() => ({ pathname: "/today" }));

vi.mock("@/i18n/routing", () => ({
  usePathname: () => routing.pathname,
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  routing.pathname = "/today";
});

function renderNavigation(variant: "mobile" | "desktop") {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <nav>
        <AppNavigation variant={variant} />
      </nav>
    </NextIntlClientProvider>,
  );
}

describe("main navigation", () => {
  it("uses exactly five mobile destinations and replaces Settings with More", () => {
    renderNavigation("mobile");
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["/today", "/week", "/tasks", "/events", "/more"]);
    expect(screen.getByRole("link", { name: "Más" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Ajustes" })).toBeNull();
  });

  it("keeps all thirteen direct destinations in the desktop sidebar", () => {
    renderNavigation("desktop");
    expect(screen.getAllByRole("link")).toHaveLength(13);
    expect(screen.getByRole("link", { name: "Enfoque" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Categorías" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Plantillas" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Tus datos" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Más" })).toBeNull();
  });

  it("places Focus after Tasks in the desktop sidebar order", () => {
    const ids = desktopNavigationItems.map((item) => item.id);
    expect(ids.indexOf("tasks")).toBeLessThan(ids.indexOf("focus"));
    expect(ids.indexOf("focus")).toBeLessThan(ids.indexOf("events"));
  });

  it("gives every desktop route a mobile entry point", () => {
    const reachable = new Set([
      ...mobileNavigationItems.map((item) => item.id),
      ...moreNavigationItems.map((item) => item.id),
    ]);
    expect(desktopNavigationItems.every((item) => reachable.has(item.id))).toBe(
      true,
    );
    expect(moreNavigationItems.map((item) => item.id)).toEqual([
      "history",
      "schedules",
      "settings",
      "focus",
      "categories",
      "data",
      "statistics",
      "templates",
      "reminders",
    ]);
  });

  it.each([
    "/statistics",
    "/reminders",
    "/data",
    "/focus",
    "/es/settings/profile",
  ])("keeps More active on %s", (pathname) => {
    routing.pathname = pathname;
    renderNavigation("mobile");
    expect(screen.getByRole("link", { name: "Más" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("matches nested routes without partial-route collisions", () => {
    expect(isNavigationItemActive("tasks", "/en/tasks/new")).toBe(true);
    expect(isNavigationItemActive("events", "/en/eventual")).toBe(false);
    expect(isNavigationItemActive("more", "/en/more")).toBe(true);
  });
});
