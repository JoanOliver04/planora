import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHashTarget } from "@/lib/workspace/use-hash-target";

describe("useHashTarget", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("reveals and focuses a target that appears after workspace loading", async () => {
    window.history.replaceState(null, "", "/tasks#task-123");
    const scrollIntoView = vi.fn();
    const target = document.createElement("article");
    target.id = "task-123";
    target.tabIndex = -1;
    target.scrollIntoView = scrollIntoView;
    document.body.append(target);

    const { rerender } = renderHook(({ readyKey }) => useHashTarget(readyKey), {
      initialProps: { readyKey: 0 },
    });

    act(() => rerender({ readyKey: 1 }));

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
      expect(document.activeElement).toBe(target);
    });
  });

  it("ignores malformed hashes without breaking the page", () => {
    window.history.replaceState(null, "", "/tasks#%E0%A4%A");
    expect(() => renderHook(() => useHashTarget(1))).not.toThrow();
  });

  it("keeps keyboard focus in a filter after the target has been revealed and follows a new hash", async () => {
    const first = document.createElement("button");
    first.id = "task-first";
    const second = document.createElement("button");
    second.id = "task-second";
    const field = document.createElement("input");
    first.scrollIntoView = vi.fn();
    second.scrollIntoView = vi.fn();
    document.body.append(first, second, field);
    window.history.replaceState(null, "", "/tasks#task-first");
    const { rerender } = renderHook(({ count }) => useHashTarget(count), {
      initialProps: { count: 2 },
    });
    await waitFor(() => expect(first).toHaveFocus());
    field.focus();
    rerender({ count: 3 });
    await act(async () => {
      await new Promise<void>((done) => requestAnimationFrame(() => done()));
    });
    expect(field).toHaveFocus();
    window.history.replaceState(null, "", "/tasks#task-second");
    window.dispatchEvent(new Event("hashchange"));
    await waitFor(() => expect(second).toHaveFocus());
  });
});
