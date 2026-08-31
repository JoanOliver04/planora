import { describe, expect, it, vi } from "vitest";
import { fetchAllRows } from "@/lib/backup/fetch-all";

describe("backup export paging", () => {
  it("walks every page until a short result", async () => {
    const pages = [
      Array.from({ length: 1000 }, (_, index) => ({ id: index })),
      [{ id: 1000 }],
    ];
    const loadPage = vi.fn(async (from: number) => {
      const page = from === 0 ? pages[0] : pages[1];
      return { data: page, error: null };
    });
    const rows = await fetchAllRows(loadPage);
    expect(rows).toHaveLength(1001);
    expect(loadPage).toHaveBeenCalledTimes(2);
  });

  it("stops when a page is smaller than the limit", async () => {
    const rows = await fetchAllRows(async () => ({
      data: [{ id: "only" }],
      error: null,
    }));
    expect(rows).toEqual([{ id: "only" }]);
  });
});
