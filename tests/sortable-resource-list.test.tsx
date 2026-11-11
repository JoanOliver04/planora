import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  moveResourceIds,
  SortableResourceList,
} from "@/components/sortable-resource-list";

const items = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Primera" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Segunda" },
];

describe("SortableResourceList", () => {
  afterEach(cleanup);
  it("exposes keyboard-accessible drag handles", () => {
    render(
      <SortableResourceList
        items={items}
        locale="es"
        getLabel={(item) => item.name}
        renderItem={(item) => <span>{item.name}</span>}
        onCommit={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Reordenar Primera" }),
    ).toHaveAttribute("aria-roledescription", "sortable");
    expect(screen.getAllByRole("button", { name: /^Reordenar/ })).toHaveLength(
      2,
    );
  });

  it("calculates the persisted order without dropping ids", () => {
    expect(
      moveResourceIds(
        items.map((item) => item.id),
        items[0].id,
        items[1].id,
      ),
    ).toEqual([items[1].id, items[0].id]);
  });
  it("moves with clicks and rolls back a failed save without accepting a racing move", async () => {
    let reject!: (error: Error) => void;
    const commit = vi.fn(
      () =>
        new Promise<void>((_, failed) => {
          reject = failed;
        }),
    );
    const error = vi.fn();
    const { container } = render(
      <SortableResourceList
        items={items}
        locale="es"
        getLabel={(item) => item.name}
        renderItem={(item) => <span>{item.name}</span>}
        onCommit={commit}
        onError={error}
      />,
    );
    const menu = screen
      .getByLabelText("Cambiar posición de Segunda")
      .closest("details")!;
    menu.open = true;
    // Safari can blur the summary without focusing the button being tapped.
    fireEvent.blur(menu.querySelector("summary")!, { relatedTarget: null });
    expect(menu.open).toBe(true);
    fireEvent.click(within(menu).getByRole("button", { name: "Subir" }));
    expect(commit).toHaveBeenCalledExactlyOnceWith([items[1].id, items[0].id]);
    expect(
      container.querySelectorAll(".sortable-content")[0],
    ).toHaveTextContent("Segunda");
    expect(
      screen.getByRole("button", { name: "Reordenar Primera" }),
    ).toBeDisabled();
    await act(async () => reject(new Error("save failed")));
    expect(error).toHaveBeenCalledOnce();
    expect(
      container.querySelectorAll(".sortable-content")[0],
    ).toHaveTextContent("Primera");
  });
  it("accepts a newly received order from another device", () => {
    const props = {
      locale: "es" as const,
      getLabel: (item: (typeof items)[number]) => item.name,
      renderItem: (item: (typeof items)[number]) => <span>{item.name}</span>,
      onCommit: vi.fn(),
      onError: vi.fn(),
    };
    const { container, rerender } = render(
      <SortableResourceList {...props} items={items} />,
    );
    rerender(<SortableResourceList {...props} items={[...items].reverse()} />);
    expect(
      container.querySelectorAll(".sortable-content")[0],
    ).toHaveTextContent("Segunda");
  });
});
