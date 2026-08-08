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

    const { rerender } = renderHook(
      ({ readyKey }) => useHashTarget(readyKey),
      { initialProps: { readyKey: 0 } },
    );

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
});
