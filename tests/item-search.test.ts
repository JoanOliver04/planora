import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useItemSearch } from "@/lib/workspace/use-item-search";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

afterEach(() => window.history.replaceState(null, "", "/"));

it("keeps older text links editable and starts normal visits without a filter", () => {
  window.history.replaceState(null, "", "/tasks?q=Original");
  const { result, rerender } = renderHook(() => useItemSearch([]));
  expect(result.current).toMatchObject({
    query: "Original",
    selectedId: null,
    fromLink: true,
  });
  act(() => result.current.setQuery("New query"));
  expect(result.current.query).toBe("New query");
  window.history.replaceState(null, "", "/tasks");
  rerender();
  expect(result.current).toMatchObject({
    query: "",
    selectedId: null,
    fromLink: false,
  });
});

it("retains the selected ID when rows arrive late and releases it when the user clears the filter", () => {
  window.history.replaceState(null, "", "/events?item=two");
  const { result, rerender } = renderHook(({ items }) => useItemSearch(items), {
    initialProps: { items: [] as { id: string; title: string }[] },
  });
  expect(result.current).toMatchObject({
    query: "",
    selectedId: "two",
    fromLink: true,
  });
  rerender({
    items: [
      { id: "one", title: "Duplicate" },
      { id: "two", title: "Duplicate" },
    ],
  });
  expect(result.current).toMatchObject({
    query: "Duplicate",
    selectedId: "two",
  });
  act(() => result.current.setQuery(""));
  expect(result.current).toMatchObject({ query: "", selectedId: null });
});
