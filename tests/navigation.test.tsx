import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/es.json";
import { AppNavigation } from "@/components/navigation";

afterEach(cleanup);

vi.mock("@/i18n/routing", () => ({
  usePathname: () => "/today",
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

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
  it("keeps five reachable mobile destinations", () => {
    renderNavigation("mobile");
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("link", { name: /Tareas/i })).toHaveAttribute(
      "href",
      "/tasks",
    );
  });

  it("exposes all management areas on desktop", () => {
    renderNavigation("desktop");
    expect(screen.getAllByRole("link")).toHaveLength(11);
    expect(screen.getByRole("link", { name: "Categorías" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Plantillas" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Estadísticas" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Recordatorios" })).toBeVisible();
  });
});
