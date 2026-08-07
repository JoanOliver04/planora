import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { templateCatalog } from "@/features/templates/catalog";
import { TemplateGallery } from "@/features/templates/template-gallery";

vi.mock("@/app/actions/domain", () => ({
  importTemplate: vi.fn(),
  savePersonalTemplate: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("schedule templates", () => {
  it("offers all six required reusable presets", () => {
    expect(templateCatalog.map((item) => item.id)).toEqual([
      "studies",
      "exercise",
      "shifts",
      "exams",
      "wellbeing",
      "holidays",
    ]);
    expect(templateCatalog.every((item) => item.categories.length > 0)).toBe(
      true,
    );
    expect(templateCatalog.every((item) => item.tasks.length > 0)).toBe(true);
  });

  it("previews content and allows a selective import", () => {
    render(
      <TemplateGallery
        locale="es"
        personal={[]}
        schedules={[{ id: "schedule-1", name: "Normal", emoji: "🌿" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Estudios/i }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText(/Revisar apuntes/)).toBeVisible();
    const tasks = screen.getByRole("checkbox", { name: "Tareas" });
    fireEvent.click(tasks);
    expect(tasks).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Importar selección" }),
    ).toBeEnabled();
  });
});
