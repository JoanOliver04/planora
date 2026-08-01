import { cleanup, render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("button", { name: "Reordenar Primera" })).toHaveAttribute(
      "aria-roledescription",
      "sortable",
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
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
});
